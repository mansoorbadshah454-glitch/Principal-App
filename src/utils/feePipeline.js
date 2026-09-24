/**
 * feePipeline.js
 * 
 * Single Source of Truth (SSOT) Financial Evaluation & Pipeline Utility.
 * Guarantees 100% mathematical consistency across:
 * - Cashier POS Checkout Counter
 * - Daily Workflow (Right-Side 12-Month Cards)
 * - Monthly Fee Matrix (Level 1 KPI, Level 2 Class Breakdown, Level 3 Defaulters Ledger)
 * - Parent Mobile App (Flutter)
 */

export const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const formatPKR = (amt) => {
    return `₨ ${Number(amt || 0).toLocaleString('en-PK')}`;
};

/**
 * Check whether a student has 100% Free / Full Scholarship concession.
 */
export const checkIs100PercentFree = (student) => {
    if (!student) return false;
    return (
        student.isScholarship === true ||
        student.isFreeShip === true ||
        student.concessionType === 'free' ||
        Number(student.feeDiscount) === 100 ||
        (Array.isArray(student.feeStructure) && student.feeStructure.length > 0 && student.feeStructure.every(f => Number(f.amount) === 0))
    );
};

/**
 * Universal Single Source of Truth: Check if a specific month is settled/paid for a student.
 */
export const isMonthSettled = (student, monthIdx, targetYear = 2026, historyTxs = []) => {
    if (!student) return false;
    if (checkIs100PercentFree(student)) return true;

    const targetMonthKey = `${targetYear}-${String(monthIdx + 1).padStart(2, '0')}`;
    const targetMonthName = MONTH_NAMES[monthIdx] || '';
    const targetMonthShort = MONTH_SHORT[monthIdx] || '';

    // 1. Check monthlyFeeHistory
    const hist = student?.monthlyFeeHistory?.[targetMonthKey] || 
                 student?.monthlyFeeHistory?.[`${targetMonthName} ${targetYear}`] || 
                 student?.monthlyFeeHistory?.[`${targetMonthShort} ${targetYear}`];
    if (hist) {
        const st = String(hist.status || '').toLowerCase();
        if (st === 'paid' || st === 'cleared') return true;
        const paid = Number(hist.paidAmount || 0);
        const remaining = hist.remainingBalance !== undefined ? Number(hist.remainingBalance) : null;
        if (remaining !== null && remaining === 0 && paid > 0) return true;
        const expected = Number(hist.expectedAmount || hist.netPayable || hist.totalPayable || 0);
        if (paid > 0 && expected > 0 && paid >= expected) return true;
    }

    // 2. Check paidMonths list
    if (Array.isArray(student.paidMonths)) {
        const isPaidInList = student.paidMonths.some(pm => {
            if (typeof pm === 'string') {
                const s = pm.toLowerCase().trim();
                return s === targetMonthKey.toLowerCase() ||
                       s === `${targetYear}-${monthIdx + 1}` ||
                       s === `${targetYear}-${String(monthIdx + 1).padStart(2, '0')}` ||
                       s.includes(targetMonthShort.toLowerCase()) ||
                       s.includes(targetMonthName.toLowerCase());
            }
            return false;
        });
        if (isPaidInList) return true;
    }

    // 3. Check historyTxs
    if (Array.isArray(historyTxs) && historyTxs.length > 0) {
        const hasTx = historyTxs.some(tx => {
            if (!tx || (tx.studentId && tx.studentId !== student.id)) return false;
            if (tx.targetMonthKey === targetMonthKey || (tx.targetMonthIdx === monthIdx && Number(tx.targetYear || targetYear) === targetYear)) {
                return (Number(tx.totalPaid || tx.totalAmount || 0) > 0);
            }
            return false;
        });
        if (hasTx) return true;
    }

    // 4. Check monthlyFeeStatus for current month
    const today = new Date();
    if (targetYear === today.getFullYear() && monthIdx === today.getMonth() && (String(student.monthlyFeeStatus || '').toLowerCase() === 'paid' || String(student.monthlyFeeStatus || '').toLowerCase() === 'cleared')) {
        return true;
    }

    return false;
};

