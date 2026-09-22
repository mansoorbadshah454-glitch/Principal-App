import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
    Calendar, Users, AlertCircle, CheckCircle2, XCircle, Search, 
    ChevronRight, ArrowLeft, Send, Phone, DollarSign, Download, 
    RefreshCw, Filter, ShieldCheck, ChevronDown, ChevronUp, Copy,
    Check, Sparkles, TrendingUp, AlertTriangle, UserX, Clock,
    Lock, Plus, Trash2, ExternalLink, BookOpen, Bus, ShoppingBag, Award, Edit,
    Eye, Printer, X, FileText
} from 'lucide-react';
import { db } from '../firebase';
import { 
    collection, onSnapshot, query, doc, updateDoc, setDoc, 
    serverTimestamp, arrayUnion, addDoc, writeBatch
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from './CachedImage';
import {
    MONTH_NAMES,
    MONTH_SHORT,
    formatPKR,
    getStudentMonthFinancialStatus,
    parseStudentPaidMonthsSet as parseStudentPaidMonthsSetPipeline,
    calculateItemizedFeeBreakdown as calculateItemizedFeeBreakdownPipeline,
    checkIs100PercentFree
} from '../utils/feePipeline';
import {
    cacheStudentsOffline,
    getCachedStudentsOffline,
    enqueueOfflineFeeTransaction
} from '../utils/offlineFeeEngine';

export { MONTH_NAMES, MONTH_SHORT, formatPKR };

// Helper: Clean & Shorten Store / Action names from long raw text
export const cleanFeeItemName = (rawName) => {
    if (!rawName) return 'Special Charges';
    let clean = String(rawName);
    // Remove receipt codes like (STORE-20260909-4117), (STORE-...), (REC-...)
    clean = clean.replace(/\(STORE-[^)]+\)/gi, '');
    clean = clean.replace(/\(REC-[^)]+\)/gi, '');
    clean = clean.replace(/\(Action\)/gi, '');
    // Remove repeated prefixes
    clean = clean.replace(/Store:\s*/gi, '');
    clean = clean.replace(/Store\/Uniform\s*/gi, 'Uniform ');
    // Remove [Size ...] tags
    clean = clean.replace(/\[Size\s*[^\]]+\]/gi, '');
    // Normalize spaces and commas
    clean = clean.replace(/\s+/g, ' ');
    clean = clean.replace(/,\s*,+/g, ',');
    clean = clean.trim().replace(/^,\s*|,\s*$/g, '');

    // If multiple items, make it clean and concise
    const parts = clean.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 2) {
        return `${parts[0]}, ${parts[1]} (+${parts.length - 2} more)`;
    } else if (parts.length === 2) {
        return `${parts[0]} & ${parts[1]}`;
    }
    
    // Shorten if still overly verbose
    if (clean.length > 40) {
        return clean.slice(0, 38) + '...';
    }
    return clean || 'Store & Actions';
};

// 100% Offline Professional Student Fee Card PDF Generator
export const downloadStudentFeeCardPDF = (feeCardData, schoolInfo) => {
    try {
        const { student, breakdown, isPaid, targetMonthName, targetYear, feeSettings } = feeCardData;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const primaryColor = [79, 70, 229]; // #4f46e5 (Indigo)
        const darkColor = [15, 23, 42];     // #0f172a (Slate-900)
        const grayColor = [100, 116, 139];  // #64748b (Slate-500)
        const greenColor = [16, 185, 129];  // #10b981 (Emerald)
        const redColor = [225, 29, 72];     // #e11d48 (Rose)

        // Top decorative accent bar
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, 210, 6, 'F');

        // 1. School Header
        const schoolName = (schoolInfo?.name || schoolInfo?.schoolName || 'ACADEMIC EXCELLENCE MODEL SCHOOL').toUpperCase();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...darkColor);
        doc.text(schoolName, 14, 18);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        const schoolAddress = schoolInfo?.address || 'Main Campus, Pakistan';
        const schoolPhone = schoolInfo?.phone || schoolInfo?.contact || '+92 300 1234567';
        doc.text(`${schoolAddress} | Contact: ${schoolPhone}`, 14, 23);

        // Title Badge (Right-aligned Pill)
        doc.setFillColor(238, 242, 255); // #eef2ff
        doc.roundedRect(122, 11, 74, 15, 2, 2, 'F');
        doc.setDrawColor(199, 210, 254);
        doc.roundedRect(122, 11, 74, 15, 2, 2, 'S');

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryColor);
        doc.text('STUDENT MONTHLY FEE CARD', 159, 17, { align: 'center' });

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(`Month: ${targetMonthName || 'Current Month'} ${targetYear || 2026}`, 159, 22, { align: 'center' });

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(14, 29, 196, 29);

        // 2. Student & Meta Info Card
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 33, 182, 36, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, 33, 182, 36, 2, 2, 'S');

        // Column 1
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Student Name:', 18, 41);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(student.name || student.studentName || 'Student', 50, 41);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Father Name:', 18, 49);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(student.fatherName || '--', 50, 49);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Class & Section:', 18, 57);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryColor);
        doc.text(student.className || '--', 50, 57);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Roll Number:', 18, 64);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(String(student.rollNo || '--'), 50, 64);

        // Column 2
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Voucher No:', 115, 41);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        const voucherNo = `VCH-${targetYear || 2026}-${String(student.id || '000').slice(0, 6).toUpperCase()}`;
        doc.text(voucherNo, 145, 41);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Issue Date:', 115, 49);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(new Date().toLocaleDateString('en-GB'), 145, 49);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Due Date:', 115, 57);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(225, 29, 72);
        const dueDay = feeSettings?.dueDate || 10;
        doc.text(`${dueDay} ${targetMonthName || ''} ${targetYear || 2026}`, 145, 57);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Payment Status:', 115, 64);
        if (breakdown.is100PercentFree) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text('100% SCHOLARSHIP (FREE)', 145, 64);
        } else if (isPaid) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...greenColor);
            doc.text('PAID / CLEARED', 145, 64);
        } else {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...redColor);
            doc.text('UNPAID / OVERDUE', 145, 64);
        }

        // 3. Itemized Fee Table via jsPDF AutoTable
        const tableRows = [];
        let rowIdx = 1;

        // Base Tuition & Concession
        const concessionAmt = (breakdown.baseTuition || 0) - (breakdown.tuitionPayable || 0);
        tableRows.push([
            rowIdx++,
            'Monthly Tuition Fee',
            `PKR ${Number(breakdown.baseTuition || 0).toLocaleString()}`,
            breakdown.is100PercentFree ? '100% Scholarship (Free)' : (concessionAmt > 0 ? `- PKR ${concessionAmt.toLocaleString()}` : 'Nil'),
            `PKR ${Number(breakdown.tuitionPayable || 0).toLocaleString()}`
        ]);

        // Prior Overdue Arrears (if any)
        const arrearsVal = Number(breakdown.arrears || breakdown.previousArrears || 0);
        if (arrearsVal > 0) {
            tableRows.push([
                rowIdx++,
                `Previous Overdue Tuition (${breakdown.arrearsMonthsCount || breakdown.previousMonthsCount || 1} Mos)`,
                `PKR ${arrearsVal.toLocaleString()}`,
                'Nil',
                `PKR ${arrearsVal.toLocaleString()}`
            ]);
        }

        // Transport
        if (breakdown.transportFee > 0) {
            tableRows.push([
                rowIdx++,
                'Monthly Transport / Van Charges',
                `PKR ${Number(breakdown.transportFee).toLocaleString()}`,
                'Nil',
                `PKR ${Number(breakdown.transportFee).toLocaleString()}`
            ]);
        }

        // Store Dues
        if (breakdown.storeDues > 0) {
            tableRows.push([
                rowIdx++,
                'School Uniform & Store Purchases',
                `PKR ${Number(breakdown.storeDues).toLocaleString()}`,
                'Nil',
                `PKR ${Number(breakdown.storeDues).toLocaleString()}`
            ]);
        }

        // Action Fee / Fines (Itemized or Combined)
        if (Array.isArray(breakdown.customItems) && breakdown.customItems.length > 0) {
            breakdown.customItems.forEach(ci => {
                tableRows.push([
                    rowIdx++,
                    `Action: ${cleanFeeItemName(ci.title || ci.name)}`,
                    `PKR ${Number(ci.amount || 0).toLocaleString()}`,
                    'Nil',
                    `PKR ${Number(ci.amount || 0).toLocaleString()}`
                ]);
            });
        } else if (breakdown.actionFee > 0) {
            const cleanActionTitle = cleanFeeItemName(breakdown.actionName);
            tableRows.push([
                rowIdx++,
                `Individual Actions & Charges (${cleanActionTitle})`,
                `PKR ${Number(breakdown.actionFee).toLocaleString()}`,
                'Nil',
                `PKR ${Number(breakdown.actionFee).toLocaleString()}`
            ]);
        }

        // Late Penalty Fine
        if (breakdown.penaltyFine > 0) {
            tableRows.push([
                rowIdx++,
                'Late Fee Surcharge / Fine',
                `PKR ${Number(breakdown.penaltyFine).toLocaleString()}`,
                'Nil',
                `PKR ${Number(breakdown.penaltyFine).toLocaleString()}`
            ]);
        }

        autoTable(doc, {
            startY: 74,
            head: [['#', 'Fee Particulars & Description', 'Gross Amount', 'Concession / Waiver', 'Net Payable (PKR)']],
            body: tableRows,
            theme: 'grid',
            headStyles: {
                fillColor: [79, 70, 229],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8.5,
                halign: 'left'
            },
            bodyStyles: {
                fontSize: 8.5,
                textColor: [15, 23, 42]
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 72 },
                2: { cellWidth: 32, halign: 'right' },
                3: { cellWidth: 36, halign: 'center' },
                4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 14, right: 14 }
        });

        const finalY = doc.lastAutoTable.finalY + 6;

        // 4. Grand Total Summary Box
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(120, finalY, 76, 16, 2, 2, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(120, finalY, 76, 16, 2, 2, 'S');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('NET TOTAL PAYABLE:', 124, finalY + 6);

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(breakdown.is100PercentFree ? 79 : (isPaid ? 16 : 225), breakdown.is100PercentFree ? 70 : (isPaid ? 185 : 29), breakdown.is100PercentFree ? 229 : (isPaid ? 129 : 72));
        doc.text(`PKR ${Number(breakdown.totalPayable || 0).toLocaleString()}`, 192, finalY + 11, { align: 'right' });

        // Terms & Instructions (Left)
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('Important Instructions:', 14, finalY + 4);
        doc.text('1. Fee must be deposited by the due date to avoid late fine surcharges.', 14, finalY + 8);
        doc.text('2. Payments are accepted via school cashier counter or authorized banking channels.', 14, finalY + 12);
        doc.text('3. Retain this fee card as official proof of payment for the current academic session.', 14, finalY + 16);

        // 5. Signature Lines & Stamps
        const sigY = finalY + 36;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);

        // Cashier Sign
        doc.line(18, sigY, 62, sigY);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text('Cashier / Accounts Officer', 40, sigY + 4, { align: 'center' });

        // Principal Sign
        doc.line(82, sigY, 126, sigY);
        doc.text('Principal Signature & Stamp', 104, sigY + 4, { align: 'center' });

        // Parent Copy / Sign
        doc.line(146, sigY, 190, sigY);
        doc.text('Parent / Depositor Sign', 168, sigY + 4, { align: 'center' });

        // Footer Bar
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 292, 210, 5, 'F');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(`Generated on ${new Date().toLocaleString('en-PK')} | Official School Management System`, 105, 295.5, { align: 'center' });

        const safeStudentName = (student.name || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`FeeCard_${safeStudentName}_${targetMonthName || 'Month'}_${targetYear || 2026}.pdf`);
        return true;
    } catch (e) {
        console.error("Error generating fee card PDF:", e);
        alert("Failed to export PDF Fee Card: " + e.message);
        return false;
    }
};

