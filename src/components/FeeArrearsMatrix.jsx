import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
    Calendar, Users, AlertCircle, CheckCircle2, XCircle, Search, 
    ChevronRight, ArrowLeft, Send, Phone, DollarSign, Download, 
    RefreshCw, Filter, ShieldCheck, ChevronDown, ChevronUp, Copy,
    Check, Sparkles, TrendingUp, AlertTriangle, UserX, Clock,
    Lock, Plus, Trash2, ExternalLink, BookOpen, Bus, ShoppingBag, Award,
    Eye, Printer, X, FileText, LayoutGrid, Table, ZoomIn, ZoomOut, RotateCw
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
        const { student, breakdown, isPaid, targetMonthName, targetYear, feeSettings, monthFinancial } = feeCardData;
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

        // 2. Student & Meta Info Card (Comprehensive Payment & Student Audit)
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 33, 182, 44, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, 33, 182, 44, 2, 2, 'S');

        // Extract payment specifics from monthFinancial or fallback
        const receiptNo = monthFinancial?.receiptNo || student?.lastReceiptNo || `REC-${targetYear || 2026}-${String(student.id || '000').slice(0, 6).toUpperCase()}`;
        const paymentMode = monthFinancial?.paymentMode || (breakdown.is100PercentFree ? 'Scholarship' : (isPaid ? (student?.lastPaymentMode || 'Cash') : 'Pending'));
        const paidDateStr = monthFinancial?.paymentDateStr || (isPaid ? (student?.monthlyFeeDate ? new Date(student.monthlyFeeDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')) : null);
        const contactPhone = student.fatherPhone || student.parentPhone || student.phone || student.parentDetails?.phone || '--';

        // Column 1 (Student Details)
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Student Name:', 18, 40);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(student.name || student.studentName || 'Student', 48, 40);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Father Name:', 18, 47);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(student.fatherName || '--', 48, 47);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Class & Section:', 18, 54);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryColor);
        doc.text(student.className || '--', 48, 54);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Roll Number:', 18, 61);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(String(student.rollNo || '--'), 48, 61);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Contact Phone:', 18, 68);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(String(contactPhone), 48, 68);

        // Column 2 (Receipt, Channel & Paid Date Details)
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Slip / Receipt #:', 112, 40);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(receiptNo, 146, 40);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Payment Method:', 112, 47);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(isPaid ? 16 : 79, isPaid ? 185 : 70, isPaid ? 129 : 229);
        doc.text(paymentMode, 146, 47);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Paid Date:', 112, 54);
        if (paidDateStr) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...greenColor);
            doc.text(paidDateStr, 146, 54);
        } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Not Paid Yet', 146, 54);
        }

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Due Date:', 112, 61);
        doc.setFont('helvetica', 'bold');
        const dueDay = feeSettings?.dueDate || 10;
        if (isPaid) {
            doc.setTextColor(...grayColor);
            doc.setFont('helvetica', 'normal');
            doc.text(`${dueDay} ${targetMonthName || ''} ${targetYear || 2026}`, 146, 61);
        } else {
            doc.setTextColor(225, 29, 72);
            doc.text(`${dueDay} ${targetMonthName || ''} ${targetYear || 2026}`, 146, 61);
        }

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('Payment Status:', 112, 68);
        if (breakdown.is100PercentFree) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text('100% SCHOLARSHIP (FREE)', 146, 68);
        } else if (isPaid) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...greenColor);
            doc.text('PAID / CLEARED', 146, 68);
        } else {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...redColor);
            doc.text('UNPAID / OVERDUE', 146, 68);
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

        // Other Recurring Fees (Computer, Lab, Generator, Exam Fund, etc.)
        const recList = Array.isArray(breakdown.otherRecurringFees) && breakdown.otherRecurringFees.length > 0
            ? breakdown.otherRecurringFees
            : (Array.isArray(breakdown.recurringItems) ? breakdown.recurringItems : []);
        recList.forEach(rf => {
            const amt = Number(rf.amount || 0);
            if (amt > 0) {
                tableRows.push([
                    rowIdx++,
                    rf.name || 'Additional Monthly Fee',
                    `PKR ${amt.toLocaleString()}`,
                    'Nil',
                    `PKR ${amt.toLocaleString()}`
                ]);
            }
        });

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
            startY: 81,
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

        // Calculate exact mathematical gross sum of all rows
        const calculatedTableSum = tableRows.reduce((sum, row) => {
            const rowValStr = String(row[4] || '').replace(/[^0-9]/g, '');
            return sum + (parseInt(rowValStr, 10) || 0);
        }, 0);

        const grossBillAmount = Math.max(Number(breakdown.totalPayable || 0), calculatedTableSum);
        const actualPaidAmount = Number(monthFinancial?.paidAmount !== undefined ? monthFinancial.paidAmount : (isPaid ? grossBillAmount : 0));
        const actualRemainingBalance = Number(monthFinancial?.remainingBalance !== undefined ? monthFinancial.remainingBalance : Math.max(0, grossBillAmount - actualPaidAmount));
        const isPartialPayment = actualPaidAmount > 0 && actualRemainingBalance > 0;

        // 4. Grand Total Summary Box (with Full / Partial / Pending Breakdown)
        const summaryBoxHeight = isPartialPayment ? 24 : 16;
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(106, finalY, 90, summaryBoxHeight, 2, 2, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(106, finalY, 90, summaryBoxHeight, 2, 2, 'S');

        if (isPartialPayment) {
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...grayColor);
            doc.text('TOTAL BILL AMOUNT:', 110, finalY + 5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(`PKR ${grossBillAmount.toLocaleString()}`, 192, finalY + 5, { align: 'right' });

            doc.setTextColor(...grayColor);
            doc.text('AMOUNT PAID (COLLECTED):', 110, finalY + 11);
            doc.setTextColor(...greenColor);
            doc.text(`PKR ${actualPaidAmount.toLocaleString()}`, 192, finalY + 11, { align: 'right' });

            doc.setTextColor(...redColor);
            doc.text('REMAINING PENDING BALANCE:', 110, finalY + 18);
            doc.setFontSize(10);
            doc.text(`PKR ${actualRemainingBalance.toLocaleString()}`, 192, finalY + 18, { align: 'right' });
        } else {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...grayColor);
            doc.text(isPaid ? 'TOTAL PAID AMOUNT:' : 'NET TOTAL PAYABLE:', 110, finalY + 6);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(breakdown.is100PercentFree ? 79 : (isPaid ? 16 : 225), breakdown.is100PercentFree ? 70 : (isPaid ? 185 : 29), breakdown.is100PercentFree ? 229 : (isPaid ? 129 : 72));
            doc.text(`PKR ${grossBillAmount.toLocaleString()}`, 192, finalY + 11, { align: 'right' });
        }

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

// --- Helper to convert image URL to base64 for PDF rendering ---
export const fetchBase64ImageSafe = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("PDF image load note:", e);
        return null;
    }
};