/**
 * Helper to check if a monthKey string (e.g. "2026-09" or "Sep 2026") is settled
 */
export const isMonthKeySettled = (student, monthKey, defaultYear = 2026, historyTxs = []) => {
    if (!monthKey) return false;
    let yr = defaultYear;
    let mIdx = new Date().getMonth();

    if (monthKey.includes('-')) {
        const parts = monthKey.split('-');
        if (parts.length >= 2) {
            yr = parseInt(parts[0], 10) || yr;
            mIdx = (parseInt(parts[1], 10) || 1) - 1;
        }
    } else {
        const lower = monthKey.toLowerCase();
        for (let i = 0; i < MONTH_NAMES.length; i++) {
            if (lower.includes(MONTH_NAMES[i].toLowerCase()) || lower.includes(MONTH_SHORT[i].toLowerCase())) {
                mIdx = i;
                break;
            }
        }
        const yearMatch = monthKey.match(/\b(20\d\d)\b/);
        if (yearMatch) {
            yr = parseInt(yearMatch[1], 10) || yr;
        }
    }
    return isMonthSettled(student, mIdx, yr, historyTxs);
};

/**
 * Calculate the earliest unpaid/active billing month index (0-11) for a student in targetYear.
 * If currentMonth is paid (or settled), it looks forward to find the next unpaid month.
 */
export const getEffectiveBillingMonthIdx = (student, targetYear = 2026, historyTxs = []) => {
    if (!student) return new Date().getMonth();
    for (let m = 0; m < 12; m++) {
        if (!isMonthSettled(student, m, targetYear, historyTxs)) {
            return m; // Earliest unpaid month index (0-11)
        }
    }
    return new Date().getMonth();
};

/**
 * Calculate the exact itemized fee breakdown for a specific target month.
 */