// Helper: Parse student paid months into a set of 0-indexed month numbers for target year
export const parseStudentPaidMonthsSet = (student, targetYear) => {
    return parseStudentPaidMonthsSetPipeline(student, targetYear);
};

// Helper: Calculate Itemized Student Fee Breakdown
export const calculateItemizedFeeBreakdown = (student, currentAction = null, feeSettings = {}, targetMonthIdx = 0, targetYear = 2026) => {
    return calculateItemizedFeeBreakdownPipeline(student, currentAction, feeSettings, targetMonthIdx, targetYear);
};

const FeeArrearsMatrix = ({ 
    schoolId, 
    classes = [], 
    schoolInfo = {}, 
    feeSettings = {},
    currentAction = null,
    onOpenNewActionModal,
    onDeleteAction,
    onSaveFeeSettings,
    setFeeSettings,
    isSavingFeeSettings = false
}) => {
    const navigate = useNavigate();
    const today = new Date();
    const currentYearNum = today.getFullYear();
    const currentMonthIdx = today.getMonth(); // 0-indexed (0 = Jan, 8 = Sep)

    // State
    const [selectedYear, setSelectedYear] = useState(currentYearNum);
    const [localClasses, setLocalClasses] = useState(classes || []);
    const [studentsMap, setStudentsMap] = useState(() => {
        try {
            if (schoolId) {
                const cached = sessionStorage.getItem(`fee_matrix_cache_${schoolId}`);
                if (cached) return JSON.parse(cached);
            }
        } catch (e) {}
        return {};
    });
    const [loading, setLoading] = useState(() => {
        try {
            if (schoolId) {
                const cached = sessionStorage.getItem(`fee_matrix_cache_${schoolId}`);
                if (cached && Object.keys(JSON.parse(cached)).length > 0) return false;
            }
        } catch (e) {}
        return true;
    });
    
    // Drilldown State: Level 1 (null), Level 2 (selectedMonthIdx), Level 3 (selectedClassId)
    const [selectedMonthIdx, setSelectedMonthIdx] = useState(currentMonthIdx);
    const [selectedClassId, setSelectedClassId] = useState(null);
    const [defaulterFilter, setDefaulterFilter] = useState('all'); // 'all', 'defaulters_only', 'paid_only', 'concession_only'
    const [searchQuery, setSearchQuery] = useState('');

    // Quick Collect Fee Modal State
    const [collectingStudent, setCollectingStudent] = useState(null);
    const [collectPaymentMode, setCollectPaymentMode] = useState('Cash');
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
    const [copiedPhone, setCopiedPhone] = useState(null);
    const [isInjectingDemo, setIsInjectingDemo] = useState(false);

    // Interactive Student Fee Card Modal State
    const [selectedFeeCardData, setSelectedFeeCardData] = useState(null);

    const handleOpenFeeCardModal = (st, breakdown, isPaid, e) => {
        let buttonRect = null;
        if (e && e.currentTarget) {
            const r = e.currentTarget.getBoundingClientRect();
            buttonRect = {
                top: r.top,
                bottom: r.bottom,
                left: r.left,
                right: r.right,
                width: r.width,
                height: r.height
            };
        }
        const fin = getStudentMonthFinancialStatus(st, selectedMonthIdx, selectedYear, currentAction, feeSettings);
        const b = breakdown || fin.breakdown;
        setSelectedFeeCardData({
            student: st,
            breakdown: b,
            monthFinancial: fin,
            isPaid: fin.status === 'paid' || fin.is100PercentFree,
            targetMonthName: MONTH_NAMES[selectedMonthIdx],
            targetMonthIdx: selectedMonthIdx,
            targetYear: selectedYear,
            feeSettings,
            buttonRect
        });
    };

    // Keep localClasses in sync with props or fetch if empty
    useEffect(() => {
        if (classes && classes.length > 0) {
            setLocalClasses(classes);
        } else if (schoolId) {
            const qCls = query(collection(db, `schools/${schoolId}/classes`));
            const unsub = onSnapshot(qCls, (snap) => {
                const list = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(d => d.id !== 'action_metadata');
                setLocalClasses(list);
            }, (err) => console.error("Error fetching classes in matrix:", err));
            return () => unsub();
        }
    }, [schoolId, classes]);

    // Stable Classes Key
    const classesKey = useMemo(() => {
        return (localClasses || []).map(c => c.id).sort().join(',');
    }, [localClasses]);

    // 1. High-Performance Real-time Listeners with Offline IndexedDB Support
    useEffect(() => {
        if (!schoolId) {
            setLoading(false);
            return;
        }

        // Hydrate from IndexedDB if initial offline state
        getCachedStudentsOffline(schoolId).then(cachedList => {
            if (cachedList && cachedList.length > 0) {
                const grouped = {};
                cachedList.forEach(st => {
                    if (!grouped[st.classId]) grouped[st.classId] = [];
                    grouped[st.classId].push(st);
                });
                setStudentsMap(prev => Object.keys(prev).length === 0 ? grouped : prev);
                setLoading(false);
            }
        }).catch(() => {});

        if (!localClasses || localClasses.length === 0) {
            const timer = setTimeout(() => setLoading(false), 800);
            return () => clearTimeout(timer);
        }

        const unsubs = [];

        localClasses.forEach(cls => {
            const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsub = onSnapshot(q, (snapshot) => {
                const studs = [];
                snapshot.forEach(docSnap => {
                    studs.push({
                        id: docSnap.id,
                        classId: cls.id,
                        className: cls.name || cls.className || 'Unknown Class',
                        ...docSnap.data()
                    });
                });

                // Cache to IndexedDB for 0ms offline retrieval
                cacheStudentsOffline(schoolId, studs);

                setStudentsMap(prev => {
                    const updated = {
                        ...prev,
                        [cls.id]: studs
                    };
                    try {
                        sessionStorage.setItem(`fee_matrix_cache_${schoolId}`, JSON.stringify(updated));
                    } catch (e) {}
                    return updated;
                });
                setLoading(false);
            }, (err) => {
                console.warn(`Offline / cached students for class ${cls.name}:`, err);
                setLoading(false);
            });
            unsubs.push(unsub);
        });

        return () => {
            unsubs.forEach(fn => fn());
        };
    }, [schoolId, classesKey, localClasses]);

    // Flatten and pre-process all students with O(1) paid sets & Itemized Breakdown
    const processedStudents = useMemo(() => {
        const list = [];
        Object.values(studentsMap).forEach(arr => {
            if (Array.isArray(arr)) {
                arr.forEach(st => {
                    const paidMonthsSet = parseStudentPaidMonthsSet(st, selectedYear);
                    const breakdown = calculateItemizedFeeBreakdown(st, currentAction, feeSettings, selectedMonthIdx, selectedYear);
                    const fatherPhone = st.fatherPhone || st.parentPhone || st.phone || st.parentDetails?.parentPhone || st.parentDetails?.fatherPhone || '';
                    const fatherName = st.fatherName || st.parentDetails?.fatherName || st.guardianName || 'Guardian';
                    const rollNo = st.rollNo || st.rollNumber || st.admissionNumber || st.id.slice(-4);

                    list.push({
                        ...st,
                        breakdown,
                        feeAmount: breakdown.totalPayable,
                        paidMonthsSet,
                        fatherPhone,
                        fatherName,
                        rollNo
                    });
                });
            }
        });
        return list;
    }, [studentsMap, selectedYear, currentAction, feeSettings, selectedMonthIdx]);

    // 2. Compute 12-Month Matrix Aggregation (Level 1) - SSOT Unified
    const yearlyMatrix = useMemo(() => {
        const matrix = [];
        const totalStudents = processedStudents.length;

        for (let m = 0; m < 12; m++) {
            let paidCount = 0;
            let unpaidCount = 0;
            let expectedTotalAmount = 0;
            let collectedAmount = 0;
            let pendingAmount = 0;

            const isCurrent = (selectedYear === currentYearNum && m === currentMonthIdx);
            const isPast = (selectedYear < currentYearNum || (selectedYear === currentYearNum && m < currentMonthIdx));
            const isFuture = (selectedYear > currentYearNum || (selectedYear === currentYearNum && m > currentMonthIdx));

            for (let i = 0; i < totalStudents; i++) {
                const st = processedStudents[i];
                const fin = getStudentMonthFinancialStatus(st, m, selectedYear, currentAction, feeSettings);
                const fee = fin.expectedAmount;
                expectedTotalAmount += fee;

                if (fin.status === 'paid' || fin.is100PercentFree) {
                    paidCount++;
                    collectedAmount += (fin.paidAmount || fee);
                } else if (fin.status === 'partial') {
                    paidCount++;
                    collectedAmount += fin.paidAmount;
                    if (!isFuture) {
                        pendingAmount += fin.remainingBalance;
                    }
                } else {
                    unpaidCount++;
                    if (!isFuture) {
                        pendingAmount += fee;
                    }
                }
            }

            const collectionRate = expectedTotalAmount > 0 
                ? Math.min(100, Math.round((collectedAmount / expectedTotalAmount) * 100))
                : (totalStudents > 0 ? Math.round((paidCount / totalStudents) * 100) : 0);

            let statusCategory = 'normal';
            if (isFuture) {
                statusCategory = 'upcoming';
            } else if (collectionRate >= 85) {
                statusCategory = 'excellent';
            } else if (collectionRate >= 50) {
                statusCategory = 'moderate';
            } else {
                statusCategory = 'critical';
            }

            matrix.push({
                monthIndex: m,
                monthName: MONTH_NAMES[m],
                monthShort: MONTH_SHORT[m],
                year: selectedYear,
                isCurrent,
                isPast,
                isFuture,
                totalStudents,
                paidCount,
                unpaidCount,
                expectedTotalAmount,
                collectedAmount,
                pendingAmount,
                collectionRate,
                statusCategory
            });
        }

        return matrix;
    }, [processedStudents, selectedYear, currentYearNum, currentMonthIdx, currentAction, feeSettings]);

    // High Level KPIs YTD
    const kpiSummary = useMemo(() => {
        let totalExpectedYTD = 0;
        let totalCollectedYTD = 0;
        let totalArrearsYTD = 0;

        yearlyMatrix.forEach(m => {
            if (!m.isFuture) {
                totalExpectedYTD += m.expectedTotalAmount;
                totalCollectedYTD += m.collectedAmount;
                totalArrearsYTD += m.pendingAmount;
            }
        });

        const overallRate = totalExpectedYTD > 0 ? Math.round((totalCollectedYTD / totalExpectedYTD) * 100) : 0;

        return {
            totalStudents: processedStudents.length,
            totalClasses: localClasses.length,
            totalExpectedYTD,
            totalCollectedYTD,
            totalArrearsYTD,
            overallRate
        };
    }, [yearlyMatrix, processedStudents.length, localClasses.length]);

    // 3. Compute Class-Wise Breakdown for Selected Month (Level 2) - SSOT Unified
    const selectedMonthMeta = yearlyMatrix[selectedMonthIdx] || yearlyMatrix[0] || {};

    const classBreakdown = useMemo(() => {
        if (selectedMonthIdx === null) return [];

        return localClasses.map(cls => {
            const studsInClass = processedStudents.filter(s => s.classId === cls.id);
            let paidCount = 0;
            let unpaidCount = 0;
            let collectedAmount = 0;
            let pendingAmount = 0;
            let totalAmount = 0;

            studsInClass.forEach(st => {
                const fin = getStudentMonthFinancialStatus(st, selectedMonthIdx, selectedYear, currentAction, feeSettings);
                const fee = fin.expectedAmount;
                totalAmount += fee;
                if (fin.status === 'paid' || fin.is100PercentFree) {
                    paidCount++;
                    collectedAmount += (fin.paidAmount || fee);
                } else if (fin.status === 'partial') {
                    collectedAmount += fin.paidAmount;
                    pendingAmount += fin.remainingBalance;
                } else {
                    unpaidCount++;
                    pendingAmount += fee;
                }
            });

            const recoveryRate = totalAmount > 0 
                ? Math.min(100, Math.round((collectedAmount / totalAmount) * 100))
                : (studsInClass.length > 0 ? Math.round((paidCount / studsInClass.length) * 100) : 0);

            return {
                classId: cls.id,
                className: cls.name || cls.className || 'Class',
                teacherName: cls.teacher || cls.teacherName || 'Class Teacher',
                totalStudents: studsInClass.length,
                paidCount,
                unpaidCount,
                collectedAmount,
                pendingAmount,
                totalAmount,
                recoveryRate,
                students: studsInClass
            };
        });
    }, [localClasses, processedStudents, selectedMonthIdx, selectedYear, currentAction, feeSettings]);

    // 4. Compute Student List for Level 3 (Defaulters Ledger) - SSOT Unified
    const activeStudentList = useMemo(() => {
        if (selectedMonthIdx === null) return [];

        let sourceStudents = processedStudents;
        if (selectedClassId) {
            sourceStudents = sourceStudents.filter(s => s.classId === selectedClassId);
        }

        const enriched = sourceStudents.map(st => {
            const fin = getStudentMonthFinancialStatus(st, selectedMonthIdx, selectedYear, currentAction, feeSettings);
            const isPaid = fin.status === 'paid' || fin.is100PercentFree;
            const isPartial = fin.status === 'partial';
            return {
                ...st,
                breakdown: fin.breakdown,
                feeAmount: fin.expectedAmount,
                monthFinancial: fin,
                isPaidForMonth: isPaid,
                isPartialForMonth: isPartial
            };
        });

        // Filter based on Tab Filter and Search
        const q = searchQuery.toLowerCase().trim();
        return enriched.filter(st => {
            if (defaulterFilter === 'defaulters_only' && st.isPaidForMonth) return false;
            if (defaulterFilter === 'paid_only' && !st.isPaidForMonth) return false;
            if (defaulterFilter === 'concession_only' && !st.breakdown.is100PercentFree) return false;

            if (q) {
                const nameMatch = (st.name || st.studentName || '').toLowerCase().includes(q);
                const fatherMatch = (st.fatherName || '').toLowerCase().includes(q);
                const rollMatch = (st.rollNo || '').toLowerCase().includes(q);
                const phoneMatch = (st.fatherPhone || '').toLowerCase().includes(q);
                const classMatch = (st.className || '').toLowerCase().includes(q);
                return nameMatch || fatherMatch || rollMatch || phoneMatch || classMatch;
            }

            return true;
        });
    }, [selectedMonthIdx, selectedClassId, processedStudents, defaulterFilter, searchQuery, selectedYear, currentAction, feeSettings]);

    // Action: WhatsApp Reminder Message Sender with Itemized Breakdown
    const handleSendWhatsAppReminder = useCallback((student) => {
        let phone = (student.fatherPhone || '').replace(/[^0-9]/g, '');
        if (!phone) {
            alert('Parent phone number not available for this student.');
            return;
        }

        if (phone.startsWith('03')) {
            phone = '92' + phone.slice(1);
        } else if (phone.startsWith('3')) {
            phone = '92' + phone;
        }

        const monthName = MONTH_NAMES[selectedMonthIdx];
        const schoolName = schoolInfo?.name || schoolInfo?.schoolName || 'School Administration';
        const studentName = student.name || student.studentName || 'Student';
        const className = student.className || 'Class';
        const b = student.breakdown;

        let breakdownText = `• ٹیوشن فیس: ${formatPKR(b.tuitionPayable)}`;
        if (b.transportFee > 0) breakdownText += `\n• ٹرانسپورٹ کرایہ: ${formatPKR(b.transportFee)}`;
        if (b.storeDues > 0) breakdownText += `\n• اسٹور / کتب و یونیفارم: ${formatPKR(b.storeDues)}`;
        if (b.actionFee > 0) breakdownText += `\n• ${b.actionName || 'امتحانی فیس'}: ${formatPKR(b.actionFee)}`;
        if (b.penaltyFine > 0) breakdownText += `\n• لیٹ فائن: ${formatPKR(b.penaltyFine)}`;

        const message = 
`محترم والدین،
السلام علیکم!

برائے مہربانی نوٹ فرمائیں کہ آپ کے بچے *${studentName}* (کلاس: ${className}، رول نمبر: ${student.rollNo}) کی ماہ *${monthName} ${selectedYear}* کی فیس واجب الادا ہے۔

📋 فیس کی تفصیلات:
${breakdownText}
───────────────────
💵 کل واجب الادا رقم: *${formatPKR(b.totalPayable)}*

برائے مہربانی وقت پر فیس جمع کروائیں تاکہ بچے کا تعلیمی ریکارڈ اپڈیٹ رہے۔

شکریہ،
*${schoolName}*`;

        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    }, [selectedMonthIdx, selectedYear, schoolInfo]);

    // Action: Copy WhatsApp Reminder text
    const handleCopyReminder = useCallback((student) => {
        const monthName = MONTH_NAMES[selectedMonthIdx];
        const schoolName = schoolInfo?.name || schoolInfo?.schoolName || 'School Administration';
        const studentName = student.name || student.studentName || 'Student';
        const className = student.className || 'Class';
        const fee = formatPKR(student.breakdown.totalPayable);

        const text = 
`محترم والدین، السلام علیکم! برائے مہربانی نوٹ فرمائیں کہ آپ کے بچے ${studentName} (کلاس: ${className}) کی ماہ ${monthName} ${selectedYear} کی فیس (${fee}) واجب الادا ہے۔ برائے مہربانی جلد از جلد فیس جمع کروائیں۔ شکریہ - ${schoolName}`;

        navigator.clipboard.writeText(text);
        setCopiedPhone(student.id);
        setTimeout(() => setCopiedPhone(null), 2000);
    }, [selectedMonthIdx, selectedYear, schoolInfo]);

    // Action: Open Quick Collect Modal (Locked Read-Only Amount)
    const handleOpenCollectModal = (student) => {
        setCollectingStudent(student);
        setCollectPaymentMode('Cash');
    };

    // Action: Submit Fee Collection (Updates Firestore with itemized transaction)
    const handleConfirmCollectFee = async () => {
        if (!collectingStudent || !schoolId) return;

        const monthNum = selectedMonthIdx + 1;
        const monthKey = `${selectedYear}-${String(monthNum).padStart(2, '0')}`;
        const isTargetingCurrentMonth = (selectedYear === currentYearNum && selectedMonthIdx === currentMonthIdx);
        const b = collectingStudent.breakdown;
        const receiptNo = `REC-MAT-${Date.now().toString().slice(-6)}`;

        setIsSubmittingPayment(true);
        try {
            const studentRef = doc(db, `schools/${schoolId}/classes/${collectingStudent.classId}/students/${collectingStudent.id}`);
            const masterStudentRef = doc(db, `schools/${schoolId}/students/${collectingStudent.id}`);
            const nowIso = new Date().toISOString();

            // 1. Instant optimistic local update
            setStudentsMap(prev => {
                const arr = prev[collectingStudent.classId] || [];
                const updated = arr.map(s => {
                    if (s.id === collectingStudent.id) {
                        return {
                            ...s,
                            paidMonths: [...(s.paidMonths || []), monthKey],
                            monthlyFeeStatus: isTargetingCurrentMonth ? 'paid' : s.monthlyFeeStatus,
                            monthlyFeeDate: isTargetingCurrentMonth ? nowIso : s.monthlyFeeDate,
                            monthlyFeeHistory: {
                                ...(s.monthlyFeeHistory || {}),
                                [monthKey]: {
                                    status: 'paid',
                                    paidAmount: b.totalPayable,
                                    remainingBalance: 0,
                                    paidAt: nowIso,
                                    receiptNo,
                                    paymentMode: collectPaymentMode
                                }
                            }
                        };
                    }
                    return s;
                });
                return { ...prev, [collectingStudent.classId]: updated };
            });

            // 2. Build Standardized Payload
            const updatePayload = {
                paidMonths: arrayUnion(monthKey),
                lastPaymentMode: collectPaymentMode,
                lastPaymentDate: nowIso,
                lastReceiptNo: receiptNo,
                lastPaymentAmount: b.totalPayable,
                [`monthlyFeeHistory.${monthKey}`]: {
                    status: 'paid',
                    paidAmount: b.totalPayable,
                    remainingBalance: 0,
                    paidAt: nowIso,
                    receiptNo,
                    paymentMode: collectPaymentMode
                }
            };

            if (isTargetingCurrentMonth) {
                updatePayload.monthlyFeeStatus = 'paid';
                updatePayload.monthlyFeeDate = nowIso;
            }

            const txRecord = {
                id: receiptNo,
                receiptNo,
                isFamilyCombined: false,
                studentId: collectingStudent.id,
                studentName: collectingStudent.name || collectingStudent.studentName || 'Student',
                rollNo: collectingStudent.rollNo || 'N/A',
                classId: collectingStudent.classId,
                className: collectingStudent.className || 'Class',
                fatherName: collectingStudent.fatherName || 'Parent / Guardian',
                fatherPhone: collectingStudent.fatherPhone || '',
                month: monthKey,
                monthName: `${MONTH_NAMES[selectedMonthIdx]} ${selectedYear}`,
                targetMonthKey: monthKey,
                targetMonthIdx: selectedMonthIdx,
                targetMonthName: MONTH_NAMES[selectedMonthIdx],
                targetYear: selectedYear,
                totalPaid: b.totalPayable,
                totalAmount: b.totalPayable,
                tuitionAmount: b.tuitionPayable,
                transportAmount: b.transportFee,
                storeAmount: b.storeDues,
                actionAmount: b.actionFee,
                penaltyAmount: b.penaltyFine,
                paymentMode: collectPaymentMode,
                dateIso: nowIso,
                type: 'tuition_fee',
                status: 'completed',
                notes: `Locked Collection via Monthly Fee Matrix for ${MONTH_NAMES[selectedMonthIdx]} ${selectedYear}`,
                collectedBy: 'Principal Office (Matrix)'
            };

            // 3. Enqueue to Offline Engine
            await enqueueOfflineFeeTransaction(schoolId, txRecord);

            // 4. Firestore Direct Write
            const txRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
            await Promise.all([
                setDoc(studentRef, updatePayload, { merge: true }),
                setDoc(masterStudentRef, updatePayload, { merge: true }).catch(() => {}),
                setDoc(txRef, {
                    ...txRecord,
                    timestamp: serverTimestamp()
                }, { merge: true })
            ]);

            setCollectingStudent(null);
        } catch (err) {
            console.error("Error recording quick fee payment:", err);
            alert("Failed to record payment: " + err.message);
        } finally {
            setIsSubmittingPayment(false);
        }
    };

    // Action: Demo Data Injection (100% presentation-ready)
    const handleInjectDemoData = async () => {
        if (!schoolId) {
            alert("School ID not found. Please log in or refresh.");
            return;
        }

        if (!window.confirm("Do you want to inject Presentation Demo Fee Data?\n\n- Months before last month: 🟢 ALL GREEN (Paid)\n- Last month: 🔴 RED (Defaulters Arrears)\n- Current month: 🟡 ORANGE (Moderate Recovery)\n\nThis will populate the entire matrix with active presentation data.")) {
            return;
        }

        setIsInjectingDemo(true);
        const yr = selectedYear;
        const curM = currentMonthIdx;
        const lastM = curM > 0 ? curM - 1 : 0;

        try {
            // Case A: If students already exist in database or in memory
            if (processedStudents.length > 0) {
                const updatedLocalMap = {};
                let studentCounter = 0;

                Object.keys(studentsMap).forEach(cid => {
                    const studs = studentsMap[cid] || [];
                    updatedLocalMap[cid] = studs.map(st => {
                        const paidList = [];
                        // 1. Months before last month -> All Green
                        for (let m = 0; m < lastM; m++) {
                            const monthNum = m + 1;
                            const monthKey = `${yr}-${String(monthNum).padStart(2, '0')}`;
                            if (studentCounter % 20 !== 0) paidList.push(monthKey);
                        }
                        // 2. Last month -> High Arrears / Defaulter (Red)
                        const lastMonthNum = lastM + 1;
                        const lastMonthKey = `${yr}-${String(lastMonthNum).padStart(2, '0')}`;
                        if (studentCounter % 4 === 0) paidList.push(lastMonthKey);

                        // 3. Current month -> Moderate in-progress (Orange)
                        const curMonthNum = curM + 1;
                        const curMonthKey = `${yr}-${String(curMonthNum).padStart(2, '0')}`;
                        const isCurPaid = (studentCounter % 3 === 0);
                        if (isCurPaid) paidList.push(curMonthKey);

                        studentCounter++;
                        return {
                            ...st,
                            paidMonths: paidList,
                            monthlyFeeStatus: isCurPaid ? 'paid' : 'unpaid',
                            monthlyFeeDate: isCurPaid ? new Date().toISOString() : null,
                            previousMonthsUnpaidCount: (studentCounter % 4 !== 0) ? 1 : 0
                        };
                    });
                });

                setStudentsMap(updatedLocalMap);
                try {
                    sessionStorage.setItem(`fee_matrix_cache_${schoolId}`, JSON.stringify(updatedLocalMap));
                } catch (e) {}

                // Batch write to Firestore
                const batch = writeBatch(db);
                let count = 0;
                let gIdx = 0;

                for (const st of processedStudents) {
                    const studentRef = doc(db, `schools/${schoolId}/classes/${st.classId}/students/${st.id}`);
                    const paidList = [];

                    for (let m = 0; m < lastM; m++) {
                        const monthNum = m + 1;
                        const monthKey = `${yr}-${String(monthNum).padStart(2, '0')}`;
                        if (gIdx % 20 !== 0) paidList.push(monthKey);
                    }

                    const lastMonthNum = lastM + 1;
                    const lastMonthKey = `${yr}-${String(lastMonthNum).padStart(2, '0')}`;
                    if (gIdx % 4 === 0) paidList.push(lastMonthKey);

                    const curMonthNum = curM + 1;
                    const curMonthKey = `${yr}-${String(curMonthNum).padStart(2, '0')}`;
                    const isCurPaid = (gIdx % 3 === 0);
                    if (isCurPaid) paidList.push(curMonthKey);

                    batch.update(studentRef, {
                        paidMonths: paidList,
                        monthlyFeeStatus: isCurPaid ? 'paid' : 'unpaid',
                        monthlyFeeDate: isCurPaid ? new Date().toISOString() : null,
                        previousMonthsUnpaidCount: (gIdx % 4 !== 0) ? 1 : 0
                    });

                    count++;
                    gIdx++;
                    if (count >= 400) break;
                }

                if (count > 0) await batch.commit();
            } else {
                // Case B: Fresh / Empty school -> Auto-generate 4 demo classes & 16 demo students
                const demoClassDefs = [
                    { id: 'class_nursery', name: 'Nursery - Rose', teacher: 'Miss Ayesha' },
                    { id: 'class_prep', name: 'Prep - Lily', teacher: 'Miss Sana' },
                    { id: 'class_1', name: 'Class 1 - A', teacher: 'Sir Tariq' },
                    { id: 'class_2', name: 'Class 2 - B', teacher: 'Miss Hina' }
                ];

                const sampleStudents = [
                    { name: 'Muhammad Ali', father: 'Tariq Mehmood', phone: '03001234567', fee: 2500, concession: 'none' },
                    { name: 'Fatima Zahra', father: 'Imran Shah', phone: '03129876543', fee: 2500, concession: 'free' },
                    { name: 'Ahmed Raza', father: 'Rashid Minhas', phone: '03335554433', fee: 2500, concession: 'none' },
                    { name: 'Ayesha Bibi', father: 'Nasir Khan', phone: '03457778899', fee: 2500, concession: 'none' },
                    { name: 'Bilal Tariq', father: 'Tariq Aziz', phone: '03012223344', fee: 3000, concession: 'none' },
                    { name: 'Zainab Noor', father: 'Farooq Ahmed', phone: '03134445566', fee: 3000, concession: 'scholarship' },
                    { name: 'Hamza Malik', father: 'Sajid Malik', phone: '03348889900', fee: 3000, concession: 'none' },
                    { name: 'Maryam Asif', father: 'Asif Javed', phone: '03461112233', fee: 3000, concession: 'none' },
                    { name: 'Usman Ghani', father: 'Ghani Rehman', phone: '03023334455', fee: 3200, concession: 'none' },
                    { name: 'Hafsa Farooq', father: 'Farooq Sattar', phone: '03146667788', fee: 3200, concession: 'none' },
                    { name: 'Zeeshan Ali', father: 'Ali Akbar', phone: '03359990011', fee: 3200, concession: 'none' },
                    { name: 'Khadija Tul Kubra', father: 'Zahid Hussain', phone: '03472223344', fee: 3200, concession: 'none' },
                    { name: 'Abdullah Khan', father: 'Sultan Khan', phone: '03034445566', fee: 3500, concession: 'none' },
                    { name: 'Eman Fatima', father: 'Waqar Ahmed', phone: '03157778899', fee: 3500, concession: 'none' },
                    { name: 'Saad Ur Rehman', father: 'Atif Rehman', phone: '03361112233', fee: 3500, concession: 'none' },
                    { name: 'Noor Ul Ain', father: 'Qasim Ali', phone: '03483334455', fee: 3500, concession: 'none' }
                ];

                const batch = writeBatch(db);
                const generatedMap = {};

                // 1. Create Demo Classes in Firestore
                for (const cDef of demoClassDefs) {
                    const cRef = doc(db, `schools/${schoolId}/classes`, cDef.id);
                    batch.set(cRef, { name: cDef.name, teacher: cDef.teacher }, { merge: true });
                    generatedMap[cDef.id] = [];
                }

                // 2. Create Demo Students across classes
                let sIdx = 0;
                for (const s of sampleStudents) {
                    const assignedClass = demoClassDefs[Math.floor(sIdx / 4)];
                    const sId = `demo_std_${sIdx + 1}`;
                    const sRef = doc(db, `schools/${schoolId}/classes/${assignedClass.id}/students`, sId);
                    const isScholarship = (s.concession === 'free' || s.concession === 'scholarship');

                    const paidList = [];
                    // Months before last month -> Paid
                    for (let m = 0; m < lastM; m++) {
                        const monthNum = m + 1;
                        paidList.push(`${yr}-${String(monthNum).padStart(2, '0')}`);
                    }
                    // Last month -> only 25% paid
                    if (sIdx % 4 === 0) {
                        paidList.push(`${yr}-${String(lastM + 1).padStart(2, '0')}`);
                    }
                    // Current month -> 60% paid
                    const isCurPaid = (sIdx % 2 === 0);
                    if (isCurPaid) {
                        paidList.push(`${yr}-${String(curM + 1).padStart(2, '0')}`);
                    }

                    const studentObj = {
                        id: sId,
                        name: s.name,
                        studentName: s.name,
                        fatherName: s.father,
                        fatherPhone: s.phone,
                        parentPhone: s.phone,
                        rollNo: `${100 + sIdx + 1}`,
                        classId: assignedClass.id,
                        className: assignedClass.name,
                        monthlyFee: s.fee,
                        tuitionFee: s.fee,
                        feeDiscount: isScholarship ? 100 : 0,
                        isScholarship,
                        concessionType: isScholarship ? 'free' : 'none',
                        paidMonths: paidList,
                        monthlyFeeStatus: isCurPaid ? 'paid' : 'unpaid',
                        monthlyFeeDate: isCurPaid ? new Date().toISOString() : null,
                        previousMonthsUnpaidCount: (sIdx % 4 !== 0) ? 1 : 0
                    };

                    batch.set(sRef, studentObj, { merge: true });
                    generatedMap[assignedClass.id].push(studentObj);
                    sIdx++;
                }

                await batch.commit();
                setLocalClasses(demoClassDefs);
                setStudentsMap(generatedMap);
                try {
                    sessionStorage.setItem(`fee_matrix_cache_${schoolId}`, JSON.stringify(generatedMap));
                } catch (e) {}
            }
        } catch (err) {
            console.error("Error injecting demo presentation data:", err);
            alert("Error setting demo data: " + err.message);
        } finally {
            setIsInjectingDemo(false);
        }
    };

    if (loading && processedStudents.length === 0) {
        return (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'inline-flex', padding: '1rem', background: '#eef2ff', borderRadius: '50%', marginBottom: '1rem' }}>
                    <RefreshCw size={32} color="#4f46e5" className="animate-spin" />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                    Loading 12-Month Financial Matrix...
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Connecting live to class ledgers and compiling itemized student balances.
                </p>
            </div>
        );
    }

    return (
        <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* TOP HEADER: Unified Fee Controls, Action Settings, & Year Selector */}
            <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
                borderRadius: '24px',
                padding: '2rem',
                color: 'white',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <div style={{ background: 'rgba(255, 255, 255, 0.15)', backdropFilter: 'blur(10px)', padding: '0.5rem', borderRadius: '12px', display: 'flex' }}>
                                <Calendar size={24} color="#818cf8" />
                            </div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0, letterSpacing: '-0.02em' }}>
                                Monthly Fee Matrix & Collections
                            </h2>
                        </div>
                        <p style={{ margin: 0, color: '#c7d2fe', fontSize: '0.95rem', maxWidth: '600px', lineHeight: '1.5' }}>
                            Unified financial command: 12-month recovery breakdown, anti-tamper locked receipts, and itemized multi-head fee ledger.
                        </p>
                    </div>

                    {/* Right Header Controls: Fee Settings, Actions & Year */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Inline Fee Settings (Due Date & Penalty) */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                            background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.8rem',
                            borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#c7d2fe', fontWeight: '700' }}>Due Day:</span>
                                <input
                                    type="text"
                                    placeholder="10th"
                                    value={feeSettings?.dueDate || ''}
                                    onChange={(e) => setFeeSettings && setFeeSettings({ ...feeSettings, dueDate: e.target.value })}
                                    style={{
                                        padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(255,255,255,0.15)', color: 'white', width: '45px', fontSize: '0.8rem', outline: 'none', fontWeight: '700'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#c7d2fe', fontWeight: '700' }}>Fine:</span>
                                <input
                                    type="number"
                                    placeholder="200"
                                    value={feeSettings?.penaltyAmount || ''}
                                    onChange={(e) => setFeeSettings && setFeeSettings({ ...feeSettings, penaltyAmount: e.target.value })}
                                    style={{
                                        padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(255,255,255,0.15)', color: 'white', width: '60px', fontSize: '0.8rem', outline: 'none', fontWeight: '700'
                                    }}
                                />
                            </div>
                            <button
                                onClick={onSaveFeeSettings}
                                disabled={isSavingFeeSettings}
                                style={{
                                    padding: '0.3rem 0.65rem', borderRadius: '8px', border: 'none',
                                    background: '#4f46e5', color: 'white', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer'
                                }}
                            >
                                {isSavingFeeSettings ? '...' : 'Save'}
                            </button>
                        </div>

                        {/* Current Action / New Action Button */}
                        {currentAction ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                background: 'rgba(255,255,255,0.15)', padding: '0.4rem 0.8rem',
                                borderRadius: '14px', border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.65rem', color: '#c7d2fe', textTransform: 'uppercase', fontWeight: '800' }}>Action</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#fef08a' }}>{currentAction.name}</div>
                                </div>
                                <button
                                    onClick={onDeleteAction}
                                    style={{ background: '#fee2e2', border: 'none', borderRadius: '50%', padding: '4px', cursor: 'pointer', color: '#dc2626' }}
                                    title="Delete Active Action"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={onOpenNewActionModal}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                    padding: '0.5rem 0.9rem', borderRadius: '14px', border: 'none',
                                    background: '#ffffff', color: '#312e81', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                }}
                            >
                                <Plus size={14} />
                                New Action
                            </button>
                        )}

                        {/* Academic Year Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0,0,0,0.25)', padding: '0.4rem 0.6rem', borderRadius: '14px' }}>
                            {[currentYearNum - 1, currentYearNum, currentYearNum + 1].map(yr => (
                                <button
                                    key={yr}
                                    onClick={() => setSelectedYear(yr)}
                                    style={{
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        fontWeight: '800',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        background: selectedYear === yr ? 'white' : 'transparent',
                                        color: selectedYear === yr ? '#312e81' : '#c7d2fe'
                                    }}
                                >
                                    {yr}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* KPI Metrics Strip */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1.25rem',
                    marginTop: '2rem',
                    position: 'relative',
                    zIndex: 1
                }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(10px)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#c7d2fe', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Enrolled</span>
                            <Users size={18} color="#818cf8" />
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800' }}>
                            {kpiSummary.totalStudents} <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#a5b4fc' }}>Students</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                            Across {kpiSummary.totalClasses} Active Classes
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(10px)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#c7d2fe', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collected YTD ({selectedYear})</span>
                            <CheckCircle2 size={18} color="#34d399" />
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#34d399' }}>
                            {formatPKR(kpiSummary.totalCollectedYTD)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#a7f3d0', marginTop: '0.25rem' }}>
                            Recovery: {kpiSummary.overallRate}% of Year Target
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(10px)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#c7d2fe', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overdue Arrears</span>
                            <AlertCircle size={18} color="#f87171" />
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f87171' }}>
                            {formatPKR(kpiSummary.totalArrearsYTD)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '0.25rem' }}>
                            Outstanding Past Dues
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(10px)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#c7d2fe', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collection Health</span>
                            <TrendingUp size={18} color="#fbbf24" />
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#fbbf24' }}>
                            {kpiSummary.overallRate}%
                        </div>
                        <div style={{
                            width: '100%', height: '6px', background: 'rgba(255,255,255,0.2)',
                            borderRadius: '3px', marginTop: '0.5rem', overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${kpiSummary.overallRate}%`, height: '100%',
                                background: kpiSummary.overallRate >= 80 ? '#34d399' : kpiSummary.overallRate >= 50 ? '#fbbf24' : '#f87171',
                                borderRadius: '3px'
                            }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* LEVEL 1: 12-Month Yearly Overview Grid */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                                12-Month Yearly Matrix ({selectedYear})
                            </h3>
                            <button
                                onClick={handleInjectDemoData}
                                disabled={isInjectingDemo}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '10px',
                                    border: '1.5px solid #6366f1',
                                    background: '#eef2ff',
                                    color: '#4338ca',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 0px #6366f1'
                                }}
                                title="Set demo presentation data: Past months Green, Last month Red, Current month Orange"
                            >
                                <Sparkles size={14} color="#4f46e5" />
                                {isInjectingDemo ? 'Injecting Demo...' : '✨ Inject Demo Data (Presentation)'}
                            </button>
                        </div>
                        <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                            Click any month card to inspect class-wise recovery and open student defaulters.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', fontWeight: '600' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#059669' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                            Paid (85%+)
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#d97706' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
                            Moderate (50-84%)
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#dc2626' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                            High Arrears (&lt;50%)
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#94a3b8' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#cbd5e1' }} />
                            Upcoming
                        </span>
                    </div>
                </div>

                {/* 12 Month Grid Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: '1.25rem'
                }}>
                    {yearlyMatrix.map((item) => {
                        const isSelected = selectedMonthIdx === item.monthIndex;

                        let cardBg = '#475569';
                        let borderColor = '#334155';
                        let subTextColor = '#cbd5e1';
                        let badgeBg = 'rgba(255, 255, 255, 0.2)';
                        let badgeBorder = 'rgba(255, 255, 255, 0.35)';
                        let progressTrack = 'rgba(255, 255, 255, 0.25)';
                        let progressColor = '#ffffff';
                        let innerPaidBg = 'rgba(255, 255, 255, 0.16)';
                        let innerPendingBg = 'rgba(255, 255, 255, 0.16)';
                        let StatusIcon = Calendar;
                        let statusText = 'Upcoming';

                        if (item.isFuture) {
                            cardBg = '#475569';
                            borderColor = isSelected ? '#ffffff' : '#334155';
                            StatusIcon = Calendar;
                            statusText = 'Upcoming';
                        } else if (item.isCurrent) {
                            cardBg = '#ea580c';
                            borderColor = isSelected ? '#ffffff' : '#c2410c';
                            subTextColor = '#ffedd5';
                            StatusIcon = Clock;
                            statusText = 'Current Month';
                        } else if (item.statusCategory === 'excellent' || item.collectionRate >= 85) {
                            cardBg = '#059669';
                            borderColor = isSelected ? '#ffffff' : '#047857';
                            subTextColor = '#d1fae5';
                            StatusIcon = CheckCircle2;
                            statusText = 'Paid';
                        } else if (item.statusCategory === 'moderate') {
                            cardBg = '#d97706';
                            borderColor = isSelected ? '#ffffff' : '#b45309';
                            subTextColor = '#fef3c7';
                            StatusIcon = Clock;
                            statusText = 'In-Progress';
                        } else {
                            cardBg = '#dc2626';
                            borderColor = isSelected ? '#ffffff' : '#991b1b';
                            subTextColor = '#fee2e2';
                            StatusIcon = XCircle;
                            statusText = 'Pending';
                        }

                        return (
                            <div
                                key={item.monthIndex}
                                onClick={() => {
                                    setSelectedMonthIdx(item.monthIndex);
                                    setSelectedClassId(null);
                                }}
                                style={{
                                    background: cardBg,
                                    color: '#ffffff',
                                    borderRadius: '18px',
                                    padding: '1.25rem',
                                    border: isSelected ? '3px solid #ffffff' : `2.5px solid ${borderColor}`,
                                    boxShadow: isSelected 
                                        ? '0 8px 0px rgba(0,0,0,0.35), 0 10px 20px rgba(0,0,0,0.2)' 
                                        : '0 4px 0px rgba(0,0,0,0.2)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    transform: isSelected ? 'translateY(-4px)' : 'translateY(0)',
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.9rem'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                            <span style={{ fontSize: '1.3rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.01em' }}>
                                                {item.monthName}
                                            </span>
                                            {item.isCurrent && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: '900',
                                                    background: '#ffffff',
                                                    color: '#ea580c',
                                                    padding: '2px 7px',
                                                    borderRadius: '6px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em'
                                                }}>
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: subTextColor, marginTop: '0.15rem', display: 'block' }}>
                                            {item.isFuture ? 'Future Month' : `${item.collectionRate}% Recovered`}
                                        </span>
                                    </div>

                                    <div style={{
                                        background: badgeBg,
                                        color: '#ffffff',
                                        border: `1.5px solid ${badgeBorder}`,
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        padding: '4px 10px',
                                        borderRadius: '10px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        backdropFilter: 'blur(4px)'
                                    }}>
                                        <StatusIcon size={14} color="#ffffff" strokeWidth={2.5} />
                                        <span>{statusText}</span>
                                    </div>
                                </div>

                                <div style={{ width: '100%', background: progressTrack, height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${item.collectionRate}%`,
                                        height: '100%',
                                        background: progressColor,
                                        borderRadius: '4px',
                                        transition: 'width 0.4s ease'
                                    }} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', paddingTop: '0.15rem' }}>
                                    <div style={{
                                        background: innerPaidBg,
                                        border: '1.5px solid rgba(255,255,255,0.25)',
                                        borderRadius: '12px',
                                        padding: '0.55rem 0.65rem'
                                    }}>
                                        <div style={{ fontSize: '0.65rem', color: '#ffffff', opacity: 0.9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            PAID
                                        </div>
                                        <div style={{ fontWeight: '900', color: '#ffffff', fontSize: '0.95rem' }}>
                                            {item.paidCount} <span style={{ fontSize: '0.75rem', fontWeight: '600', opacity: 0.85 }}>Studs</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: '800', marginTop: '0.1rem' }}>
                                            {formatPKR(item.collectedAmount)}
                                        </div>
                                    </div>

                                    <div style={{
                                        background: innerPendingBg,
                                        border: '1.5px solid rgba(255,255,255,0.25)',
                                        borderRadius: '12px',
                                        padding: '0.55rem 0.65rem'
                                    }}>
                                        <div style={{ fontSize: '0.65rem', color: '#ffffff', opacity: 0.9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {item.isFuture ? 'UPCOMING' : 'PENDING'}
                                        </div>
                                        <div style={{ fontWeight: '900', color: '#ffffff', fontSize: '0.95rem' }}>
                                            {item.unpaidCount} <span style={{ fontSize: '0.75rem', fontWeight: '600', opacity: 0.85 }}>Studs</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: '800', marginTop: '0.1rem' }}>
                                            {formatPKR(item.pendingAmount)}
                                        </div>
                                    </div>
                                </div>

                                {isSelected && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '-12px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: '#ffffff',
                                        color: cardBg,
                                        fontSize: '0.7rem',
                                        fontWeight: '900',
                                        padding: '2px 10px',
                                        borderRadius: '8px',
                                        border: `1.5px solid ${cardBg}`,
                                        boxShadow: '0 4px 8px rgba(0,0,0,0.25)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em'
                                    }}>
                                        Selected
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* LEVEL 2 & 3: Class Breakdown or Dedicated Class Ledger View */}
            <div style={{
                background: 'white',
                borderRadius: '24px',
                padding: '2rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.75rem'
            }}>
                {selectedClassId ? (
                    // === DEDICATED CLASS LEDGER VIEW (Inside Class Drilldown) ===
                    <div>
                        {/* Class Header with Back Button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.25rem' }}>
                            <div>
                                <button
                                    onClick={() => { setSelectedClassId(null); setSearchQuery(''); setDefaulterFilter('all'); }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        background: '#eef2ff',
                                        color: '#4338ca',
                                        border: 'none',
                                        borderRadius: '10px',
                                        padding: '0.4rem 0.85rem',
                                        fontSize: '0.8rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        marginBottom: '0.6rem'
                                    }}
                                >
                                    <ArrowLeft size={16} /> ← Back to All Classes ({selectedMonthMeta.monthName})
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                        {localClasses.find(c => c.id === selectedClassId)?.name || 'Class'} Ledger
                                    </h3>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>
                                        Teacher: {localClasses.find(c => c.id === selectedClassId)?.teacher || 'Class Teacher'}
                                    </span>
                                </div>
                            </div>

                            {/* Search & Filters */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', minWidth: '220px' }}>
                                    <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        placeholder="Search student, father, roll..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                                            borderRadius: '12px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '12px', flexWrap: 'wrap', gap: '2px' }}>
                                    <button
                                        onClick={() => setDefaulterFilter('all')}
                                        style={{
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            background: defaulterFilter === 'all' ? 'white' : 'transparent',
                                            color: defaulterFilter === 'all' ? '#0f172a' : '#64748b'
                                        }}
                                    >
                                        All ({activeStudentList.length})
                                    </button>
                                    <button
                                        onClick={() => setDefaulterFilter('defaulters_only')}
                                        style={{
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            background: defaulterFilter === 'defaulters_only' ? '#fee2e2' : 'transparent',
                                            color: defaulterFilter === 'defaulters_only' ? '#991b1b' : '#64748b'
                                        }}
                                    >
                                        Defaulters
                                    </button>
                                    <button
                                        onClick={() => setDefaulterFilter('paid_only')}
                                        style={{
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            background: defaulterFilter === 'paid_only' ? '#dcfce7' : 'transparent',
                                            color: defaulterFilter === 'paid_only' ? '#166534' : '#64748b'
                                        }}
                                    >
                                        Paid
                                    </button>
                                    <button
                                        onClick={() => setDefaulterFilter('concession_only')}
                                        style={{
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            background: defaulterFilter === 'concession_only' ? '#e0e7ff' : 'transparent',
                                            color: defaulterFilter === 'concession_only' ? '#4338ca' : '#64748b'
                                        }}
                                    >
                                        Free / Scholarship
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Student Defaulters & Payments Table for this class */}
                        <div style={{ marginTop: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div>
                                    <h4 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                        Itemized Student Fee & Defaulters Ledger ({localClasses.find(c => c.id === selectedClassId)?.name})
                                    </h4>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        Showing {activeStudentList.length} students for {selectedMonthMeta.monthName} {selectedYear}
                                    </span>
                                </div>
                            </div>

                            {activeStudentList.length === 0 ? (
                                <div style={{
                                    padding: '3rem 2rem',
                                    textAlign: 'center',
                                    background: '#f8fafc',
                                    borderRadius: '16px',
                                    border: '1px dashed #cbd5e1'
                                }}>
                                    <CheckCircle2 size={40} color="#10b981" style={{ margin: '0 auto 0.75rem auto' }} />
                                    <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1.1rem' }}>No Students Found</h4>
                                    <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                        All students match the paid/concession filter or no students matched your search query.
                                    </p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '700' }}>Student Details</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '700' }}>Class & Roll</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '700' }}>Father & Phone</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '700' }}>Month Status</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '700' }}>Itemized Fee Breakdown</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '700', textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeStudentList.map((st) => {
                                                const isPaid = st.isPaidForMonth;
                                                const b = st.breakdown;

                                                return (
                                                    <tr 
                                                        key={st.id}
                                                        style={{
                                                            borderBottom: '1px solid #f1f5f9',
                                                            background: b.is100PercentFree ? '#f8faff' : isPaid ? 'white' : '#fffbfa',
                                                            transition: 'background 0.15s'
                                                        }}
                                                    >
                                                        {/* Student Name */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            <div style={{ fontWeight: '800', color: '#0f172a' }}>
                                                                {st.name || st.studentName || 'Unnamed Student'}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                ID: {st.id.slice(0, 8)}
                                                            </div>
                                                        </td>

                                                        {/* Class & Roll */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            <div style={{ fontWeight: '700', color: '#334155' }}>
                                                                {st.className}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                Roll #: {st.rollNo}
                                                            </div>
                                                        </td>

                                                        {/* Father & Phone */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            <div style={{ fontWeight: '600', color: '#334155' }}>
                                                                {st.fatherName}
                                                            </div>
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                <Phone size={12} color="#94a3b8" />
                                                                {st.fatherPhone || 'No Phone'}
                                                            </div>
                                                        </td>

                                                        {/* Status Pill */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            {b.is100PercentFree ? (
                                                                <span style={{
                                                                    background: '#e0e7ff',
                                                                    color: '#3730a3',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '12px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '800',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem'
                                                                }}>
                                                                    <Award size={13} /> 100% Free / Scholarship
                                                                </span>
                                                            ) : isPaid ? (
                                                                <span style={{
                                                                    background: '#dcfce7',
                                                                    color: '#15803d',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '12px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '800',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem'
                                                                }}>
                                                                    <CheckCircle2 size={13} /> Paid
                                                                </span>
                                                            ) : (
                                                                <span style={{
                                                                    background: '#fee2e2',
                                                                    color: '#b91c1c',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '12px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '800',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem'
                                                                }}>
                                                                    <AlertCircle size={13} /> Unpaid / Overdue
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Itemized Fee Breakdown */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                                                    <BookOpen size={12} color="#6366f1" />
                                                                    <span style={{ color: '#475569' }}>Tuition:</span>
                                                                    <strong style={{ color: '#0f172a' }}>{formatPKR(b.tuitionPayable)}</strong>
                                                                    {b.is100PercentFree && <span style={{ fontSize: '0.65rem', color: '#4f46e5', fontWeight: '800' }}>(Free)</span>}
                                                                </div>

                                                                {b.transportFee > 0 && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#0284c7' }}>
                                                                        <Bus size={12} />
                                                                        <span>Transport: <strong>{formatPKR(b.transportFee)}</strong></span>
                                                                    </div>
                                                                )}

                                                                {b.storeDues > 0 && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#d97706' }}>
                                                                        <ShoppingBag size={12} />
                                                                        <span>Store Dues: <strong>{formatPKR(b.storeDues)}</strong></span>
                                                                    </div>
                                                                )}

                                                                {b.actionFee > 0 && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#7c3aed' }}>
                                                                        <Sparkles size={12} />
                                                                        <span>{cleanFeeItemName(b.actionName)}: <strong>{formatPKR(b.actionFee)}</strong></span>
                                                                    </div>
                                                                )}

                                                                {b.penaltyFine > 0 && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#dc2626' }}>
                                                                        <AlertTriangle size={12} />
                                                                        <span>Late Fine: <strong>{formatPKR(b.penaltyFine)}</strong></span>
                                                                    </div>
                                                                )}

                                                                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: isPaid ? '#059669' : '#dc2626', marginTop: '0.2rem' }}>
                                                                    Total: {formatPKR(b.totalPayable)}
                                                                </div>

                                                                {/* View / Print Full Fee Card Popup Button */}
                                                                <button
                                                                    onClick={(e) => handleOpenFeeCardModal(st, b, isPaid, e)}
                                                                    title="View itemized breakdown & generate PDF fee card"
                                                                    style={{
                                                                        marginTop: '0.35rem',
                                                                        padding: '0.3rem 0.6rem',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #c7d2fe',
                                                                        background: '#eef2ff',
                                                                        color: '#4338ca',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '700',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.3rem',
                                                                        width: 'fit-content'
                                                                    }}
                                                                >
                                                                    <Eye size={12} color="#4f46e5" />
                                                                    View Fee Card
                                                                </button>
                                                            </div>
                                                        </td>

                                                        {/* Actions: WhatsApp Reminder + Locked Collect */}
                                                        <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                                                {!isPaid && !b.is100PercentFree && (
                                                                    <>
                                                                        {/* WhatsApp Direct Reminder */}
                                                                        <button
                                                                            onClick={() => handleSendWhatsAppReminder(st)}
                                                                            title="Send WhatsApp Reminder to Parent"
                                                                            style={{
                                                                                background: '#25d366',
                                                                                color: 'white',
                                                                                border: 'none',
                                                                                borderRadius: '10px',
                                                                                padding: '0.45rem 0.75rem',
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: '700',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '0.35rem',
                                                                                boxShadow: '0 2px 4px rgba(37, 211, 102, 0.25)'
                                                                            }}
                                                                        >
                                                                            <Send size={13} />
                                                                            WhatsApp
                                                                        </button>

                                                                        {/* Copy Message */}
                                                                        <button
                                                                            onClick={() => handleCopyReminder(st)}
                                                                            title="Copy Reminder Text"
                                                                            style={{
                                                                                background: '#f1f5f9',
                                                                                color: '#475569',
                                                                                border: 'none',
                                                                                borderRadius: '10px',
                                                                                padding: '0.45rem',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            {copiedPhone === st.id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                                                                        </button>

                                                                        {/* Collect Fee in Daily Workflow */}
                                                                        <button
                                                                            onClick={() => navigate(`/collections?tab=workflow&classId=${st.classId || selectedClassId}&studentId=${st.id}`)}
                                                                            title="Collect fee in Daily Workflow (with family/siblings)"
                                                                            style={{
                                                                                background: '#10b981',
                                                                                color: 'white',
                                                                                border: 'none',
                                                                                borderRadius: '10px',
                                                                                padding: '0.45rem 0.85rem',
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: '700',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '0.35rem',
                                                                                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
                                                                            }}
                                                                        >
                                                                            <DollarSign size={13} />
                                                                            Collect
                                                                        </button>
                                                                    </>
                                                                )}

                                                                {(isPaid || b.is100PercentFree) && (
                                                                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                        <ShieldCheck size={16} /> Cleared
                                                                    </span>
                                                                )}

                                                                {/* Direct Edit Fee / Student Profile Link */}
                                                                <button
                                                                    onClick={() => navigate(`/student/edit/${st.classId || selectedClassId}/${st.id}?from=collections`)}
                                                                    title="Edit Student Profile, Fees & Scholarship"
                                                                    style={{
                                                                        background: '#f8fafc',
                                                                        color: '#475569',
                                                                        border: '1px solid #e2e8f0',
                                                                        borderRadius: '10px',
                                                                        padding: '0.45rem 0.65rem',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '700',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.35rem'
                                                                    }}
                                                                >
                                                                    <Edit size={13} color="#4f46e5" />
                                                                    Edit Fee
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // === CLASS CARDS OVERVIEW (Main View) ===
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    Class-Wise Arrears Summary ({selectedMonthMeta.monthName} {selectedYear})
                                </h3>
                                <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                                    Click any class card or "Open Class Ledger" to view students, itemized balances, and locked collection.
                                </p>
                            </div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                            gap: '1.25rem'
                        }}>
                            {classBreakdown.map((c) => (
                                <div
                                    key={c.classId}
                                    style={{
                                        background: '#f8fafc',
                                        borderRadius: '16px',
                                        padding: '1.25rem',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '0.85rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onClick={() => setSelectedClassId(c.classId)}
                                >
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                                            <div>
                                                <div style={{ fontWeight: '800', fontSize: '1.15rem', color: '#0f172a' }}>
                                                    {c.className}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {c.teacherName}
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                padding: '3px 8px',
                                                borderRadius: '10px',
                                                background: c.recoveryRate >= 85 ? '#dcfce7' : c.recoveryRate >= 50 ? '#fef3c7' : '#fee2e2',
                                                color: c.recoveryRate >= 85 ? '#166534' : c.recoveryRate >= 50 ? '#92400e' : '#991b1b'
                                            }}>
                                                {c.recoveryRate}% Recovery
                                            </span>
                                        </div>

                                        <div style={{ width: '100%', background: '#e2e8f0', height: '6px', borderRadius: '3px', margin: '0.6rem 0', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${c.recoveryRate}%`,
                                                height: '100%',
                                                background: c.recoveryRate >= 85 ? '#10b981' : c.recoveryRate >= 50 ? '#f59e0b' : '#ef4444',
                                                borderRadius: '3px'
                                            }} />
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                            <div>
                                                <span style={{ color: '#059669', fontWeight: '800' }}>✓ {c.paidCount} Paid</span>
                                                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{formatPKR(c.collectedAmount)}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ color: '#dc2626', fontWeight: '800' }}>✗ {c.unpaidCount} Defaulters</span>
                                                <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: '700' }}>{formatPKR(c.pendingAmount)}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dual Action Buttons */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => setSelectedClassId(c.classId)}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: '#4f46e5',
                                                color: 'white',
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.35rem'
                                            }}
                                        >
                                            <Users size={13} />
                                            Open Class Ledger
                                        </button>
                                        <button
                                            onClick={() => navigate(`/collections/${c.classId}`)}
                                            style={{
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: '8px',
                                                border: '1px solid #cbd5e1',
                                                background: 'white',
                                                color: '#475569',
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem'
                                            }}
                                            title="Open Full Class Collection Register"
                                        >
                                            <ExternalLink size={12} />
                                            Register
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* QUICK COLLECT FEE MODAL (100% Anti-Tampering Locked) */}
            {collectingStudent && typeof document !== 'undefined' && createPortal(
                <div 
                    onClick={() => setCollectingStudent(null)}
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white',
                            borderRadius: '24px',
                            padding: '2rem',
                            maxWidth: '500px',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            animation: 'fadeIn 0.2s ease-out'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ background: '#e0e7ff', padding: '0.5rem', borderRadius: '12px' }}>
                                    <DollarSign size={20} color="#4f46e5" />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                                    Collect Fee (Locked & Tamper-Proof)
                                </h3>
                            </div>
                            <button
                                onClick={() => setCollectingStudent(null)}
                                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Student Details Card */}
                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '16px', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '1.05rem' }}>
                                {collectingStudent.name || collectingStudent.studentName}
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                                Class: <strong>{collectingStudent.className}</strong> | Roll: <strong>{collectingStudent.rollNo}</strong>
                            </div>
                            <div style={{ color: '#4f46e5', fontWeight: '700', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                                Target Month: {MONTH_NAMES[selectedMonthIdx]} {selectedYear}
                            </div>
                        </div>

                        {/* Itemized Breakdown Strip */}
                        <div style={{ background: '#f1f5f9', padding: '0.9rem 1.1rem', borderRadius: '14px', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                <span>Tuition Fee:</span>
                                <strong>{formatPKR(collectingStudent.breakdown.tuitionPayable)}</strong>
                            </div>
                            {collectingStudent.breakdown.transportFee > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7' }}>
                                    <span>Transport Van:</span>
                                    <strong>+{formatPKR(collectingStudent.breakdown.transportFee)}</strong>
                                </div>
                            )}
                            {collectingStudent.breakdown.storeDues > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d97706' }}>
                                    <span>Store Items:</span>
                                    <strong>+{formatPKR(collectingStudent.breakdown.storeDues)}</strong>
                                </div>
                            )}
                            {collectingStudent.breakdown.actionFee > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7c3aed' }}>
                                    <span>{cleanFeeItemName(collectingStudent.breakdown.actionName)}:</span>
                                    <strong>+{formatPKR(collectingStudent.breakdown.actionFee)}</strong>
                                </div>
                            )}
                            {collectingStudent.breakdown.penaltyFine > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                                    <span>Late Fine:</span>
                                    <strong>+{formatPKR(collectingStudent.breakdown.penaltyFine)}</strong>
                                </div>
                            )}
                        </div>

                        {/* Amount Input (LOCKED & READ-ONLY) */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#334155' }}>
                                    Net Amount to Receive
                                </label>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: '700' }}>
                                    <Lock size={12} color="#64748b" /> Locked & Read-Only
                                </span>
                            </div>
                            <div style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: '12px',
                                border: '2px solid #e2e8f0',
                                background: '#f8fafc',
                                fontSize: '1.25rem',
                                fontWeight: '900',
                                color: '#059669',
                                boxSizing: 'border-box',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <span>{formatPKR(collectingStudent.breakdown.totalPayable)}</span>
                                <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                    Verified
                                </span>
                            </div>
                        </div>

                        {/* Payment Mode Selector */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.4rem' }}>
                                Payment Method
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                {['Cash', 'Bank Transfer', 'JazzCash / EasyPaisa'].map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setCollectPaymentMode(mode)}
                                        style={{
                                            padding: '0.6rem 0.5rem',
                                            borderRadius: '10px',
                                            border: collectPaymentMode === mode ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                                            background: collectPaymentMode === mode ? '#eef2ff' : 'white',
                                            color: collectPaymentMode === mode ? '#4338ca' : '#475569',
                                            fontWeight: '700',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setCollectingStudent(null)}
                                style={{
                                    flex: 1,
                                    padding: '0.8rem',
                                    borderRadius: '12px',
                                    border: '1px solid #cbd5e1',
                                    background: 'white',
                                    color: '#475569',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmCollectFee}
                                disabled={isSubmittingPayment}
                                style={{
                                    flex: 2,
                                    padding: '0.8rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: '#4f46e5',
                                    color: 'white',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    opacity: isSubmittingPayment ? 0.7 : 1,
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.4)'
                                }}
                            >
                                {isSubmittingPayment ? 'Recording...' : `Receive ${formatPKR(collectingStudent.breakdown.totalPayable)}`}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Interactive Student Fee Card Popup Modal (Rendered in Document Body Portal near Button) */}
            {selectedFeeCardData && typeof document !== 'undefined' && createPortal(
                <div 
                    onClick={() => setSelectedFeeCardData(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: selectedFeeCardData.buttonRect ? 'flex-start' : 'center',
                        justifyContent: selectedFeeCardData.buttonRect ? 'flex-start' : 'center',
                        padding: '1rem',
                        overflowY: 'auto'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white',
                            borderRadius: '24px',
                            padding: '0',
                            maxWidth: '540px',
                            width: '100%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                            border: '1px solid #e2e8f0',
                            position: selectedFeeCardData.buttonRect ? 'absolute' : 'relative',
                            animation: 'fadeIn 0.2s ease-out',
                            ...(selectedFeeCardData.buttonRect ? (() => {
                                const r = selectedFeeCardData.buttonRect;
                                const modalWidth = Math.min(540, window.innerWidth - 32);
                                // Position left: align to button or ensure inside viewport bounds
                                let left = Math.max(16, Math.min(r.right - modalWidth, window.innerWidth - modalWidth - 16));
                                // Position top: below button if space permits, else above or clamped
                                const estHeight = 520;
                                let top = r.bottom + 8;
                                if (top + estHeight > window.innerHeight - 16) {
                                    if (r.top - estHeight - 8 > 16) {
                                        top = r.top - estHeight - 8;
                                    } else {
                                        top = Math.max(16, window.innerHeight - estHeight - 16);
                                    }
                                }
                                return {
                                    top: `${top}px`,
                                    left: `${left}px`,
                                    width: `${modalWidth}px`
                                };
                            })() : {})
                        }}
                    >
                        {/* Modal Top Header Banner */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            background: selectedFeeCardData.breakdown.is100PercentFree
                                ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                                : (selectedFeeCardData.isPaid
                                    ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                                    : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'),
                            color: 'white',
                            borderTopLeftRadius: '24px',
                            borderTopRightRadius: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.9, fontWeight: '700' }}>
                                    {schoolInfo?.name || 'Academic Model School'}
                                </div>
                                <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.2rem', fontWeight: '800' }}>
                                    Student Fee Card & Voucher
                                </h3>
                                <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '0.1rem' }}>
                                    Billing Month: <strong>{selectedFeeCardData.targetMonthName} {selectedFeeCardData.targetYear}</strong>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedFeeCardData(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    cursor: 'pointer',
                                    backdropFilter: 'blur(4px)'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.5rem' }}>
                            
                            {/* Student Profile Info Row */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem',
                                background: '#f8fafc',
                                borderRadius: '16px',
                                border: '1px solid #e2e8f0',
                                marginBottom: '1.25rem'
                            }}>
                                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'white', padding: '2px', flexShrink: 0, border: '2px solid #e2e8f0', overflow: 'hidden' }}>
                                    <CachedImage
                                        src={selectedFeeCardData.student.avatar || selectedFeeCardData.student.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedFeeCardData.student.id}`}
                                        alt="Student"
                                        style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                                            {selectedFeeCardData.student.name || selectedFeeCardData.student.studentName}
                                        </h4>
                                        {/* Status Badge */}
                                        {selectedFeeCardData.breakdown.is100PercentFree ? (
                                            <span style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800' }}>
                                                🎓 100% Scholarship
                                            </span>
                                        ) : selectedFeeCardData.isPaid ? (
                                            <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '3px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800' }}>
                                                ✓ Paid
                                            </span>
                                        ) : (
                                            <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '3px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800' }}>
                                                ⏳ Overdue / Unpaid
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Class: <strong style={{ color: '#334155' }}>{selectedFeeCardData.student.className}</strong> | Roll #: <strong style={{ color: '#334155' }}>{selectedFeeCardData.student.rollNo}</strong>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.15rem' }}>
                                        Father: <strong style={{ color: '#334155' }}>{selectedFeeCardData.student.fatherName || '--'}</strong> | Phone: <strong style={{ color: '#334155' }}>{selectedFeeCardData.student.fatherPhone || '--'}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Itemized Breakdown Table Box */}
                            <div style={{
                                background: '#f8fafc',
                                borderRadius: '16px',
                                border: '1px solid #e2e8f0',
                                overflow: 'hidden',
                                marginBottom: '1.25rem'
                            }}>
                                <div style={{ padding: '0.65rem 1rem', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Itemized Fee Particulars
                                </div>
                                <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    
                                    {/* Tuition */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155' }}>
                                            <BookOpen size={15} color="#4f46e5" />
                                            <span>Monthly Tuition Fee</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <strong style={{ color: '#0f172a' }}>{formatPKR(selectedFeeCardData.breakdown.tuitionPayable)}</strong>
                                            {selectedFeeCardData.breakdown.is100PercentFree && (
                                                <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#059669', fontWeight: '800' }}>(100% Free)</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Transport */}
                                    {selectedFeeCardData.breakdown.transportFee > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0284c7' }}>
                                                <Bus size={15} />
                                                <span>Transport / Van Fee</span>
                                            </div>
                                            <strong style={{ color: '#0284c7' }}>+{formatPKR(selectedFeeCardData.breakdown.transportFee)}</strong>
                                        </div>
                                    )}

                                    {/* Store Purchases */}
                                    {selectedFeeCardData.breakdown.storeDues > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d97706' }}>
                                                <ShoppingBag size={15} />
                                                <span>Uniform & Store Items</span>
                                            </div>
                                            <strong style={{ color: '#d97706' }}>+{formatPKR(selectedFeeCardData.breakdown.storeDues)}</strong>
                                        </div>
                                    )}

                                    {/* Actions & Fines (Itemized) */}
                                    {Array.isArray(selectedFeeCardData.breakdown.customItems) && selectedFeeCardData.breakdown.customItems.length > 0 ? (
                                        selectedFeeCardData.breakdown.customItems.map((ci, cIdx) => (
                                            <div key={cIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#7c3aed' }}>
                                                    <Sparkles size={15} />
                                                    <span>{cleanFeeItemName(ci.title || ci.name)}</span>
                                                </div>
                                                <strong style={{ color: '#7c3aed' }}>+{formatPKR(ci.amount)}</strong>
                                            </div>
                                        ))
                                    ) : (selectedFeeCardData.breakdown.actionFee > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#7c3aed' }}>
                                                <Sparkles size={15} />
                                                <span>{cleanFeeItemName(selectedFeeCardData.breakdown.actionName)}</span>
                                            </div>
                                            <strong style={{ color: '#7c3aed' }}>+{formatPKR(selectedFeeCardData.breakdown.actionFee)}</strong>
                                        </div>
                                    ))}

                                    {/* Late Fine */}
                                    {selectedFeeCardData.breakdown.penaltyFine > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
                                                <AlertTriangle size={15} />
                                                <span>Late Fine Surcharge</span>
                                            </div>
                                            <strong style={{ color: '#dc2626' }}>+{formatPKR(selectedFeeCardData.breakdown.penaltyFine)}</strong>
                                        </div>
                                    )}

                                    {/* Settled Receipt & Payment Audit Info */}
                                    {selectedFeeCardData.monthFinancial?.receiptNo && (
                                        <div style={{
                                            background: '#ecfdf5',
                                            border: '1px solid #a7f3d0',
                                            borderRadius: '8px',
                                            padding: '0.5rem 0.75rem',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            fontSize: '0.75rem',
                                            color: '#065f46',
                                            marginTop: '0.25rem'
                                        }}>
                                            <span><strong>Slip #:</strong> {selectedFeeCardData.monthFinancial.receiptNo}</span>
                                            <span><strong>Channel:</strong> {selectedFeeCardData.monthFinancial.paymentMode || 'Cash'}</span>
                                            {selectedFeeCardData.monthFinancial.paymentDateStr && (
                                                <span>{selectedFeeCardData.monthFinancial.paymentDateStr}</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Total Line */}
                                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem', marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>Net Monthly Total</span>
                                        <span style={{ fontSize: '1.15rem', fontWeight: '900', color: selectedFeeCardData.breakdown.is100PercentFree ? '#059669' : (selectedFeeCardData.isPaid ? '#059669' : '#dc2626') }}>
                                            {formatPKR(selectedFeeCardData.breakdown.totalPayable)}
                                        </span>
                                    </div>

                                </div>
                            </div>

                            {/* Modal Action Buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                
                                {/* Pay Now / Collect Fee Button (Directs to Daily Workflow with family/sibling auto-open) */}
                                {!selectedFeeCardData.isPaid && !selectedFeeCardData.breakdown.is100PercentFree && (
                                    <button
                                        onClick={() => {
                                            const st = selectedFeeCardData.student;
                                            setSelectedFeeCardData(null);
                                            navigate(`/collections?tab=workflow&classId=${st.classId || selectedClassId}&studentId=${st.id}`);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.85rem 1rem',
                                            borderRadius: '14px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            color: 'white',
                                            fontWeight: '800',
                                            fontSize: '0.92rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <DollarSign size={18} />
                                        Pay / Collect Now ({formatPKR(selectedFeeCardData.breakdown.totalPayable)})
                                    </button>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '0.75rem' }}>
                                    {/* Download PDF Fee Card */}
                                    <button
                                        onClick={() => downloadStudentFeeCardPDF(selectedFeeCardData, schoolInfo)}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '12px',
                                            border: 'none',
                                            background: '#4f46e5',
                                            color: 'white',
                                            fontWeight: '800',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem',
                                            boxShadow: '0 4px 10px rgba(79, 70, 229, 0.3)'
                                        }}
                                    >
                                        <Printer size={16} /> Print PDF Fee Card
                                    </button>

                                    {/* WhatsApp Reminder */}
                                    <button
                                        onClick={() => handleSendWhatsAppReminder(selectedFeeCardData.student)}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '12px',
                                            border: 'none',
                                            background: '#25d366',
                                            color: 'white',
                                            fontWeight: '800',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            boxShadow: '0 4px 10px rgba(37, 211, 102, 0.3)'
                                        }}
                                    >
                                        <Send size={15} /> WhatsApp
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default React.memo(FeeArrearsMatrix);