// 100% Offline Professional Annual Class Fee Ledger PDF Generator
export const downloadClassLedgerPDF = async (classData, schoolInfo, selectedYear = 2026, feeSettings = {}, currentAction = null) => {
    try {
        const { className, teacherName, students = [] } = classData;
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const primaryColor = [79, 70, 229]; // #4f46e5 (Indigo)
        const darkColor = [15, 23, 42];     // #0f172a (Slate-900)
        const grayColor = [100, 116, 139];  // #64748b (Slate-500)

        // Top Accent Bar
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 297, 5, 'F');

        // School Logo
        let hasLogo = false;
        const logoUrl = schoolInfo?.logo || schoolInfo?.logoUrl || '';
        if (logoUrl) {
            const base64Img = await fetchBase64ImageSafe(logoUrl);
            if (base64Img) {
                try {
                    doc.addImage(base64Img, 'PNG', 14, 8, 16, 16);
                    hasLogo = true;
                } catch (e) {
                    console.warn("Class ledger logo load warning:", e);
                }
            }
        }

        const headerX = hasLogo ? 33 : 14;
        const schoolName = (schoolInfo?.name || schoolInfo?.schoolName || 'ACADEMIC EXCELLENCE MODEL SCHOOL').toUpperCase();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...darkColor);
        doc.text(schoolName, headerX, 14);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        const schoolAddress = schoolInfo?.address || 'Main Campus';
        const schoolContact = schoolInfo?.phone || schoolInfo?.contact || '';
        doc.text(`${schoolAddress} ${schoolContact ? '| Contact: ' + schoolContact : ''}`, headerX, 19);

        // Title Pill Badge (Right)
        doc.setFillColor(238, 242, 255);
        doc.roundedRect(205, 8, 78, 15, 2, 2, 'F');
        doc.setDrawColor(199, 210, 254);
        doc.roundedRect(205, 8, 78, 15, 2, 2, 'S');

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryColor);
        doc.text('ANNUAL CLASS FEE LEDGER', 244, 13.5, { align: 'center' });

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);
        doc.text(`Class: ${className} | Session: ${selectedYear}`, 244, 18.5, { align: 'center' });

        // Meta subrow
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(`Class Incharge: ${teacherName || 'Class Teacher'}`, 14, 28);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text(`Total Enrolled Students: ${students.length} | Generated: ${new Date().toLocaleDateString('en-GB')}`, 120, 28);

        // Compute table rows
        const tableRows = [];
        let grandTotalPaid = 0;
        let grandTotalBalance = 0;

        students.forEach((st, idx) => {
            const roll = st.rollNo || st.rollNumber || (idx + 1);
            const adm = st.admissionNo || st.admissionNumber || (st.id ? st.id.slice(-4) : '--');
            const name = st.name || st.studentName || 'Student';
            const fName = st.fatherName || '--';

            let studentPaidTotal = 0;
            let studentBalanceTotal = 0;
            const monthCells = [];

            for (let m = 0; m < 12; m++) {
                const fin = getStudentMonthFinancialStatus(st, m, selectedYear, currentAction, feeSettings);
                const isPaid = fin.status === 'paid' || fin.is100PercentFree;
                const isPartial = fin.status === 'partial';

                if (isPaid) {
                    const amt = fin.paidAmount || fin.expectedAmount;
                    studentPaidTotal += amt;
                    monthCells.push(fin.is100PercentFree ? 'FREE' : `Rs ${amt}`);
                } else if (isPartial) {
                    studentPaidTotal += (fin.paidAmount || 0);
                    studentBalanceTotal += (fin.remainingBalance || 0);
                    monthCells.push(`P ${fin.paidAmount}/${fin.expectedAmount}`);
                } else {
                    if (fin.isFuture) {
                        monthCells.push('-');
                    } else {
                        studentBalanceTotal += fin.expectedAmount;
                        monthCells.push(`✗ ${fin.expectedAmount}`);
                    }
                }
            }

            grandTotalPaid += studentPaidTotal;
            grandTotalBalance += studentBalanceTotal;

            tableRows.push([
                idx + 1,
                roll,
                adm,
                name,
                fName,
                ...monthCells,
                `Rs ${studentPaidTotal.toLocaleString()}`,
                `Rs ${studentBalanceTotal.toLocaleString()}`
            ]);
        });

        autoTable(doc, {
            startY: 32,
            head: [['#', 'Roll', 'Adm', 'Student Name', 'Father Name', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Paid', 'Due']],
            body: tableRows,
            theme: 'grid',
            headStyles: {
                fillColor: [79, 70, 229],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7,
                halign: 'center'
            },
            bodyStyles: {
                fontSize: 6.5,
                textColor: [15, 23, 42],
                cellPadding: 1.5
            },
            columnStyles: {
                0: { cellWidth: 7, halign: 'center' },
                1: { cellWidth: 10, halign: 'center' },
                2: { cellWidth: 11, halign: 'center' },
                3: { cellWidth: 26, fontStyle: 'bold' },
                4: { cellWidth: 24 },
                5: { cellWidth: 14, halign: 'center' },
                6: { cellWidth: 14, halign: 'center' },
                7: { cellWidth: 14, halign: 'center' },
                8: { cellWidth: 14, halign: 'center' },
                9: { cellWidth: 14, halign: 'center' },
                10: { cellWidth: 14, halign: 'center' },
                11: { cellWidth: 14, halign: 'center' },
                12: { cellWidth: 14, halign: 'center' },
                13: { cellWidth: 14, halign: 'center' },
                14: { cellWidth: 14, halign: 'center' },
                15: { cellWidth: 14, halign: 'center' },
                16: { cellWidth: 14, halign: 'center' },
                17: { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] },
                18: { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 14, right: 14 }
        });

        // Signatures at footer
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);

        doc.line(20, 192, 70, 192);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text('Class Teacher Signature', 45, 196, { align: 'center' });

        doc.line(125, 192, 175, 192);
        doc.text('Accounts Officer / Cashier', 150, 196, { align: 'center' });

        doc.line(225, 192, 275, 192);
        doc.text('Principal Stamp & Signature', 250, 196, { align: 'center' });

        // Bottom Bar
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 205, 297, 5, 'F');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(`Generated on ${new Date().toLocaleString('en-PK')} | Total Paid: PKR ${grandTotalPaid.toLocaleString()} | Total Dues: PKR ${grandTotalBalance.toLocaleString()}`, 148.5, 208.5, { align: 'center' });

        const safeClassName = String(className || 'Class').replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`ClassLedger_${safeClassName}_${selectedYear}.pdf`);
        return true;
    } catch (e) {
        console.error("Error generating class ledger PDF:", e);
        alert("Failed to export Class Ledger PDF: " + e.message);
        return false;
    }
};

// Global In-Memory RAM Cache & Singleton Realtime Subscription Hub
// Survives component unmounts and tab navigation for 0ms instantaneous loading and 0 repeated Firestore reads.
const _globalFeeMatrixCache = {
    studentsMapBySchool: {}, // { [schoolId]: { [classId]: [students] } }
    unsubsBySchool: {},       // { [schoolId]: [unsubFns] }
    subscribersBySchool: {},  // { [schoolId]: Set<callback> }
    classesKeyBySchool: {}
};

// Helper: Parse student paid months into a set of 0-indexed month numbers for target year
export const parseStudentPaidMonthsSet = (student, targetYear) => {
    return parseStudentPaidMonthsSetPipeline(student, targetYear);
};

// Helper: Calculate Itemized Student Fee Breakdown
export const calculateItemizedFeeBreakdown = (student, currentAction = null, feeSettings = {}, targetMonthIdx = 0, targetYear = 2026) => {
    return calculateItemizedFeeBreakdownPipeline(student, currentAction, feeSettings, targetMonthIdx, targetYear);
};