export const calculateItemizedFeeBreakdown = (
    student, 
    currentAction = null, 
    feeSettings = {}, 
    targetMonthIdx = 0, 
    targetYear = 2026,
    historyTxs = []
) => {
    if (!student) {
        return {
            is100PercentFree: false,
            baseTuition: 0,
            tuitionPayable: 0,
            transportFee: 0,
            storeDues: 0,
            actionFee: 0,
            actionName: '',
            customItems: [],
            penaltyFine: 0,
            totalPayable: 0,
            paidAmount: 0,
            isPaid: false
        };
    }

    const is100PercentFree = checkIs100PercentFree(student);
    const targetMonthKey = `${targetYear}-${String(targetMonthIdx + 1).padStart(2, '0')}`;
    const targetMonthName = MONTH_NAMES[targetMonthIdx] || '';
    const targetMonthShort = MONTH_SHORT[targetMonthIdx] || '';
    const feeHistoryEntry = student?.monthlyFeeHistory?.[targetMonthKey] || null;
    const isTargetMonthPaid = isMonthSettled(student, targetMonthIdx, targetYear, historyTxs);
    const effectiveBillingMonthIdx = getEffectiveBillingMonthIdx(student, targetYear, historyTxs);

    // 1. Base Tuition
    let baseTuition = Number(student.tuitionFee || student.monthlyFee || student.fee || 0);
    if (baseTuition === 0 && Array.isArray(student.feeStructure) && student.feeStructure.length > 0) {
        const tuitionItem = student.feeStructure.find(f => (f.name || '').toLowerCase().includes('tuition'));
        if (tuitionItem) baseTuition = Number(tuitionItem.amount || 0);
        else baseTuition = student.feeStructure.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    }
    if (baseTuition === 0 && !is100PercentFree) baseTuition = 2000; // Standard Default

    // Concession / Discount
    let tuitionPayable = is100PercentFree ? 0 : baseTuition;
    if (!is100PercentFree && student.feeDiscount && Number(student.feeDiscount) > 0) {
        const disc = Number(student.feeDiscount);
        if (disc <= 100) {
            tuitionPayable = Math.max(0, Math.round(baseTuition * (1 - disc / 100)));
        } else {
            tuitionPayable = Math.max(0, baseTuition - disc);
        }
    }

    // 2. Transport Fee
    let transportFee = Number(student.transportFee || student.monthlyTransportFee || 0);

    // 3. Month-Isolated Store Purchases & Unpaid Aggregation
    let storeDues = 0;
    const storeItemsList = [];

    if (isTargetMonthPaid) {
        // Locked historical paid month - preserve exactly what was paid
        if (feeHistoryEntry && Array.isArray(feeHistoryEntry.storeItems) && feeHistoryEntry.storeItems.length > 0) {
            feeHistoryEntry.storeItems.forEach(item => {
                const amt = Number(item.amount || item.price || 0);
                if (amt > 0) {
                    storeDues += amt;
                    storeItemsList.push({ ...item, status: 'paid' });
                }
            });
        } else if (Number(feeHistoryEntry?.storeDues || 0) > 0) {
            storeDues = Number(feeHistoryEntry.storeDues);
        }
    } else {
        // Target month is OPEN / UNPAID - capture assigned items and all unpaid store charges
        if (Array.isArray(student.storePurchases)) {
            student.storePurchases.forEach(item => {
                const isItemPaid = item.status === 'paid';
                if (isItemPaid) {
                    const itemKey = item.monthKey || '';
                    if (itemKey !== targetMonthKey) return;
                }

                const itemKey = item.monthKey || (item.date && item.date.length >= 7 ? item.date.slice(0, 7) : '');
                const isEligibleForUnpaidMonth = (!isItemPaid) && 
                    (!itemKey || itemKey <= targetMonthKey);

                if (isEligibleForUnpaidMonth) {
                    const amt = Number(item.amount || item.price || 0);
                    if (amt > 0) {
                        storeDues += amt;
                        storeItemsList.push({
                            name: item.name || 'Store Item',
                            amount: amt,
                            status: 'unpaid',
                            receiptNo: item.receiptNo || 'STORE-KIT'
                        });
                    }
                }
            });
        } else if (Array.isArray(student.storeCharges)) {
            student.storeCharges.forEach(item => {
                const isItemPaid = item.status === 'paid';
                if (isItemPaid) {
                    const itemKey = item.monthKey || '';
                    if (itemKey !== targetMonthKey) return;
                }

                const itemKey = item.monthKey || (item.date && item.date.length >= 7 ? item.date.slice(0, 7) : '');
                const isEligibleForUnpaidMonth = (!isItemPaid) && 
                    (!itemKey || itemKey <= targetMonthKey);

                if (isEligibleForUnpaidMonth) {
                    const amt = Number(item.amount || item.price || 0);
                    if (amt > 0) {
                        storeDues += amt;
                        storeItemsList.push({
                            name: item.name || 'Store Item',
                            amount: amt,
                            status: 'unpaid',
                            receiptNo: item.receiptNo || 'STORE-KIT'
                        });
                    }
                }
            });
        } else if (Number(student.storeDues) > 0 && targetMonthIdx === effectiveBillingMonthIdx) {
            storeDues = Number(student.storeDues);
        }
    }

    // 4. Targeted Action & Individual Custom Actions & Unpaid Aggregation
    let actionFee = 0;
    const actionNames = [];
    const customItems = [];

    // Check feeHistoryEntry custom items first (Exact settled record for paid month)
    if (isTargetMonthPaid && feeHistoryEntry && Array.isArray(feeHistoryEntry.customItems) && feeHistoryEntry.customItems.length > 0) {
        feeHistoryEntry.customItems.forEach(c => {
            const amt = Number(c.amount || 0);
            const title = c.title || c.name || 'Custom Fee';
            if (amt > 0) {
                actionFee += amt;
                if (!actionNames.includes(title)) actionNames.push(title);
                customItems.push({ title, name: title, amount: amt, status: 'paid' });
            }
        });
    } else if (!isTargetMonthPaid) {
        // From individualActions on student object
        if (Array.isArray(student.individualActions)) {
            student.individualActions.forEach(act => {
                // Skip store inventory items if already handled
                if (act.type === 'store_inventory') {
                    if (storeItemsList.some(si => (si.receiptNo && si.receiptNo === act.receiptNo) || si.name === act.name)) {
                        return;
                    }
                }

                const isActPaid = act.status === 'paid';
                if (isActPaid) {
                    const actKey = act.monthKey || '';
                    if (actKey !== targetMonthKey) return;
                }

                const actKey = act.monthKey || 
                    (act.createdAt && act.createdAt.length >= 7 ? act.createdAt.slice(0, 7) : 
                    (act.date && act.date.length >= 7 ? act.date.slice(0, 7) : ''));

                const isEligibleForUnpaidMonth = (!isActPaid) && 
                    (!actKey || actKey <= targetMonthKey);

                if (isEligibleForUnpaidMonth) {
                    const amt = Number(act.amount || 0);
                    const title = act.title || act.name || 'Custom Action';
                    if (amt > 0) {
                        if (act.type === 'store_inventory') {
                            storeDues += amt;
                            storeItemsList.push({
                                name: title,
                                amount: amt,
                                status: 'unpaid'
                            });
                        } else {
                            actionFee += amt;
                            if (!actionNames.includes(title)) actionNames.push(title);
                            customItems.push({ 
                                title, 
                                name: title, 
                                amount: amt, 
                                status: 'unpaid' 
                            });
                        }
                    }
                }
            });
        }

        // Global Campaign Action if targeted to effective open month
        if (currentAction && targetMonthIdx === effectiveBillingMonthIdx) {
            const isTargeted = currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(student.classId));
            if (isTargeted) {
                const amt = Number(currentAction.amount || 0);
                if (amt > 0 && !actionNames.includes(currentAction.name)) {
                    actionFee += amt;
                    actionNames.push(currentAction.name);
                    customItems.push({ 
                        title: currentAction.name, 
                        name: currentAction.name, 
                        amount: amt, 
                        status: student.customPayments?.[currentAction.name]?.status || 'unpaid' 
                    });
                }
            }
        }
    }

    // 5. Late Fine / Penalty
    let penaltyFine = 0;
    if (feeHistoryEntry && Number(feeHistoryEntry.fineAmount) > 0) {
        penaltyFine = Number(feeHistoryEntry.fineAmount);
    } else {
        const dueDay = parseInt(feeSettings.dueDate, 10) || 10;
        const penaltyAmt = Number(feeSettings.penaltyAmount) || 0;
        const today = new Date();
        const isCurrentTargetMonth = (targetYear === today.getFullYear() && targetMonthIdx === today.getMonth());
        if (isCurrentTargetMonth && today.getDate() > dueDay && penaltyAmt > 0 && !is100PercentFree) {
            penaltyFine = penaltyAmt;
        }
    }

    let totalPayable = tuitionPayable + transportFee + storeDues + actionFee + penaltyFine;

    // If historical payment exists, net total must match actual collected amount
    const paidAmount = feeHistoryEntry ? Number(feeHistoryEntry.paidAmount || 0) : 0;
    if (paidAmount > 0) {
        totalPayable = Math.max(totalPayable, paidAmount);
    }

    return {
        is100PercentFree,
        baseTuition,
        tuitionPayable,
        transportFee,
        storeDues,
        actionFee,
        actionName: actionNames.join(', '),
        customItems,
        penaltyFine,
        totalPayable,
        paidAmount,
        isPaid: feeHistoryEntry ? (feeHistoryEntry.status === 'paid') : false
    };
};

/**
 * Universal Single Source of Truth: Get exact financial status for a single month.
 * Handles: Full Paid, Partial Paid, Overdue, Due, Upcoming, 100% Free, Pre-Admission.
 */
export const getStudentMonthFinancialStatus = (
    student,
    monthIdx,
    targetYear = 2026,
    currentAction = null,
    feeSettings = {},
    historyTxs = []
) => {
    const today = new Date();
    const currentYearNum = today.getFullYear();
    const currentMonthIdx = today.getMonth();
    const currentDay = today.getDate();
    const dueDay = parseInt(feeSettings.dueDate, 10) || 10;

    const monthNum = monthIdx + 1;
    const targetMonthKey = `${targetYear}-${String(monthNum).padStart(2, '0')}`;
    const monthName = MONTH_SHORT[monthIdx];
    const monthFullName = MONTH_NAMES[monthIdx];

    const is100PercentFree = checkIs100PercentFree(student);
    const breakdown = calculateItemizedFeeBreakdown(student, currentAction, feeSettings, monthIdx, targetYear);
    let expectedAmount = is100PercentFree ? 0 : breakdown.totalPayable;

    // 1. Pre-Admission Filter
    let admissionMonthNum = 1;
    if (student?.admissionDate) {
        try {
            const admDate = new Date(student.admissionDate);
            if (!isNaN(admDate.getTime()) && admDate.getFullYear() === targetYear) {
                admissionMonthNum = admDate.getMonth() + 1;
            }
        } catch (_) {}
    }

    if (monthNum < admissionMonthNum && targetYear === currentYearNum) {
        return {
            monthIdx,
            monthNum,
            monthName,
            monthFullName,
            targetMonthKey,
            status: 'pre_admission',
            expectedAmount: 0,
            paidAmount: 0,
            remainingBalance: 0,
            receiptNo: null,
            paymentDate: null,
            paymentDateStr: null,
            paymentMode: null,
            is100PercentFree,
            breakdown,
            txData: null
        };
    }

    // 100% Scholarship override
    if (is100PercentFree) {
        return {
            monthIdx,
            monthNum,
            monthName,
            monthFullName,
            targetMonthKey,
            status: 'paid',
            expectedAmount: 0,
            paidAmount: 0,
            remainingBalance: 0,
            receiptNo: 'SCHOLARSHIP',
            paymentDate: new Date(targetYear, monthIdx, 1),
            paymentDateStr: `1 ${monthName} ${targetYear}`,
            paymentMode: 'Scholarship',
            is100PercentFree: true,
            breakdown,
            txData: null
        };
    }

    // 2. Check student.monthlyFeeHistory[targetMonthKey] (PRIMARY SOURCE OF TRUTH)
    const feeHistoryEntry = student?.monthlyFeeHistory?.[targetMonthKey] || null;

    // 3. Check matching transaction from historyTxs
    let matchingTx = null;
    if (Array.isArray(historyTxs) && historyTxs.length > 0) {
        matchingTx = historyTxs.find(tx => {
            if (!tx) return false;
            if (tx.studentId && tx.studentId !== student?.id) return false;
            if (tx.targetMonthKey && tx.targetMonthKey === targetMonthKey) return true;
            if (tx.targetMonthIdx !== undefined && tx.targetMonthIdx === monthIdx && (Number(tx.targetYear) === targetYear || !tx.targetYear)) return true;
            if (tx.month === targetMonthKey || tx.month === monthFullName) return true;
            return false;
        });
    }

    // 4. Check paidMonths array fallback
    const isMonthInPaidMonths = Array.isArray(student?.paidMonths) && student.paidMonths.some(pm => {
        if (typeof pm === 'string') {
            const s = pm.toLowerCase().trim();
            return (
                s === targetMonthKey.toLowerCase() ||
                s === `${targetYear}-${monthNum}` ||
                s.includes(monthName.toLowerCase()) ||
                s.includes(monthFullName.toLowerCase())
            );
        }
        return false;
    });

    let status = 'upcoming';
    let paidAmount = 0;
    let remainingBalance = expectedAmount;
    let receiptNo = null;
    let paymentDate = null;
    let paymentMode = 'Cash';

    if (feeHistoryEntry) {
        paidAmount = Number(feeHistoryEntry.paidAmount || 0);
        remainingBalance = Number(feeHistoryEntry.remainingBalance !== undefined ? feeHistoryEntry.remainingBalance : Math.max(0, expectedAmount - paidAmount));
        paymentMode = feeHistoryEntry.paymentMode || 'Cash';
        receiptNo = feeHistoryEntry.receiptNo || (matchingTx ? (matchingTx.receiptNo || matchingTx.id) : null);
        paymentDate = feeHistoryEntry.paidAt ? new Date(feeHistoryEntry.paidAt) : (matchingTx ? new Date(matchingTx.dateString || matchingTx.timestamp?.seconds * 1000) : new Date());

        if (feeHistoryEntry.status === 'paid' || remainingBalance === 0 || isMonthInPaidMonths) {
            status = 'paid';
            remainingBalance = 0;
        } else if (paidAmount > 0) {
            status = 'partial';
        } else {
            status = (targetYear < currentYearNum || (targetYear === currentYearNum && monthNum < (currentMonthIdx + 1)))
                ? 'overdue'
                : (monthNum === (currentMonthIdx + 1) ? (currentDay > dueDay ? 'overdue' : 'pending') : 'upcoming');
        }
    } else if (matchingTx) {
        paidAmount = Number(matchingTx.totalPaid || matchingTx.totalAmount || expectedAmount);
        paymentMode = matchingTx.paymentMode || 'Cash';
        receiptNo = matchingTx.receiptNo || matchingTx.id;
        paymentDate = matchingTx.timestamp?.seconds ? new Date(matchingTx.timestamp.seconds * 1000) : new Date(matchingTx.dateString || Date.now());

        if (paidAmount >= expectedAmount || isMonthInPaidMonths) {
            status = 'paid';
            remainingBalance = 0;
        } else if (paidAmount > 0) {
            status = 'partial';
            remainingBalance = Math.max(0, expectedAmount - paidAmount);
        } else {
            status = (targetYear < currentYearNum || (targetYear === currentYearNum && monthNum < (currentMonthIdx + 1)))
                ? 'overdue'
                : (monthNum === (currentMonthIdx + 1) ? (currentDay > dueDay ? 'overdue' : 'pending') : 'upcoming');
        }
    } else if (isMonthInPaidMonths) {
        status = 'paid';
        paidAmount = expectedAmount;
        remainingBalance = 0;
        receiptNo = student?.lastReceiptNo || null;
        paymentMode = student?.lastPaymentMode || 'Cash';
        paymentDate = student?.monthlyFeeDate ? new Date(student.monthlyFeeDate) : new Date(targetYear, monthIdx, 5);
    } else if (targetYear < currentYearNum || (targetYear === currentYearNum && monthNum < (currentMonthIdx + 1))) {
        status = 'no_record';
        remainingBalance = expectedAmount;
    } else if (targetYear === currentYearNum && monthNum === (currentMonthIdx + 1)) {
        status = currentDay > dueDay ? 'overdue' : 'pending';
        remainingBalance = expectedAmount;
    } else {
        status = 'upcoming';
        remainingBalance = expectedAmount;
    }

    if (status === 'paid') {
        const finalAmount = Math.max(breakdown.totalPayable, paidAmount);
        expectedAmount = finalAmount;
        paidAmount = paidAmount > 0 ? paidAmount : finalAmount;
        remainingBalance = 0;
        breakdown.totalPayable = finalAmount;
        breakdown.paidAmount = paidAmount;
        breakdown.isPaid = true;
    }

    return {
        monthIdx,
        monthNum,
        monthName,
        monthFullName,
        targetMonthKey,
        status,
        expectedAmount,
        paidAmount,
        remainingBalance,
        receiptNo,
        paymentDate: paymentDate && !isNaN(paymentDate.getTime()) ? paymentDate : null,
        paymentDateStr: paymentDate && !isNaN(paymentDate.getTime()) ? paymentDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
        paymentMode,
        is100PercentFree,
        breakdown,
        txData: matchingTx || null
    };
};

/**
 * Universal Parser: Parse all 12 months for a student into a Set of paid month indices (0-11).
 */
export const parseStudentPaidMonthsSet = (student, targetYear = 2026, historyTxs = []) => {
    const paidSet = new Set();
    const isFree = checkIs100PercentFree(student);
    if (isFree) {
        for (let m = 0; m < 12; m++) paidSet.add(m);
        return paidSet;
    }

    for (let m = 0; m < 12; m++) {
        const fin = getStudentMonthFinancialStatus(student, m, targetYear, null, {}, historyTxs);
        if (fin.status === 'paid') {
            paidSet.add(m);
        }
    }
    return paidSet;
};