// Helper: Safe Initial Students Map from In-Memory RAM or Session Storage (0ms instant)
const getInitialStudentsMap = (schoolId) => {
    if (!schoolId) return {};
    if (_globalFeeMatrixCache.studentsMapBySchool[schoolId] && Object.keys(_globalFeeMatrixCache.studentsMapBySchool[schoolId]).length > 0) {
        return _globalFeeMatrixCache.studentsMapBySchool[schoolId];
    }
    try {
        const cached = sessionStorage.getItem(`fee_matrix_cache_${schoolId}`);
        if (cached) {
            const parsed = JSON.parse(cached);
            _globalFeeMatrixCache.studentsMapBySchool[schoolId] = parsed;
            return parsed;
        }
    } catch (e) {}
    return {};
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

    // State - Initialized 0ms Instant from In-Memory Cache
    const [selectedYear, setSelectedYear] = useState(currentYearNum);
    const [localClasses, setLocalClasses] = useState(classes || []);
    const [studentsMap, setStudentsMap] = useState(() => getInitialStudentsMap(schoolId));
    const [loading, setLoading] = useState(() => {
        if (!schoolId) return false;
        const initial = getInitialStudentsMap(schoolId);
        return Object.keys(initial).length === 0;
    });
    
    // Drilldown State: Level 1 (null), Level 2 (selectedMonthIdx), Level 3 (selectedClassId)
    const [selectedMonthIdx, setSelectedMonthIdx] = useState(currentMonthIdx);
    const [selectedClassId, setSelectedClassId] = useState(null);
    const [defaulterFilter, setDefaulterFilter] = useState('all'); // 'all', 'defaulters_only', 'paid_only', 'concession_only'
    const [searchQuery, setSearchQuery] = useState('');
    const [classViewMode, setClassViewMode] = useState('grid'); // 'grid' | 'table'

    // Quick Collect Fee Modal State
    const [collectingStudent, setCollectingStudent] = useState(null);
    const [collectPaymentMode, setCollectPaymentMode] = useState('Cash');
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
    const [copiedPhone, setCopiedPhone] = useState(null);
    const [isInjectingDemo, setIsInjectingDemo] = useState(false);

    // Strict Demo Account Guard (Only School ID 6257 can view and use demo injection)
    const isDemoSchool = String(schoolId || '').trim() === '6257' || String(schoolInfo?.schoolId || '').trim() === '6257' || String(schoolInfo?.id || '').trim() === '6257';

    // Interactive Student Fee Card Modal State
    const [selectedFeeCardData, setSelectedFeeCardData] = useState(null);
    const [isExportingClassPDF, setIsExportingClassPDF] = useState(false);
    const [proofModalUrl, setProofModalUrl] = useState(null);
    const [cardViewTab, setCardViewTab] = useState('voucher'); // 'voucher' | 'slip'
    const [slipZoom, setSlipZoom] = useState(1);
    const [slipRotation, setSlipRotation] = useState(0);

    const handleOpenFeeCardModal = (st, breakdown, isPaid, e, targetMonth = null) => {
        setCardViewTab('voucher');
        setSlipZoom(1);
        setSlipRotation(0);
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
        const mIdx = (targetMonth !== null && targetMonth !== undefined) ? targetMonth : (selectedMonthIdx !== null ? selectedMonthIdx : currentMonthIdx);
        const fin = getStudentMonthFinancialStatus(st, mIdx, selectedYear, currentAction, feeSettings);
        const b = breakdown || fin.breakdown;
        setSelectedFeeCardData({
            student: st,
            breakdown: b,
            monthFinancial: fin,
            isPaid: fin.status === 'paid' || fin.is100PercentFree,
            targetMonthName: MONTH_NAMES[mIdx],
            targetMonthIdx: mIdx,
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

    // 1. High-Performance Zero-Cost Real-Time Listener Hub with In-Memory RAM Caching & Offline Broadcasts
    useEffect(() => {
        if (!schoolId) {
            setLoading(false);
            return;
        }

        let isMounted = true;

        // Register subscriber for live multi-instance and instant offline broadcast updates
        if (!_globalFeeMatrixCache.subscribersBySchool[schoolId]) {
            _globalFeeMatrixCache.subscribersBySchool[schoolId] = new Set();
        }
        const subscriberCallback = (updatedMap) => {
            if (isMounted) {
                setStudentsMap(updatedMap);
                setLoading(false);
            }
        };
        _globalFeeMatrixCache.subscribersBySchool[schoolId].add(subscriberCallback);

        // Instant Offline Event Handler (Triggers when any counter fee collection or approval occurs)
        const handleOfflineMatrixEvent = (e) => {
            if (e && e.detail && e.detail.schoolId && String(e.detail.schoolId) !== String(schoolId)) return;
            const liveMap = _globalFeeMatrixCache.studentsMapBySchool[schoolId] || getInitialStudentsMap(schoolId);
            if (isMounted && Object.keys(liveMap).length > 0) {
                setStudentsMap({ ...liveMap });
                setLoading(false);
            }
        };
        window.addEventListener('student-fee-matrix-updated', handleOfflineMatrixEvent);
        window.addEventListener('offline-fee-sync', handleOfflineMatrixEvent);

        // Hydrate from IndexedDB in background if memory cache is currently empty
        if (Object.keys(_globalFeeMatrixCache.studentsMapBySchool[schoolId] || {}).length === 0) {
            getCachedStudentsOffline(schoolId).then(cachedList => {
                if (!isMounted) return;
                if (cachedList && cachedList.length > 0) {
                    const grouped = {};
                    cachedList.forEach(st => {
                        if (!grouped[st.classId]) grouped[st.classId] = [];
                        grouped[st.classId].push(st);
                    });
                    if (!_globalFeeMatrixCache.studentsMapBySchool[schoolId] || Object.keys(_globalFeeMatrixCache.studentsMapBySchool[schoolId]).length === 0) {
                        _globalFeeMatrixCache.studentsMapBySchool[schoolId] = grouped;
                        setStudentsMap(grouped);
                        setLoading(false);
                    }
                }
            }).catch(() => {});
        }

        if (!localClasses || localClasses.length === 0) {
            const timer = setTimeout(() => {
                if (isMounted) setLoading(false);
            }, 300);
            return () => {
                isMounted = false;
                clearTimeout(timer);
                _globalFeeMatrixCache.subscribersBySchool[schoolId]?.delete(subscriberCallback);
                window.removeEventListener('student-fee-matrix-updated', handleOfflineMatrixEvent);
                window.removeEventListener('offline-fee-sync', handleOfflineMatrixEvent);
            };
        }

        // Check if persistent singleton listeners are already active for this school & classesKey
        const existingUnsubs = _globalFeeMatrixCache.unsubsBySchool[schoolId];
        const existingKey = _globalFeeMatrixCache.classesKeyBySchool[schoolId];

        if (existingUnsubs && existingUnsubs.length > 0 && existingKey === classesKey) {
            // Listeners are ALREADY actively streaming in background! 0 new queries, 0 read billing cost!
            if (_globalFeeMatrixCache.studentsMapBySchool[schoolId] && Object.keys(_globalFeeMatrixCache.studentsMapBySchool[schoolId]).length > 0) {
                setStudentsMap(_globalFeeMatrixCache.studentsMapBySchool[schoolId]);
                setLoading(false);
            }
            return () => {
                isMounted = false;
                _globalFeeMatrixCache.subscribersBySchool[schoolId]?.delete(subscriberCallback);
                window.removeEventListener('student-fee-matrix-updated', handleOfflineMatrixEvent);
                window.removeEventListener('offline-fee-sync', handleOfflineMatrixEvent);
            };
        }

        // Clean up any stale listeners if class list changed
        if (existingUnsubs && existingUnsubs.length > 0) {
            existingUnsubs.forEach(fn => {
                try { fn(); } catch (e) {}
            });
        }

        // Attach fresh singleton real-time listeners across classes
        const unsubs = [];
        let pendingBatch = {};
        let batchTimer = null;

        const notifyAllSubscribers = (freshMap) => {
            _globalFeeMatrixCache.studentsMapBySchool[schoolId] = freshMap;
            try {
                sessionStorage.setItem(`fee_matrix_cache_${schoolId}`, JSON.stringify(freshMap));
            } catch (e) {}
            const subs = _globalFeeMatrixCache.subscribersBySchool[schoolId];
            if (subs) {
                subs.forEach(cb => {
                    try { cb(freshMap); } catch (e) {}
                });
            }
        };

        const flushBatch = () => {
            const currentCache = _globalFeeMatrixCache.studentsMapBySchool[schoolId] || {};
            const merged = {
                ...currentCache,
                ...pendingBatch
            };
            pendingBatch = {};
            notifyAllSubscribers(merged);
        };

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

                // Cache to IndexedDB asynchronously in background (non-blocking)
                cacheStudentsOffline(schoolId, studs);

                pendingBatch[cls.id] = studs;
                if (batchTimer) clearTimeout(batchTimer);
                batchTimer = setTimeout(flushBatch, 40);
            }, (err) => {
                console.warn(`Realtime student stream warning for ${cls.name}:`, err);
                if (isMounted) setLoading(false);
            });
            unsubs.push(unsub);
        });

        _globalFeeMatrixCache.unsubsBySchool[schoolId] = unsubs;
        _globalFeeMatrixCache.classesKeyBySchool[schoolId] = classesKey;

        return () => {
            isMounted = false;
            if (batchTimer) clearTimeout(batchTimer);
            _globalFeeMatrixCache.subscribersBySchool[schoolId]?.delete(subscriberCallback);
            window.removeEventListener('student-fee-matrix-updated', handleOfflineMatrixEvent);
            window.removeEventListener('offline-fee-sync', handleOfflineMatrixEvent);
        };
    }, [schoolId, classesKey]);

    // Flatten and pre-process all students with O(1) Precomputed Annual Financial Cache (0ms instant month click)
    const processedStudents = useMemo(() => {
        const list = [];
        Object.values(studentsMap).forEach(arr => {
            if (Array.isArray(arr)) {
                arr.forEach(st => {
                    const paidMonthsSet = parseStudentPaidMonthsSet(st, selectedYear);
                    const fatherPhone = st.fatherPhone || st.phone || st.parentPhone || st.whatsapp || st.contact || st.emergencyContact || st.guardianPhone || st.parentDetails?.phone || st.parentDetails?.parentPhone || st.parentDetails?.fatherPhone || st.parentDetails?.emergencyPhone || st.parentDetails?.whatsapp || '';
                    const fatherName = st.fatherName || st.parentDetails?.fatherName || st.guardianName || 'Guardian';
                    const rollNo = st.rollNo || st.rollNumber || st.admissionNumber || st.id.slice(-4);

                    // Pre-compute 12-month financial status once per student in RAM
                    const monthsData = [];
                    let totalPaidYear = 0;
                    let currentDueBalance = 0;
                    let unpaidMonthsCount = 0;
                    let hasPartial = false;

                    for (let m = 0; m < 12; m++) {
                        const fin = getStudentMonthFinancialStatus(st, m, selectedYear, currentAction, feeSettings);
                        monthsData.push(fin);

                        const isPastOrCurrent = (selectedYear < currentYearNum) || (selectedYear === currentYearNum && m <= currentMonthIdx);

                        if (fin.status === 'paid' || fin.is100PercentFree) {
                            totalPaidYear += (fin.paidAmount || fin.expectedAmount);
                        } else if (fin.status === 'partial') {
                            totalPaidYear += (fin.paidAmount || 0);
                            if (isPastOrCurrent) {
                                hasPartial = true;
                                currentDueBalance += (fin.remainingBalance || 0);
                            }
                        } else {
                            if (isPastOrCurrent) {
                                unpaidMonthsCount++;
                                currentDueBalance += (fin.expectedAmount || 0);
                            }
                        }
                    }

                    const isDefaulter = unpaidMonthsCount >= 2;
                    const isFullyPaidUpToCurrent = (currentDueBalance === 0);

                    list.push({
                        ...st,
                        paidMonthsSet,
                        fatherPhone,
                        fatherName,
                        rollNo,
                        monthsData,
                        totalPaidYear,
                        currentDueBalance,
                        totalBalanceYear: currentDueBalance,
                        unpaidMonthsCount,
                        isDefaulter,
                        hasPartial,
                        allPaid: isFullyPaidUpToCurrent,
                        isFullyPaidUpToCurrent
                    });
                });
            }
        });
        return list;
    }, [studentsMap, selectedYear, currentYearNum, currentMonthIdx, currentAction, feeSettings]);

    // 2. Compute 12-Month Matrix Aggregation (Level 1) - SSOT Unified (O(1) Instant reads from RAM)
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
                const fin = st.monthsData[m];
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
    }, [processedStudents, selectedYear, currentYearNum, currentMonthIdx]);

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

    // 3. Compute Class-Wise Breakdown for Selected Month (Level 2) - O(1) Instant Filter
    const selectedMonthMeta = yearlyMatrix[selectedMonthIdx] || yearlyMatrix[0] || {};

    const classBreakdown = useMemo(() => {
        if (selectedMonthIdx === null) return [];

        const studentsByClass = {};
        processedStudents.forEach(st => {
            if (!studentsByClass[st.classId]) studentsByClass[st.classId] = [];
            studentsByClass[st.classId].push(st);
        });

        return localClasses.map(cls => {
            const studsInClass = studentsByClass[cls.id] || [];
            let paidCount = 0;
            let unpaidCount = 0;
            let collectedAmount = 0;
            let pendingAmount = 0;
            let totalAmount = 0;

            studsInClass.forEach(st => {
                const fin = st.monthsData[selectedMonthIdx] || {};
                const fee = fin.expectedAmount || 0;
                totalAmount += fee;
                if (fin.status === 'paid' || fin.is100PercentFree) {
                    paidCount++;
                    collectedAmount += (fin.paidAmount || fee);
                } else if (fin.status === 'partial') {
                    collectedAmount += (fin.paidAmount || 0);
                    pendingAmount += (fin.remainingBalance || 0);
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
    }, [localClasses, processedStudents, selectedMonthIdx]);

    // Compute Overall Totals for Class Summary Table
    const classTotals = useMemo(() => {
        let totalStudents = 0;
        let paidCount = 0;
        let unpaidCount = 0;
        let collectedAmount = 0;
        let pendingAmount = 0;
        let totalAmount = 0;
        classBreakdown.forEach(c => {
            totalStudents += c.totalStudents || 0;
            paidCount += c.paidCount || 0;
            unpaidCount += c.unpaidCount || 0;
            collectedAmount += c.collectedAmount || 0;
            pendingAmount += c.pendingAmount || 0;
            totalAmount += c.totalAmount || 0;
        });
        const avgRecoveryRate = totalAmount > 0 
            ? Math.min(100, Math.round((collectedAmount / totalAmount) * 100)) 
            : 0;
        return { totalStudents, paidCount, unpaidCount, collectedAmount, pendingAmount, totalAmount, avgRecoveryRate };
    }, [classBreakdown]);

    // 4. Compute Student List for Level 3 (Annual 12-Month Matrix Sheet & Ledger) - O(1) Instant Selection
    const enrichedClassStudents = useMemo(() => {
        const source = selectedClassId 
            ? processedStudents.filter(s => s.classId === selectedClassId) 
            : processedStudents;

        const currentTargetIdx = selectedMonthIdx !== null ? selectedMonthIdx : currentMonthIdx;

        return source.map((st) => {
            const currentMonthFin = st.monthsData[currentTargetIdx] || st.monthsData[0];
            const isPaidCurrentMonth = currentMonthFin?.status === 'paid' || currentMonthFin?.is100PercentFree;
            const isPartialCurrentMonth = currentMonthFin?.status === 'partial';

            return {
                ...st,
                breakdown: currentMonthFin.breakdown,
                feeAmount: currentMonthFin.expectedAmount,
                monthFinancial: currentMonthFin,
                isPaidForMonth: isPaidCurrentMonth,
                isPartialForMonth: isPartialCurrentMonth
            };
        });
    }, [selectedClassId, processedStudents, selectedMonthIdx, currentMonthIdx]);

    // Summary counts for filter pills and Level 3 KPIs
    const classFilterCounts = useMemo(() => {
        let total = enrichedClassStudents.length;
        let pending = 0;
        let paid = 0;
        let free = 0;
        let totalPendingAmount = 0;

        enrichedClassStudents.forEach(st => {
            if (st.currentDueBalance > 0) {
                pending++;
                totalPendingAmount += st.currentDueBalance;
            } else {
                paid++;
            }
            if (st.breakdown?.is100PercentFree || checkIs100PercentFree(st)) {
                free++;
            }
        });

        return { total, pending, paid, free, totalPendingAmount };
    }, [enrichedClassStudents]);

    const activeStudentList = useMemo(() => {
        // Filter based on Tab Filter and Search
        const q = searchQuery.toLowerCase().trim();
        const filtered = enrichedClassStudents.filter(st => {
            if (defaulterFilter === 'pending_only' && st.currentDueBalance <= 0) return false;
            if (defaulterFilter === 'paid_only' && !st.isFullyPaidUpToCurrent) return false;
            if (defaulterFilter === 'concession_only' && !st.breakdown?.is100PercentFree && !checkIs100PercentFree(st)) return false;

            if (q) {
                const nameMatch = (st.name || st.studentName || '').toLowerCase().includes(q);
                const fatherMatch = (st.fatherName || '').toLowerCase().includes(q);
                const rollMatch = String(st.rollNo || '').toLowerCase().includes(q);
                const admMatch = String(st.admissionNo || st.admissionNumber || st.id || '').toLowerCase().includes(q);
                const phoneMatch = String(st.fatherPhone || '').toLowerCase().includes(q);
                const classMatch = (st.className || '').toLowerCase().includes(q);
                return nameMatch || fatherMatch || rollMatch || admMatch || phoneMatch || classMatch;
            }

            return true;
        });

        // Auto-Sorting:
        // 1. Fully Cleared students (current & previous months paid, balance = 0) at the TOP!
        // 2. Pending below.
        // 3. Within each group, ordered by numeric Roll Number.
        return filtered.sort((a, b) => {
            const aGroup = a.isFullyPaidUpToCurrent ? 0 : 1;
            const bGroup = b.isFullyPaidUpToCurrent ? 0 : 1;
            if (aGroup !== bGroup) {
                return aGroup - bGroup;
            }
            const aRoll = parseInt(String(a.rollNo || '').replace(/\D/g, ''), 10) || 0;
            const bRoll = parseInt(String(b.rollNo || '').replace(/\D/g, ''), 10) || 0;
            return aRoll - bRoll;
        });
    }, [enrichedClassStudents, defaulterFilter, searchQuery]);

    // Action: WhatsApp Reminder Message Sender with Itemized Professional Invoice
    const handleSendWhatsAppReminder = useCallback((student) => {
        let rawPhone = student.fatherPhone || student.phone || student.parentPhone || student.whatsapp || student.contact || student.emergencyContact || student.guardianPhone || student.parentDetails?.phone || student.parentDetails?.parentPhone || student.parentDetails?.fatherPhone || student.parentDetails?.emergencyPhone || student.parentDetails?.whatsapp || '';
        let phone = String(rawPhone).replace(/[^0-9]/g, '');
        if (!phone) {
            alert('Parent phone number not available for this student.');
            return;
        }

        if (phone.startsWith('03')) {
            phone = '92' + phone.slice(1);
        } else if (phone.startsWith('3') && phone.length === 10) {
            phone = '92' + phone;
        }

        const targetMIdx = selectedMonthIdx !== null ? selectedMonthIdx : currentMonthIdx;
        const targetMonthName = MONTH_NAMES[targetMIdx] || 'Current Month';
        const schoolName = (schoolInfo?.name || schoolInfo?.schoolName || 'ACADEMIC EXCELLENCE MODEL SCHOOL').toUpperCase();
        const schoolPhone = schoolInfo?.phone || schoolInfo?.contact || '';
        const schoolAddress = schoolInfo?.address || '';
        const studentName = student.name || student.studentName || 'Student';
        const fatherName = student.fatherName || student.parentDetails?.fatherName || '--';
        const className = student.className || 'Class';
        const rollNo = student.rollNo || '--';
        const admNo = student.admissionNo || student.admissionNumber || (student.id ? student.id.slice(-4) : '--');

        // Current Month Details
        const currentFin = student.monthsData?.[targetMIdx] || student.monthFinancial || {};
        const b = currentFin.breakdown || student.breakdown || {};
        const currentMonthDue = currentFin.remainingBalance !== undefined ? currentFin.remainingBalance : (currentFin.expectedAmount || b.totalPayable || 0);

        // Build Current Month Itemized Breakdown
        const currentItems = [];
        if (b.tuitionPayable > 0) {
            currentItems.push(`• Tuition Fee: PKR ${Number(b.tuitionPayable).toLocaleString()}`);
        }
        if (b.transportFee > 0) {
            currentItems.push(`• Transport / Van Fee: PKR ${Number(b.transportFee).toLocaleString()}`);
        }
        if (b.storeDues > 0) {
            currentItems.push(`• School Store & Uniform: PKR ${Number(b.storeDues).toLocaleString()}`);
        }
        if (Array.isArray(b.customItems) && b.customItems.length > 0) {
            b.customItems.forEach(ci => {
                const amt = Number(ci.amount || 0);
                if (amt > 0) {
                    currentItems.push(`• Action/Exam (${cleanFeeItemName(ci.title || ci.name)}): PKR ${amt.toLocaleString()}`);
                }
            });
        } else if (b.actionFee > 0) {
            currentItems.push(`• Action Charges (${cleanFeeItemName(b.actionName)}): PKR ${Number(b.actionFee).toLocaleString()}`);
        }
        if (b.penaltyFine > 0) {
            currentItems.push(`• Late Fee Fine: PKR ${Number(b.penaltyFine).toLocaleString()}`);
        }

        // Build Previous Months Overdue List
        const previousUnpaidItems = [];
        let previousArrearsSum = 0;

        for (let m = 0; m < targetMIdx; m++) {
            const mFin = student.monthsData?.[m];
            if (mFin && !mFin.isFuture && mFin.status !== 'paid' && !mFin.is100PercentFree) {
                const due = mFin.remainingBalance !== undefined ? mFin.remainingBalance : (mFin.expectedAmount || 0);
                if (due > 0) {
                    previousArrearsSum += due;
                    const mName = MONTH_NAMES[m];
                    const label = mFin.status === 'partial' ? `Partial Balance` : `Unpaid Tuition & Dues`;
                    previousUnpaidItems.push(`• ${mName} ${selectedYear} (${label}): PKR ${due.toLocaleString()}`);
                }
            }
        }

        // Grand Total Outstanding
        const grandTotalDue = student.currentDueBalance !== undefined ? student.currentDueBalance : (previousArrearsSum + currentMonthDue);

        // Format Complete Professional Invoice Notice
        let invoiceText = `━━━━━━━━━━━━━━━━━━━━━\n`;
        invoiceText += `🏫 *${schoolName}*\n`;
        invoiceText += `📋 *OFFICIAL FEE INVOICE & NOTICE*\n`;
        invoiceText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
        invoiceText += `👤 *Student Particulars:*\n`;
        invoiceText += `• Student: *${studentName}*\n`;
        invoiceText += `• Father: *${fatherName}*\n`;
        invoiceText += `• Class: *${className}* | Roll #: *${rollNo}* | Adm #: *${admNo}*\n`;
        invoiceText += `• Billing Period: *${targetMonthName} ${selectedYear}*\n`;
        invoiceText += `• Issue Date: *${new Date().toLocaleDateString('en-GB')}*\n\n`;

        invoiceText += `📑 *Current Month Particulars (${targetMonthName} ${selectedYear}):*\n`;
        if (currentItems.length > 0) {
            invoiceText += currentItems.join('\n') + `\n`;
        } else {
            invoiceText += `• Standard Monthly Fee: PKR ${currentMonthDue.toLocaleString()}\n`;
        }
        invoiceText += `➜ *Current Month Net:* PKR ${currentMonthDue.toLocaleString()}\n`;

        if (previousUnpaidItems.length > 0) {
            invoiceText += `\n⚠️ *Prior Overdue Arrears (${previousUnpaidItems.length} Months):*\n`;
            invoiceText += previousUnpaidItems.join('\n') + `\n`;
            invoiceText += `➜ *Total Prior Arrears:* PKR ${previousArrearsSum.toLocaleString()}\n`;
        }

        invoiceText += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
        invoiceText += `💵 *TOTAL NET PAYABLE: PKR ${grandTotalDue.toLocaleString()}*\n`;
        invoiceText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

        invoiceText += `📌 *Important Instructions:*\n`;
        invoiceText += `1. Please deposit the outstanding dues at the school accounts counter by due date.\n`;
        invoiceText += `2. Online transfers can be verified via official accounts office.\n`;
        invoiceText += `3. Please retain this invoice message for official record.\n\n`;

        if (schoolPhone || schoolAddress) {
            invoiceText += `📞 *Accounts Office Contact:*\n`;
            if (schoolPhone) invoiceText += `• Contact: ${schoolPhone}\n`;
            if (schoolAddress) invoiceText += `• Address: ${schoolAddress}\n`;
        }

        invoiceText += `\nThank you,\n*School Accounts & Administration*`;

        const encoded = encodeURIComponent(invoiceText);
        window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    }, [selectedMonthIdx, currentMonthIdx, selectedYear, schoolInfo]);

    // Action: Copy WhatsApp Reminder text
    const handleCopyReminder = useCallback((student) => {
        const targetMIdx = selectedMonthIdx !== null ? selectedMonthIdx : currentMonthIdx;
        const targetMonthName = MONTH_NAMES[targetMIdx] || 'Current Month';
        const schoolName = schoolInfo?.name || schoolInfo?.schoolName || 'School Administration';
        const studentName = student.name || student.studentName || 'Student';
        const className = student.className || 'Class';
        const grandTotalDue = student.currentDueBalance !== undefined ? student.currentDueBalance : (student.breakdown?.totalPayable || 0);

        const text = `Official Fee Notice: Student ${studentName} (Class: ${className}, Roll #: ${student.rollNo}) has total outstanding dues of PKR ${grandTotalDue.toLocaleString()} for ${targetMonthName} ${selectedYear}. Please deposit at school accounts counter. - ${schoolName}`;

        navigator.clipboard.writeText(text);
        setCopiedPhone(student.id);
        setTimeout(() => setCopiedPhone(null), 2000);
    }, [selectedMonthIdx, currentMonthIdx, selectedYear, schoolInfo]);

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
            const liveMap = _globalFeeMatrixCache.studentsMapBySchool[schoolId] || studentsMap || {};
            const arr = liveMap[collectingStudent.classId] || [];
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
            const freshMap = { ...liveMap, [collectingStudent.classId]: updated };
            _globalFeeMatrixCache.studentsMapBySchool[schoolId] = freshMap;
            setStudentsMap(freshMap);
            try {
                sessionStorage.setItem(`fee_matrix_cache_${schoolId}`, JSON.stringify(freshMap));
            } catch (e) {}
            window.dispatchEvent(new CustomEvent('student-fee-matrix-updated', { detail: { schoolId, studentId: collectingStudent.id } }));

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

        if (!isDemoSchool) {
            alert("Restricted: Demo data injection is only available for Demo Account 6257.");
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
            {/* LEVEL 1: 12-Month Yearly Overview Grid */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                                12-Month Yearly Matrix ({selectedYear})
                            </h3>
                            {isDemoSchool && (
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
                            )}
                        </div>
                        <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                            Click any month card to inspect class-wise recovery and open student defaulters.
                        </p>
                    </div>

                    {/* Right Controls: Due Date/Fine Settings, Action, & Year Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Inline Fee Settings (Due Date & Penalty) */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: '#f8fafc', padding: '0.35rem 0.7rem',
                            borderRadius: '12px', border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: '700' }}>Due Day:</span>
                                <input
                                    type="text"
                                    placeholder="10th"
                                    value={feeSettings?.dueDate || ''}
                                    onChange={(e) => setFeeSettings && setFeeSettings({ ...feeSettings, dueDate: e.target.value })}
                                    style={{
                                        padding: '0.2rem 0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1',
                                        background: '#ffffff', color: '#0f172a', width: '45px', fontSize: '0.8rem', outline: 'none', fontWeight: '700'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: '700' }}>Fine:</span>
                                <input
                                    type="number"
                                    placeholder="200"
                                    value={feeSettings?.penaltyAmount || ''}
                                    onChange={(e) => setFeeSettings && setFeeSettings({ ...feeSettings, penaltyAmount: e.target.value })}
                                    style={{
                                        padding: '0.2rem 0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1',
                                        background: '#ffffff', color: '#0f172a', width: '55px', fontSize: '0.8rem', outline: 'none', fontWeight: '700'
                                    }}
                                />
                            </div>
                            <button
                                onClick={onSaveFeeSettings}
                                disabled={isSavingFeeSettings}
                                style={{
                                    padding: '0.25rem 0.6rem', borderRadius: '6px', border: 'none',
                                    background: '#4f46e5', color: 'white', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer'
                                }}
                            >
                                {isSavingFeeSettings ? '...' : 'Save'}
                            </button>
                        </div>

                        {/* Current Action / New Action Button */}
                        {currentAction ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                background: '#fef3c7', padding: '0.35rem 0.7rem',
                                borderRadius: '12px', border: '1px solid #fde68a'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.62rem', color: '#92400e', textTransform: 'uppercase', fontWeight: '800' }}>Action</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#78350f' }}>{currentAction.name}</div>
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
                                    padding: '0.45rem 0.8rem', borderRadius: '12px', border: '1px solid #e2e8f0',
                                    background: '#ffffff', color: '#334155', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                            >
                                <Plus size={14} />
                                New Action
                            </button>
                        )}

                        {/* Academic Year Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', padding: '0.25rem 0.4rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            {[currentYearNum - 1, currentYearNum, currentYearNum + 1].map(yr => (
                                <button
                                    key={yr}
                                    onClick={() => setSelectedYear(yr)}
                                    style={{
                                        padding: '0.3rem 0.65rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        fontWeight: '800',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        background: selectedYear === yr ? '#4f46e5' : 'transparent',
                                        color: selectedYear === yr ? '#ffffff' : '#64748b',
                                        boxShadow: selectedYear === yr ? '0 2px 4px rgba(79, 70, 229, 0.25)' : 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {yr}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Status Legend Strip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', fontWeight: '600', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
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
                    // === DEDICATED 12-MONTH CLASS FEE MATRIX & LEDGER SHEET ===
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Class Header & Action Toolbar */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                            borderBottom: '1px solid #e2e8f0',
                            paddingBottom: '1.25rem'
                        }}>
                            <div>
                                <button
                                    onClick={() => { setSelectedClassId(null); setSearchQuery(''); setDefaulterFilter('all'); }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        background: '#eef2ff',
                                        color: '#4338ca',
                                        border: '1px solid #c7d2fe',
                                        borderRadius: '10px',
                                        padding: '0.4rem 0.85rem',
                                        fontSize: '0.8rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        marginBottom: '0.6rem',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <ArrowLeft size={16} /> ← Back to All Classes
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                                    <h3 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a', margin: 0 }}>
                                        {localClasses.find(c => c.id === selectedClassId)?.name || 'Class'} Fee Matrix
                                    </h3>
                                    <span style={{ fontSize: '0.85rem', color: '#475569', background: '#f1f5f9', padding: '3px 10px', borderRadius: '8px', fontWeight: '700' }}>
                                        Teacher: {localClasses.find(c => c.id === selectedClassId)?.teacher || 'Class Teacher'}
                                    </span>
                                    <span style={{ fontSize: '0.85rem', color: '#6366f1', background: '#eef2ff', padding: '3px 10px', borderRadius: '8px', fontWeight: '800' }}>
                                        Session: {selectedYear}
                                    </span>
                                </div>
                            </div>

                            {/* Top Right Action & Export Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                {/* Download Class Ledger PDF Button */}
                                <button
                                    onClick={async () => {
                                        const currClass = localClasses.find(c => c.id === selectedClassId);
                                        if (!currClass) return;
                                        setIsExportingClassPDF(true);
                                        try {
                                            await downloadClassLedgerPDF({
                                                className: currClass.name || currClass.className || 'Class',
                                                teacherName: currClass.teacher || currClass.teacherName || 'Class Teacher',
                                                students: activeStudentList
                                            }, schoolInfo, selectedYear, feeSettings, currentAction);
                                        } finally {
                                            setIsExportingClassPDF(false);
                                        }
                                    }}
                                    disabled={isExportingClassPDF || activeStudentList.length === 0}
                                    title="Export and Download Official Landscape Class Fee Ledger PDF"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        background: isExportingClassPDF ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '12px',
                                        padding: '0.55rem 1.1rem',
                                        fontSize: '0.82rem',
                                        fontWeight: '800',
                                        cursor: isExportingClassPDF ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 4px 10px rgba(79, 70, 229, 0.28)',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {isExportingClassPDF ? (
                                        <>
                                            <RefreshCw size={15} className="animate-spin" />
                                            <span>Exporting PDF...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Download size={15} />
                                            <span>Download Class Ledger PDF</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Summary KPI Strip for Class (Unified Till Current Active Month) */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '0.75rem'
                        }}>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.75rem 1rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Total Students</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#0f172a', marginTop: '0.15rem' }}>{classFilterCounts.total}</div>
                            </div>
                            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '14px', padding: '0.75rem 1rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#065f46', textTransform: 'uppercase' }}>
                                    Fully Cleared (0 Due)
                                </div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#059669', marginTop: '0.15rem' }}>
                                    {classFilterCounts.paid} <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#047857' }}>Students</span>
                                </div>
                            </div>
                            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '14px', padding: '0.75rem 1rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>
                                    Total Pending Students
                                </div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#ea580c', marginTop: '0.15rem' }}>
                                    {classFilterCounts.pending} <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#c2410c' }}>Students</span>
                                </div>
                            </div>
                            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '14px', padding: '0.75rem 1rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#9f1239', textTransform: 'uppercase' }}>
                                    Total Pending Amount (Till Current Month)
                                </div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#e11d48', marginTop: '0.15rem' }}>
                                    {formatPKR(classFilterCounts.totalPendingAmount)}
                                </div>
                            </div>
                        </div>

                        {/* Search & Filter Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', minWidth: '240px', flex: '1 1 240px', maxWidth: '400px' }}>
                                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by student name, father, roll #, adm #..."
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

                            {/* Filter Pills */}
                            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '12px', flexWrap: 'wrap', gap: '2px' }}>
                                <button
                                    onClick={() => setDefaulterFilter('all')}
                                    style={{
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        background: defaulterFilter === 'all' ? 'white' : 'transparent',
                                        color: defaulterFilter === 'all' ? '#0f172a' : '#64748b',
                                        boxShadow: defaulterFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    All Students ({classFilterCounts.total})
                                </button>
                                <button
                                    onClick={() => setDefaulterFilter('pending_only')}
                                    style={{
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        background: defaulterFilter === 'pending_only' ? '#fff7ed' : 'transparent',
                                        color: defaulterFilter === 'pending_only' ? '#ea580c' : '#64748b',
                                        boxShadow: defaulterFilter === 'pending_only' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    🟠 Pending ({classFilterCounts.pending})
                                </button>
                                <button
                                    onClick={() => setDefaulterFilter('paid_only')}
                                    style={{
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        background: defaulterFilter === 'paid_only' ? '#dcfce7' : 'transparent',
                                        color: defaulterFilter === 'paid_only' ? '#166534' : '#64748b',
                                        boxShadow: defaulterFilter === 'paid_only' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    🟢 Fully Cleared ({classFilterCounts.paid})
                                </button>
                            </div>
                        </div>

                        {/* 12-MONTH SPREADSHEET LEDGER TABLE */}
                        {activeStudentList.length === 0 ? (
                            <div style={{
                                padding: '3.5rem 2rem',
                                textAlign: 'center',
                                background: '#f8fafc',
                                borderRadius: '16px',
                                border: '1.5px dashed #cbd5e1'
                            }}>
                                <CheckCircle2 size={42} color="#10b981" style={{ margin: '0 auto 0.75rem auto' }} />
                                <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1.15rem', fontWeight: '800' }}>No Students Match Filter</h4>
                                <p style={{ margin: '0.35rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                    Try clearing your search query or selecting "All Students" filter.
                                </p>
                            </div>
                        ) : (
                            <div style={{
                                overflowX: 'auto',
                                border: '1px solid #e2e8f0',
                                borderRadius: '18px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                background: 'white',
                                position: 'relative'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: '#0f172a', color: 'white', textAlign: 'center' }}>
                                            {/* Frozen Left Columns */}
                                            <th style={{
                                                position: 'sticky',
                                                left: 0,
                                                zIndex: 20,
                                                background: '#0f172a',
                                                padding: '0.85rem 0.6rem',
                                                fontWeight: '800',
                                                borderRight: '1px solid #334155',
                                                minWidth: '55px',
                                                fontSize: '0.75rem'
                                            }}>
                                                Roll #
                                            </th>
                                            <th style={{
                                                position: 'sticky',
                                                left: '55px',
                                                zIndex: 20,
                                                background: '#0f172a',
                                                padding: '0.85rem 0.6rem',
                                                fontWeight: '800',
                                                borderRight: '1px solid #334155',
                                                minWidth: '65px',
                                                fontSize: '0.75rem'
                                            }}>
                                                Adm #
                                            </th>
                                            <th style={{
                                                position: 'sticky',
                                                left: '120px',
                                                zIndex: 20,
                                                background: '#0f172a',
                                                padding: '0.85rem 0.85rem',
                                                fontWeight: '800',
                                                textAlign: 'left',
                                                borderRight: '2px solid #475569',
                                                minWidth: '180px',
                                                fontSize: '0.75rem'
                                            }}>
                                                Student & Father
                                            </th>

                                            {/* 12 Months Columns */}
                                            {MONTH_SHORT.map((mShort, mIdx) => {
                                                const isCurrentTargetMonth = mIdx === selectedMonthIdx;
                                                return (
                                                    <th key={mIdx} style={{
                                                        padding: '0.85rem 0.4rem',
                                                        fontWeight: '800',
                                                        minWidth: '78px',
                                                        fontSize: '0.75rem',
                                                        borderRight: '1px solid #334155',
                                                        background: isCurrentTargetMonth ? '#1e293b' : '#0f172a',
                                                        color: isCurrentTargetMonth ? '#38bdf8' : '#e2e8f0'
                                                    }}>
                                                        {mShort}
                                                        {isCurrentTargetMonth && (
                                                            <div style={{ fontSize: '0.62rem', color: '#38bdf8', fontWeight: '700' }}>Active</div>
                                                        )}
                                                    </th>
                                                );
                                            })}

                                            {/* Summary & Action Columns */}
                                            <th style={{
                                                padding: '0.85rem 0.6rem',
                                                fontWeight: '800',
                                                minWidth: '95px',
                                                fontSize: '0.75rem',
                                                borderRight: '1px solid #334155',
                                                background: '#881337',
                                                color: '#fecdd3'
                                            }}>
                                                Pending
                                            </th>
                                            <th style={{
                                                padding: '0.85rem 0.6rem',
                                                fontWeight: '800',
                                                minWidth: '100px',
                                                fontSize: '0.75rem'
                                            }}>
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeStudentList.map((st, sIdx) => {
                                            const roll = st.rollNo || (sIdx + 1);
                                            const adm = st.admissionNo || st.admissionNumber || (st.id ? st.id.slice(-4) : '--');
                                            const isRowAlt = sIdx % 2 === 1;
                                            const rowBg = isRowAlt ? '#f8fafc' : '#ffffff';

                                            return (
                                                <tr key={st.id || sIdx} style={{ background: rowBg, transition: 'background 0.1s ease' }}>
                                                    {/* Frozen Left Cell: Roll # */}
                                                    <td style={{
                                                        position: 'sticky',
                                                        left: 0,
                                                        zIndex: 10,
                                                        background: rowBg,
                                                        padding: '0.75rem 0.5rem',
                                                        textAlign: 'center',
                                                        fontWeight: '800',
                                                        color: '#0f172a',
                                                        borderRight: '1px solid #e2e8f0',
                                                        borderBottom: '1px solid #e2e8f0'
                                                    }}>
                                                        {roll}
                                                    </td>

                                                    {/* Frozen Left Cell: Adm # */}
                                                    <td style={{
                                                        position: 'sticky',
                                                        left: '55px',
                                                        zIndex: 10,
                                                        background: rowBg,
                                                        padding: '0.75rem 0.5rem',
                                                        textAlign: 'center',
                                                        fontWeight: '700',
                                                        color: '#64748b',
                                                        borderRight: '1px solid #e2e8f0',
                                                        borderBottom: '1px solid #e2e8f0',
                                                        fontSize: '0.75rem'
                                                    }}>
                                                        {adm}
                                                    </td>

                                                    {/* Frozen Left Cell: Student & Father */}
                                                    <td style={{
                                                        position: 'sticky',
                                                        left: '120px',
                                                        zIndex: 10,
                                                        background: rowBg,
                                                        padding: '0.75rem 0.85rem',
                                                        borderRight: '2px solid #cbd5e1',
                                                        borderBottom: '1px solid #e2e8f0'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: '#e2e8f0' }}>
                                                                <CachedImage
                                                                    src={st.avatar || st.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${st.id}`}
                                                                    alt="avatar"
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                />
                                                            </div>
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {st.name || st.studentName || 'Student'}
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                                    {st.fatherName || '--'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* 12 Month Cells */}
                                                    {st.monthsData.map((fin, mIdx) => {
                                                        const isPaid = fin.status === 'paid' || fin.is100PercentFree;
                                                        const isPartial = fin.status === 'partial';
                                                        const isFuture = (selectedYear > currentYearNum) || (selectedYear === currentYearNum && mIdx > currentMonthIdx) || fin.isFuture || fin.status === 'upcoming';
                                                        const isDefaulterMonth = !isPaid && !isPartial && !isFuture;

                                                        // Color Style Decision
                                                        let cellBg = '#e2e8f0';
                                                        let cellBorder = '#cbd5e1';
                                                        let cellTextColor = '#000000';
                                                        let statusLabel = `— Rs ${Number(fin.expectedAmount || 0).toLocaleString()}`;

                                                        if (fin.is100PercentFree) {
                                                             // Solid Green with Sharp Black Text
                                                             cellBg = '#22c55e';
                                                             cellBorder = '#16a34a';
                                                             cellTextColor = '#000000';
                                                             statusLabel = '🎓 Free';
                                                        } else if (isPaid) {
                                                             // Solid Green with Sharp Black Text (even if in advance for upcoming months)
                                                             cellBg = '#22c55e';
                                                             cellBorder = '#16a34a';
                                                             cellTextColor = '#000000';
                                                             statusLabel = `✓ Rs ${Number(fin.paidAmount || fin.expectedAmount).toLocaleString()}`;
                                                        } else if (isPartial) {
                                                             cellBg = '#fef3c7';
                                                             cellBorder = '#fcd34d';
                                                             cellTextColor = '#92400e';
                                                             statusLabel = `◐ Rs ${Number(fin.paidAmount).toLocaleString()}`;
                                                        } else if (isFuture) {
                                                             // Unpaid Upcoming month: Greyed background with sharp black bold text
                                                             cellBg = '#e2e8f0';
                                                             cellBorder = '#cbd5e1';
                                                             cellTextColor = '#000000';
                                                             statusLabel = `— Rs ${Number(fin.expectedAmount || 0).toLocaleString()}`;
                                                        } else if (isDefaulterMonth) {
                                                             cellBg = '#fee2e2';
                                                             cellBorder = '#fca5a5';
                                                             cellTextColor = '#b91c1c';
                                                             statusLabel = `✗ Rs ${Number(fin.expectedAmount).toLocaleString()}`;
                                                        }


                                                        return (
                                                            <td key={mIdx} style={{
                                                                padding: '0.45rem 0.35rem',
                                                                textAlign: 'center',
                                                                borderRight: '1px solid #f1f5f9',
                                                                borderBottom: '1px solid #e2e8f0'
                                                            }}>
                                                                <div
                                                                    onClick={(e) => handleOpenFeeCardModal(st, fin.breakdown, isPaid, e, mIdx)}
                                                                    style={{
                                                                        background: cellBg,
                                                                        border: `1px solid ${cellBorder}`,
                                                                        color: cellTextColor,
                                                                        borderRadius: '8px',
                                                                        padding: '0.35rem 0.25rem',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '900',
                                                                        cursor: 'pointer',
                                                                        userSelect: 'none'
                                                                    }}
                                                                >
                                                                    {statusLabel}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}

                                                    {/* Pending (Dues) */}
                                                    <td style={{
                                                        padding: '0.75rem 0.5rem',
                                                        textAlign: 'right',
                                                        fontWeight: '900',
                                                        color: (st.totalBalanceYear > 0) ? '#e11d48' : '#10b981',
                                                        borderRight: '1px solid #e2e8f0',
                                                        borderBottom: '1px solid #e2e8f0',
                                                        background: (st.totalBalanceYear > 0) ? (isRowAlt ? '#fff1f2' : '#fff5f6') : (isRowAlt ? '#f0fdf4' : '#f8fbf9')
                                                    }}>
                                                        Rs {Number(st.totalBalanceYear || 0).toLocaleString()}
                                                    </td>

                                                    {/* Actions */}
                                                    <td style={{
                                                        padding: '0.5rem 0.4rem',
                                                        textAlign: 'center',
                                                        borderBottom: '1px solid #e2e8f0'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                                                            {st.totalBalanceYear > 0 && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleSendWhatsAppReminder(st)}
                                                                        title="Send WhatsApp Reminder"
                                                                        style={{
                                                                            background: '#25d366',
                                                                            color: 'white',
                                                                            border: 'none',
                                                                            borderRadius: '8px',
                                                                            padding: '0.35rem 0.55rem',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: '800',
                                                                            cursor: 'pointer',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.25rem'
                                                                        }}
                                                                    >
                                                                        <Send size={12} />
                                                                    </button>

                                                                    <button
                                                                        onClick={() => navigate(`/collections?tab=workflow&classId=${st.classId || selectedClassId}&studentId=${st.id}`)}
                                                                        title="Collect Fee in Pipeline Cashier"
                                                                        style={{
                                                                            background: '#4f46e5',
                                                                            color: 'white',
                                                                            border: 'none',
                                                                            borderRadius: '8px',
                                                                            padding: '0.35rem 0.55rem',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: '800',
                                                                            cursor: 'pointer',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.25rem'
                                                                        }}
                                                                    >
                                                                        <DollarSign size={12} />
                                                                        Pay
                                                                    </button>
                                                                </>
                                                            )}

                                                            {st.totalBalanceYear === 0 && (
                                                                <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                    <ShieldCheck size={14} /> Clear
                                                                </span>
                                                            )}
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
                ) : (
                    // === CLASS ARREARS SUMMARY (Main Overview: Grid or Table) ===
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    Class-Wise Arrears Summary ({selectedMonthMeta.monthName} {selectedYear})
                                </h3>
                                <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                                    Click any class or "Open Class Ledger" to view students, itemized balances, and locked collection.
                                </p>
                            </div>

                            {/* View Switcher Toggle (Grid vs Table) */}
                            <div style={{
                                display: 'inline-flex',
                                background: '#f1f5f9',
                                padding: '3px',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                gap: '3px'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setClassViewMode('grid')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '9px',
                                        border: 'none',
                                        background: classViewMode === 'grid' ? '#4f46e5' : 'transparent',
                                        color: classViewMode === 'grid' ? '#ffffff' : '#64748b',
                                        fontWeight: '800',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: classViewMode === 'grid' ? '0 2px 6px rgba(79, 70, 229, 0.28)' : 'none'
                                    }}
                                    title="Card Grid View"
                                >
                                    <LayoutGrid size={14} />
                                    <span>Grid</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setClassViewMode('table')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '9px',
                                        border: 'none',
                                        background: classViewMode === 'table' ? '#4f46e5' : 'transparent',
                                        color: classViewMode === 'table' ? '#ffffff' : '#64748b',
                                        fontWeight: '800',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: classViewMode === 'table' ? '0 2px 6px rgba(79, 70, 229, 0.28)' : 'none'
                                    }}
                                    title="Tabular List View"
                                >
                                    <Table size={14} />
                                    <span>Table</span>
                                </button>
                            </div>
                        </div>

                        {classViewMode === 'grid' ? (
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
                        ) : (
                            /* === CLASS SUMMARY TABLE VIEW === */
                            <div style={{
                                background: 'white',
                                borderRadius: '16px',
                                border: '1px solid #e2e8f0',
                                overflow: 'hidden',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                <th style={{ padding: '0.9rem 1.1rem', fontWeight: '800' }}>Class / Section</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '800' }}>Incharge Teacher</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '800', textAlign: 'center' }}>Students</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '800' }}>Paid / Collected</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '800' }}>Defaulters / Pending</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '800' }}>Total Dues</th>
                                                <th style={{ padding: '0.9rem 1rem', fontWeight: '800', minWidth: '150px' }}>Recovery</th>
                                                <th style={{ padding: '0.9rem 1.1rem', fontWeight: '800', textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {classBreakdown.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                                                        No classes found for this session.
                                                    </td>
                                                </tr>
                                            ) : (
                                                classBreakdown.map((c, idx) => (
                                                    <tr
                                                        key={c.classId}
                                                        onClick={() => setSelectedClassId(c.classId)}
                                                        style={{
                                                            borderBottom: '1px solid #f1f5f9',
                                                            background: idx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                                                            cursor: 'pointer',
                                                            transition: 'background 0.15s ease'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fcfcfd'}
                                                    >
                                                        {/* Class Name */}
                                                        <td style={{ padding: '0.9rem 1.1rem' }}>
                                                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a' }}>
                                                                {c.className}
                                                            </div>
                                                        </td>

                                                        {/* Teacher Name */}
                                                        <td style={{ padding: '0.9rem 1rem', color: '#475569', fontWeight: '600' }}>
                                                            {c.teacherName}
                                                        </td>

                                                        {/* Total Students */}
                                                        <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                minWidth: '32px',
                                                                padding: '2px 8px',
                                                                borderRadius: '10px',
                                                                background: '#f1f5f9',
                                                                color: '#334155',
                                                                fontWeight: '800',
                                                                fontSize: '0.8rem'
                                                            }}>
                                                                {c.totalStudents}
                                                            </span>
                                                        </td>

                                                        {/* Paid Count & Amount */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            <div style={{ color: '#059669', fontWeight: '800', fontSize: '0.85rem' }}>
                                                                ✓ {c.paidCount} Paid
                                                            </div>
                                                            <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: '600' }}>
                                                                {formatPKR(c.collectedAmount)}
                                                            </div>
                                                        </td>

                                                        {/* Unpaid Count & Amount */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            <div style={{ color: '#dc2626', fontWeight: '800', fontSize: '0.85rem' }}>
                                                                ✗ {c.unpaidCount} Defaulters
                                                            </div>
                                                            <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: '700' }}>
                                                                {formatPKR(c.pendingAmount)}
                                                            </div>
                                                        </td>

                                                        {/* Total Dues */}
                                                        <td style={{ padding: '0.9rem 1rem', fontWeight: '800', color: '#0f172a' }}>
                                                            {formatPKR(c.totalAmount)}
                                                        </td>

                                                        {/* Recovery Rate Bar + Pill */}
                                                        <td style={{ padding: '0.9rem 1rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div style={{ flex: 1, background: '#e2e8f0', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                                                    <div style={{
                                                                        width: `${c.recoveryRate}%`,
                                                                        height: '100%',
                                                                        background: c.recoveryRate >= 85 ? '#10b981' : c.recoveryRate >= 50 ? '#f59e0b' : '#ef4444',
                                                                        borderRadius: '3px'
                                                                    }} />
                                                                </div>
                                                                <span style={{
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: '800',
                                                                    padding: '2px 7px',
                                                                    borderRadius: '8px',
                                                                    background: c.recoveryRate >= 85 ? '#dcfce7' : c.recoveryRate >= 50 ? '#fef3c7' : '#fee2e2',
                                                                    color: c.recoveryRate >= 85 ? '#166534' : c.recoveryRate >= 50 ? '#92400e' : '#991b1b',
                                                                    whiteSpace: 'nowrap'
                                                                }}>
                                                                    {c.recoveryRate}%
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* Actions */}
                                                        <td style={{ padding: '0.9rem 1.1rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                                                <button
                                                                    onClick={() => setSelectedClassId(c.classId)}
                                                                    style={{
                                                                        padding: '0.4rem 0.75rem',
                                                                        borderRadius: '8px',
                                                                        border: 'none',
                                                                        background: '#4f46e5',
                                                                        color: 'white',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '800',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.35rem',
                                                                        boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                                                                    }}
                                                                    title="Open Class Ledger"
                                                                >
                                                                    <Users size={12} />
                                                                    Open Ledger
                                                                </button>
                                                                <button
                                                                    onClick={() => navigate(`/collections/${c.classId}`)}
                                                                    style={{
                                                                        padding: '0.4rem 0.65rem',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #cbd5e1',
                                                                        background: 'white',
                                                                        color: '#475569',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '800',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.25rem'
                                                                    }}
                                                                    title="Open Full Class Collection Register"
                                                                >
                                                                    <ExternalLink size={12} />
                                                                    Register
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {classBreakdown.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: '800' }}>
                                                    <td style={{ padding: '0.9rem 1.1rem', color: '#0f172a' }}>
                                                        Total ({classBreakdown.length} Classes)
                                                    </td>
                                                    <td style={{ padding: '0.9rem 1rem', color: '#64748b' }}>-</td>
                                                    <td style={{ padding: '0.9rem 1rem', textAlign: 'center', color: '#0f172a' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            padding: '2px 8px',
                                                            borderRadius: '10px',
                                                            background: '#e2e8f0',
                                                            color: '#0f172a',
                                                            fontWeight: '900',
                                                            fontSize: '0.82rem'
                                                        }}>
                                                            {classTotals.totalStudents}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.9rem 1rem' }}>
                                                        <div style={{ color: '#059669' }}>✓ {classTotals.paidCount} Paid</div>
                                                        <div style={{ color: '#047857', fontSize: '0.75rem' }}>{formatPKR(classTotals.collectedAmount)}</div>
                                                    </td>
                                                    <td style={{ padding: '0.9rem 1rem' }}>
                                                        <div style={{ color: '#dc2626' }}>✗ {classTotals.unpaidCount} Defaulters</div>
                                                        <div style={{ color: '#b91c1c', fontSize: '0.75rem' }}>{formatPKR(classTotals.pendingAmount)}</div>
                                                    </td>
                                                    <td style={{ padding: '0.9rem 1rem', color: '#0f172a' }}>
                                                        {formatPKR(classTotals.totalAmount)}
                                                    </td>
                                                    <td style={{ padding: '0.9rem 1rem' }}>
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            fontWeight: '900',
                                                            padding: '3px 8px',
                                                            borderRadius: '8px',
                                                            background: classTotals.avgRecoveryRate >= 85 ? '#dcfce7' : classTotals.avgRecoveryRate >= 50 ? '#fef3c7' : '#fee2e2',
                                                            color: classTotals.avgRecoveryRate >= 85 ? '#166534' : classTotals.avgRecoveryRate >= 50 ? '#92400e' : '#991b1b'
                                                        }}>
                                                            {classTotals.avgRecoveryRate}% Avg
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.9rem 1.1rem', textAlign: 'right', color: '#64748b' }}>
                                                        —
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        )}
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
                        {cardViewTab === 'slip' ? (
                            <>
                                {/* Modal Top Header Banner for Slip */}
                                <div style={{
                                    padding: '1.25rem 1.5rem',
                                    background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                                    color: 'white',
                                    borderTopLeftRadius: '24px',
                                    borderTopRightRadius: '24px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.9, fontWeight: '700' }}>
                                            Payment Proof Slip
                                        </div>
                                        <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.15rem', fontWeight: '800' }}>
                                            {selectedFeeCardData.student.name || selectedFeeCardData.student.studentName}
                                        </h3>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '0.1rem' }}>
                                            Billing Month: <strong>{selectedFeeCardData.targetMonthName} {selectedFeeCardData.targetYear}</strong> • {selectedFeeCardData.monthFinancial?.paymentMode || 'Online'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setCardViewTab('voucher')}
                                        title="Back to Fee Card"
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

                                {/* Modal Body for Slip View */}
                                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {/* Interactive Zoom / Rotate Controls Bar */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: '#f8fafc',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0',
                                        gap: '0.5rem',
                                        flexWrap: 'wrap'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSlipZoom(z => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                                                title="Zoom Out"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#ffffff',
                                                    color: '#334155',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <ZoomOut size={16} />
                                            </button>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '800', minWidth: '46px', textAlign: 'center', color: '#0f172a' }}>
                                                {Math.round(slipZoom * 100)}%
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setSlipZoom(z => Math.min(3.5, Number((z + 0.25).toFixed(2))))}
                                                title="Zoom In"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#ffffff',
                                                    color: '#334155',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <ZoomIn size={16} />
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSlipRotation(r => (r + 90) % 360)}
                                                title="Rotate 90°"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    padding: '0.35rem 0.65rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#ffffff',
                                                    color: '#334155',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <RotateCw size={14} />
                                                <span>Rotate</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setSlipZoom(1); setSlipRotation(0); }}
                                                title="Reset View"
                                                style={{
                                                    padding: '0.35rem 0.65rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#ffffff',
                                                    color: '#64748b',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Reset
                                            </button>
                                            {selectedFeeCardData.monthFinancial?.proofUrl && (
                                                <a
                                                    href={selectedFeeCardData.monthFinancial.proofUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Open Original Image in New Tab"
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        padding: '0.35rem 0.65rem',
                                                        borderRadius: '8px',
                                                        border: '1px solid #0d9488',
                                                        background: '#f0fdfa',
                                                        color: '#0f766e',
                                                        fontSize: '0.78rem',
                                                        fontWeight: '700',
                                                        textDecoration: 'none'
                                                    }}
                                                >
                                                    <ExternalLink size={14} />
                                                    <span>Original</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Scrollable / Grabbable Image Canvas */}
                                    <div style={{
                                        position: 'relative',
                                        height: '360px',
                                        background: '#0f172a',
                                        borderRadius: '16px',
                                        overflow: 'auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '1rem',
                                        border: '1px solid #334155'
                                    }}>
                                        <div style={{
                                            transform: `rotate(${slipRotation}deg) scale(${slipZoom})`,
                                            transformOrigin: 'center center',
                                            transition: 'transform 0.15s ease-out',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            maxWidth: '100%',
                                            maxHeight: '100%'
                                        }}>
                                            <img
                                                src={selectedFeeCardData.monthFinancial?.proofUrl}
                                                alt="Payment Proof Slip"
                                                style={{
                                                    maxWidth: '100%',
                                                    maxHeight: '320px',
                                                    objectFit: 'contain',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                                    pointerEvents: 'auto',
                                                    userSelect: 'none'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Slip Audit Info Chips */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.65rem 0.85rem',
                                        background: '#ecfdf5',
                                        border: '1px solid #a7f3d0',
                                        borderRadius: '10px',
                                        fontSize: '0.76rem',
                                        color: '#065f46',
                                        flexWrap: 'wrap',
                                        gap: '0.4rem'
                                    }}>
                                        <span><strong>Slip #:</strong> {selectedFeeCardData.monthFinancial?.receiptNo || 'VERIFIED'}</span>
                                        <span><strong>Channel:</strong> {selectedFeeCardData.monthFinancial?.paymentMode || 'Cash'}</span>
                                        {selectedFeeCardData.monthFinancial?.paymentDateStr && (
                                            <span>📅 <strong>Paid Date:</strong> {selectedFeeCardData.monthFinancial.paymentDateStr}</span>
                                        )}
                                    </div>

                                    {/* Back Button */}
                                    <button
                                        type="button"
                                        onClick={() => setCardViewTab('voucher')}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '12px',
                                            border: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            color: '#334155',
                                            fontWeight: '800',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <ArrowLeft size={16} />
                                        <span>Back to Fee Card & Voucher</span>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
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

                                            {/* Other Recurring Charges (Computer, Generator, Lab, Exam, etc.) */}
                                            {Array.isArray(selectedFeeCardData.breakdown.otherRecurringFees) && selectedFeeCardData.breakdown.otherRecurringFees.length > 0 ? (
                                                selectedFeeCardData.breakdown.otherRecurringFees.map((rf, rIdx) => (
                                                    <div key={`rec_${rIdx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0891b2' }}>
                                                            <Sparkles size={15} />
                                                            <span>{rf.name || 'Additional Monthly Fee'}</span>
                                                        </div>
                                                        <strong style={{ color: '#0891b2' }}>+{formatPKR(rf.amount)}</strong>
                                                    </div>
                                                ))
                                            ) : (Array.isArray(selectedFeeCardData.breakdown.recurringItems) && selectedFeeCardData.breakdown.recurringItems.length > 0 && (
                                                selectedFeeCardData.breakdown.recurringItems.map((rf, rIdx) => (
                                                    <div key={`rec_${rIdx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0891b2' }}>
                                                            <Sparkles size={15} />
                                                            <span>{rf.name || 'Additional Monthly Fee'}</span>
                                                        </div>
                                                        <strong style={{ color: '#0891b2' }}>+{formatPKR(rf.amount)}</strong>
                                                    </div>
                                                ))
                                            ))}

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
                                            {(selectedFeeCardData.monthFinancial?.receiptNo || selectedFeeCardData.monthFinancial?.paymentDateStr) && (
                                                <div style={{
                                                    background: '#ecfdf5',
                                                    border: '1px solid #a7f3d0',
                                                    borderRadius: '8px',
                                                    padding: '0.6rem 0.75rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.4rem',
                                                    fontSize: '0.75rem',
                                                    color: '#065f46',
                                                    marginTop: '0.25rem'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                        <span><strong>Slip #:</strong> {selectedFeeCardData.monthFinancial.receiptNo || 'VERIFIED'}</span>
                                                        <span><strong>Channel:</strong> {selectedFeeCardData.monthFinancial.paymentMode || 'Cash'}</span>
                                                        {selectedFeeCardData.monthFinancial.paymentDateStr && (
                                                            <span style={{ fontWeight: '700', color: '#047857' }}>
                                                                📅 <strong>Paid Date:</strong> {selectedFeeCardData.monthFinancial.paymentDateStr}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Proof of Payment Screenshot Button (Bank, EasyPaisa, JazzCash, etc.) */}
                                                    {selectedFeeCardData.monthFinancial?.proofUrl && (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem', borderTop: '1px dashed #a7f3d0' }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setCardViewTab('slip');
                                                                    setSlipZoom(1);
                                                                    setSlipRotation(0);
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    background: '#047857',
                                                                    color: '#ffffff',
                                                                    border: 'none',
                                                                    borderRadius: '6px',
                                                                    padding: '0.3rem 0.65rem',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: '800',
                                                                    cursor: 'pointer',
                                                                    boxShadow: '0 2px 5px rgba(4, 120, 87, 0.25)',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                <Eye size={13} />
                                                                <span>View Payment Proof Slip</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Total Line & Partial Breakdown */}
                                            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem', marginTop: '0.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>Net Monthly Total</span>
                                                    <span style={{ fontSize: '1.15rem', fontWeight: '900', color: selectedFeeCardData.breakdown.is100PercentFree ? '#059669' : (selectedFeeCardData.isPaid ? '#059669' : '#dc2626') }}>
                                                        {formatPKR(selectedFeeCardData.breakdown.totalPayable)}
                                                    </span>
                                                </div>
                                                {selectedFeeCardData.monthFinancial?.paidAmount > 0 && selectedFeeCardData.monthFinancial?.remainingBalance > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>
                                                        <span style={{ color: '#059669', fontWeight: '800' }}>✓ Paid: {formatPKR(selectedFeeCardData.monthFinancial.paidAmount)}</span>
                                                        <span style={{ color: '#dc2626', fontWeight: '900' }}>⚠ Pending Due: {formatPKR(selectedFeeCardData.monthFinancial.remainingBalance)}</span>
                                                    </div>
                                                )}
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
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Payment Proof Screenshot Lightbox Modal */}
            {proofModalUrl && typeof document !== 'undefined' && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100000,
                        background: 'rgba(15, 23, 42, 0.85)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                    onClick={() => setProofModalUrl(null)}
                >
                    <div
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            maxWidth: '650px',
                            width: '100%',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Lightbox Header */}
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>
                                    📷 Payment Proof Slip / Screenshot
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                    Uploaded by parent for online / bank verification
                                </p>
                            </div>
                            <button
                                onClick={() => setProofModalUrl(null)}
                                style={{
                                    border: 'none',
                                    background: '#f1f5f9',
                                    borderRadius: '8px',
                                    padding: '0.4rem',
                                    cursor: 'pointer',
                                    color: '#64748b'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Image Body */}
                        <div style={{
                            padding: '1rem',
                            flex: 1,
                            overflowY: 'auto',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            background: '#0f172a'
                        }}>
                            <img
                                src={proofModalUrl}
                                alt="Parent Payment Proof"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '65vh',
                                    objectFit: 'contain',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
                                }}
                            />
                        </div>

                        {/* Lightbox Footer */}
                        <div style={{
                            padding: '0.85rem 1.25rem',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc'
                        }}>
                            <a
                                href={proofModalUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    color: '#0284c7',
                                    textDecoration: 'none'
                                }}
                            >
                                <ExternalLink size={14} /> Open Full Size / Download
                            </a>

                            <button
                                onClick={() => setProofModalUrl(null)}
                                style={{
                                    background: '#0f172a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '0.45rem 1rem',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default React.memo(FeeArrearsMatrix);
