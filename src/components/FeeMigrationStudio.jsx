import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';
import { 
    Upload, FileUp, FileDown, CheckCircle, AlertCircle, Loader2, Users, 
    CheckCircle2, AlertTriangle, Sparkles, RefreshCw, Search, CheckSquare, 
    Square, DollarSign, Filter, ArrowRight, ShieldCheck, FileText, ChevronRight,
    HelpCircle, Eye, Info
} from 'lucide-react';
import { MONTH_NAMES, MONTH_SHORT, formatPKR } from '../utils/feePipeline';

// Extended header synonyms for fee records
const COLUMN_SYNONYMS = {
    admissionNo: ['admissionno', 'admission_no', 'admissionnumber', 'admission', 'regno', 'reg_no', 'registrationno', 'grno', 'gr_no', 'dakhla', 'dakhlano', 'student_id', 'id'],
    rollNo: ['rollno', 'roll_no', 'roll', 'rollnumber', 'roll_number'],
    studentName: ['fullname', 'full_name', 'studentname', 'student_name', 'name', 'childname', 'student', 'bachaname'],
    className: ['class', 'classname', 'class_name', 'grade', 'standard'],
    monthlyFee: ['monthlyfee', 'monthly_fee', 'fee', 'fees', 'tuition', 'tuitionfee', 'tuition_fee', 'mahanafee', 'basefee', 'monthlytuition'],
    arrears: ['arrears', 'arrear', 'previousarrears', 'previous_arrears', 'previousbalance', 'openingbalance', 'opening_balance', 'baqaya', 'dues', 'pendingbalance', 'balance'],
    paidUpToMonth: ['paidupto', 'paid_up_to', 'lastpaidmonth', 'paidmonths', 'paidmonth', 'paid_up_to_month', 'clearupto', 'clearedupto', 'paidthrough', 'settledupto']
};

// Robust CSV Line Parser
const parseCSVLine = (text) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuotes && text[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur.trim());
    return result;
};

const normalizeKey = (str) => {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Helper to parse any month string into an array of settled month keys (e.g. "August 2026" -> ['2026-01', ..., '2026-08'])
const parseMonthsUpTo = (val, targetYear = 2026) => {
    if (!val) return [];
    const str = String(val).trim().toLowerCase();
    
    // Check if it's already a number (1-12)
    const num = parseInt(str, 10);
    let targetMonthIdx = -1;
    let yr = targetYear;

    const yearMatch = str.match(/\b(20\d\d)\b/);
    if (yearMatch) {
        yr = parseInt(yearMatch[1], 10);
    }

    if (!isNaN(num) && num >= 1 && num <= 12 && !str.includes('-')) {
        targetMonthIdx = num - 1;
    } else {
        // Search month name
        for (let i = 0; i < MONTH_NAMES.length; i++) {
            if (str.includes(MONTH_NAMES[i].toLowerCase()) || str.includes(MONTH_SHORT[i].toLowerCase())) {
                targetMonthIdx = i;
                break;
            }
        }
        // Check YYYY-MM
        if (targetMonthIdx === -1 && str.includes('-')) {
            const parts = str.split('-');
            if (parts.length >= 2) {
                const m = parseInt(parts[1], 10);
                if (!isNaN(m) && m >= 1 && m <= 12) {
                    targetMonthIdx = m - 1;
                    yr = parseInt(parts[0], 10) || yr;
                }
            }
        }
    }

    if (targetMonthIdx === -1) return [];

    const keys = [];
    for (let i = 0; i <= targetMonthIdx; i++) {
        keys.push(`${yr}-${String(i + 1).padStart(2, '0')}`);
    }
    return keys;
};

const FeeMigrationStudio = ({ schoolId, classes = [], feeSettings = {}, onSettingsUpdated }) => {
    const [selectedClassId, setSelectedClassId] = useState('all');
    const [existingStudents, setExistingStudents] = useState([]);
    const [fetchingStudents, setFetchingStudents] = useState(false);

    // CSV & File States
    const [file, setFile] = useState(null);
    const [rawHeaders, setRawHeaders] = useState([]);
    const [headerMapping, setHeaderMapping] = useState({});
    const [previewRows, setPreviewRows] = useState([]);
    const [selectedRowIds, setSelectedRowIds] = useState(new Set());
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'matched', 'unmatched'
    const [searchQuery, setSearchQuery] = useState('');
    const [updateMode, setUpdateMode] = useState('safe'); // 'safe' (only zero/pending) | 'overwrite' (all)
    const [isApplying, setIsApplying] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [completedSummary, setCompletedSummary] = useState(null);
    const fileInputRef = useRef(null);

    // 1. Fetch Students from Firestore based on selectedClassId
    useEffect(() => {
        if (!schoolId) return;
        const loadStudents = async () => {
            setFetchingStudents(true);
            try {
                const list = [];
                const targetClasses = (selectedClassId === 'all') 
                    ? classes 
                    : classes.filter(c => c.id === selectedClassId);

                for (const cls of targetClasses) {
                    const snap = await getDocs(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
                    snap.docs.forEach(d => {
                        list.push({
                            id: d.id,
                            classId: cls.id,
                            className: cls.name || cls.className,
                            ...d.data()
                        });
                    });
                }
                setExistingStudents(list);
            } catch (err) {
                console.error("Error loading students for migration:", err);
            } finally {
                setFetchingStudents(false);
            }
        };

        loadStudents();
    }, [schoolId, selectedClassId, classes]);

    // 2. Download Pre-Filled CSV Template
    const handleDownloadTemplate = () => {
        const targetClass = classes.find(c => c.id === selectedClassId);
        const classNameStr = targetClass ? targetClass.name : 'All_Classes';
        
        let csvContent = "AdmissionNo,RollNo,StudentName,ClassName,MonthlyTuitionFee,OpeningArrears,PaidUpToMonth\n";

        if (existingStudents.length > 0) {
            existingStudents.forEach(st => {
                const adm = (st.admissionNo || st.admissionNumber || st.id || '').replace(/,/g, '');
                const roll = (st.rollNo || st.rollNumber || '').replace(/,/g, '');
                const name = (st.fullName || st.name || st.studentName || '').replace(/,/g, '');
                const cls = (st.className || classNameStr || '').replace(/,/g, '');
                const fee = st.tuitionFee || st.monthlyFee || '';
                const arr = st.previousArrears || st.arrears || '0';
                
                // Get last paid month if already set
                let lastPaid = '';
                if (Array.isArray(st.paidMonths) && st.paidMonths.length > 0) {
                    const sorted = [...st.paidMonths].sort();
                    lastPaid = sorted[sorted.length - 1];
                }

                csvContent += `"${adm}","${roll}","${name}","${cls}","${fee}","${arr}","${lastPaid || 'August 2026'}"\n`;
            });
        } else {
            // Default sample rows
            csvContent += `"ADM-101","1","Ali Khan","${classNameStr}","3000","0","August 2026"\n`;
            csvContent += `"ADM-102","2","Fatima Zahra","${classNameStr}","3500","2500","July 2026"\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Fee_Migration_Template_${classNameStr.replace(/\s+/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // 3. File Upload & Processing
    const handleFileUpload = (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;

        setErrorMsg('');
        setSuccessMsg('');
        setCompletedSummary(null);

        if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
            setErrorMsg("Please upload a valid .csv file.");
            return;
        }

        setFile(uploadedFile);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                processCSV(event.target.result);
            } catch (err) {
                console.error("CSV parse error:", err);
                setErrorMsg("Failed to parse CSV file. Ensure it is formatted correctly.");
            }
        };
        reader.readAsText(uploadedFile);
    };

    // 4. CSV Parser & Matching Engine
    const processCSV = (csvText) => {
        const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            setErrorMsg("CSV must contain a header row and at least one student data row.");
            return;
        }

        const headers = parseCSVLine(lines[0]);
        setRawHeaders(headers);

        // Auto-detect column synonyms
        const detectedMap = {};
        headers.forEach((h, colIdx) => {
            const cleanHeader = normalizeKey(h);
            for (const [fieldKey, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
                if (synonyms.some(s => cleanHeader.includes(s) || s.includes(cleanHeader))) {
                    if (detectedMap[fieldKey] === undefined) {
                        detectedMap[fieldKey] = colIdx;
                    }
                }
            }
        });
        setHeaderMapping(detectedMap);

        // Parse student rows
        const parsedList = [];
        const matchedSet = new Set();

        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row.every(cell => !cell || cell.trim() === '')) continue;

            const getValue = (key) => {
                const idx = detectedMap[key];
                return idx !== undefined ? (row[idx] || '').trim() : '';
            };

            const admissionNo = getValue('admissionNo');
            const rollNo = getValue('rollNo');
            const studentName = getValue('studentName');
            const rawClass = getValue('className');
            const monthlyFee = parseFloat(getValue('monthlyFee')) || 0;
            const arrears = parseFloat(getValue('arrears')) || 0;
            const paidUpToStr = getValue('paidUpToMonth');

            // Find matching student from existing database
            const matchedStudent = existingStudents.find(st => {
                const stAdm = normalizeKey(st.admissionNo || st.admissionNumber || st.id);
                const csvAdm = normalizeKey(admissionNo);
                if (stAdm && csvAdm && stAdm === csvAdm) return true;

                const stRoll = normalizeKey(st.rollNo || st.rollNumber);
                const csvRoll = normalizeKey(rollNo);
                if (stRoll && csvRoll && stRoll === csvRoll) {
                    if (selectedClassId !== 'all') return true;
                    // If all classes, also verify class name match
                    const stCls = normalizeKey(st.className);
                    const csvCls = normalizeKey(rawClass);
                    if (!csvCls || stCls.includes(csvCls) || csvCls.includes(stCls)) return true;
                }

                // Fallback: Name match if roll and admission are empty
                if (!csvAdm && !csvRoll && studentName) {
                    const stName = normalizeKey(st.fullName || st.name || st.studentName);
                    const csvName = normalizeKey(studentName);
                    if (stName && csvName && (stName === csvName || stName.includes(csvName))) return true;
                }

                return false;
            });

            const rowId = `row-${i}`;
            const settledMonths = parseMonthsUpTo(paidUpToStr);

            const rowObj = {
                id: rowId,
                rowNumber: i + 1,
                admissionNo: admissionNo || matchedStudent?.admissionNo || '--',
                rollNo: rollNo || matchedStudent?.rollNo || '--',
                studentName: studentName || matchedStudent?.fullName || matchedStudent?.name || 'Unknown',
                rawClass: rawClass || matchedStudent?.className || '',
                monthlyFee,
                arrears,
                paidUpToStr: paidUpToStr || 'None',
                settledMonths,
                matchedStudent: matchedStudent || null,
                isMatched: Boolean(matchedStudent)
            };

            parsedList.push(rowObj);
            if (matchedStudent) {
                matchedSet.add(rowId);
            }
        }

        setPreviewRows(parsedList);
        setSelectedRowIds(matchedSet); // Pre-select all matched rows by default

        if (parsedList.length === 0) {
            setErrorMsg("No readable records found in CSV file.");
        }
    };

    // 5. Filter & Search
    const filteredRows = useMemo(() => {
        return previewRows.filter(r => {
            if (activeFilter === 'matched' && !r.isMatched) return false;
            if (activeFilter === 'unmatched' && r.isMatched) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = r.studentName.toLowerCase().includes(q);
                const matchAdm = String(r.admissionNo).toLowerCase().includes(q);
                const matchRoll = String(r.rollNo).toLowerCase().includes(q);
                return matchName || matchAdm || matchRoll;
            }
            return true;
        });
    }, [previewRows, activeFilter, searchQuery]);

    // Summary KPIs
    const stats = useMemo(() => {
        const totalRows = previewRows.length;
        const matchedCount = previewRows.filter(r => r.isMatched).length;
        const unmatchedCount = totalRows - matchedCount;
        const selectedCount = selectedRowIds.size;

        const totalFees = previewRows
            .filter(r => selectedRowIds.has(r.id))
            .reduce((sum, r) => sum + r.monthlyFee, 0);

        const totalArrears = previewRows
            .filter(r => selectedRowIds.has(r.id))
            .reduce((sum, r) => sum + r.arrears, 0);

        return { totalRows, matchedCount, unmatchedCount, selectedCount, totalFees, totalArrears };
    }, [previewRows, selectedRowIds]);

    // Checkbox toggles
    const handleToggleAll = () => {
        if (selectedRowIds.size === filteredRows.length) {
            setSelectedRowIds(new Set());
        } else {
            const newSet = new Set(filteredRows.filter(r => r.isMatched).map(r => r.id));
            setSelectedRowIds(newSet);
        }
    };

    const handleToggleRow = (id) => {
        const next = new Set(selectedRowIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRowIds(next);
    };

    // 6. Firestore Batch Commit
    const handleApplyMigration = async () => {
        if (selectedRowIds.size === 0) {
            alert("Please select at least one student row to update.");
            return;
        }

        setIsApplying(true);
        setErrorMsg('');
        setSyncProgress(0);

        try {
            const rowsToUpdate = previewRows.filter(r => selectedRowIds.has(r.id) && r.matchedStudent);
            const total = rowsToUpdate.length;
            const batchSize = 300;
            let currentBatch = writeBatch(db);
            let opCount = 0;
            let successCount = 0;

            for (let i = 0; i < total; i++) {
                const r = rowsToUpdate[i];
                const st = r.matchedStudent;

                // Safe mode check: skip if fee already exists and safe mode is on
                if (updateMode === 'safe') {
                    const hasExistingFee = Number(st.tuitionFee || st.monthlyFee || 0) > 0;
                    const hasExistingArrears = Number(st.previousArrears || st.arrears || 0) > 0;
                    if (hasExistingFee && r.monthlyFee <= 0) {
                        // Keep existing fee
                        r.monthlyFee = Number(st.tuitionFee || st.monthlyFee);
                    }
                }

                // Merge paid months
                const priorPaid = Array.isArray(st.paidMonths) ? st.paidMonths : [];
                const mergedPaid = Array.from(new Set([...priorPaid, ...r.settledMonths]));

                // Prepare monthlyFeeHistory entries
                const updatedFeeHistory = { ...(st.monthlyFeeHistory || {}) };
                r.settledMonths.forEach(mKey => {
                    if (!updatedFeeHistory[mKey] || updatedFeeHistory[mKey].status !== 'paid') {
                        updatedFeeHistory[mKey] = {
                            status: 'paid',
                            paidAmount: r.monthlyFee,
                            remainingBalance: 0,
                            paidAt: new Date().toISOString(),
                            paymentMode: 'Legacy Migration',
                            receiptNo: 'HISTORICAL-BASELINE'
                        };
                    }
                });

                const payload = {
                    tuitionFee: r.monthlyFee,
                    monthlyFee: r.monthlyFee,
                    previousArrears: r.arrears,
                    arrears: r.arrears,
                    paidMonths: mergedPaid,
                    monthlyFeeHistory: updatedFeeHistory,
                    lastFeeMigrationDate: new Date().toISOString()
                };

                // 1. Update Class Subcollection Student Doc
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${st.classId}/students`, st.id);
                currentBatch.set(classStudentRef, payload, { merge: true });
                opCount++;

                // 2. Update Master Student Doc
                const masterStudentRef = doc(db, `schools/${schoolId}/students`, st.id);
                currentBatch.set(masterStudentRef, payload, { merge: true });
                opCount++;

                successCount++;

                if (opCount >= batchSize) {
                    await currentBatch.commit();
                    currentBatch = writeBatch(db);
                    opCount = 0;
                }

                setSyncProgress(Math.round(((i + 1) / total) * 100));
            }

            if (opCount > 0) {
                await currentBatch.commit();
            }

            // Update Fee Settings to record migration history
            const feeSettingsRef = doc(db, `schools/${schoolId}/settings/feeSettings`);
            await setDoc(feeSettingsRef, {
                historicalBaselineCompleted: true,
                lastMigrationDate: new Date().toISOString(),
                lastMigratedCount: successCount
            }, { merge: true });

            if (onSettingsUpdated) {
                onSettingsUpdated();
            }

            setCompletedSummary({
                count: successCount,
                totalFees: stats.totalFees,
                totalArrears: stats.totalArrears,
                date: new Date().toLocaleString()
            });

            setSuccessMsg(`Successfully migrated & synchronized fee records for ${successCount} students!`);
            // Clear preview
            setPreviewRows([]);
            setFile(null);
        } catch (err) {
            console.error("Migration batch write error:", err);
            setErrorMsg("Failed to apply migration to Firestore: " + err.message);
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div style={{ animation: 'fadeIn 0.25s ease-out' }}>
            {/* Header Title & Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                color: 'white',
                padding: '1.5rem',
                borderRadius: '16px',
                marginBottom: '1.5rem',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.45rem', borderRadius: '10px' }}>
                            <DollarSign size={24} color="#ffffff" />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
                            Fee Migration & Backlog Studio
                        </h2>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#e0e7ff', maxWidth: '650px', lineHeight: 1.4 }}>
                        Upload your previous school fee records or Excel ledger. Automatically match students, assign monthly tuition, set opening backlog arrears, and settle past months directly into the Fee Matrix.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        style={{
                            padding: '0.65rem 1.15rem',
                            background: 'rgba(255, 255, 255, 0.15)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '10px',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            backdropFilter: 'blur(4px)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <FileDown size={16} />
                        Download Template ({selectedClassId === 'all' ? 'All Classes' : classes.find(c => c.id === selectedClassId)?.name || 'Class'})
                    </button>
                </div>
            </div>

            {/* Completed Success Summary Banner */}
            {completedSummary && (
                <div style={{
                    marginBottom: '1.5rem',
                    padding: '1.25rem 1.5rem',
                    background: '#ecfdf5',
                    border: '1.5px solid #a7f3d0',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{ background: '#10b981', color: 'white', padding: '0.6rem', borderRadius: '12px' }}>
                            <CheckCircle2 size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#065f46' }}>
                                Fee Migration Successfully Applied!
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#047857', marginTop: '2px' }}>
                                Updated <strong>{completedSummary.count}</strong> students across classes. Monthly dues and arrears are active in the Fee Matrix.
                            </div>
                        </div>
                    </div>
                    <a
                        href="/collections?tab=monthlyMatrix"
                        style={{
                            padding: '0.6rem 1.25rem',
                            background: '#065f46',
                            color: 'white',
                            borderRadius: '10px',
                            textDecoration: 'none',
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}
                    >
                        View in Fee Matrix <ArrowRight size={15} />
                    </a>
                </div>
            )}

            {/* Step 1: Controls & Class Selector */}
            <div style={{
                background: 'white',
                padding: '1.25rem 1.5rem',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                marginBottom: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', alignItems: 'end' }}>
                    {/* Class Selector Dropdown */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '0.4rem' }}>
                            Target Scope / Class:
                        </label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => {
                                setSelectedClassId(e.target.value);
                                setPreviewRows([]);
                                setFile(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                background: '#f8fafc',
                                fontWeight: '700',
                                color: '#1e293b',
                                fontSize: '0.88rem'
                            }}
                        >
                            <option value="all">Whole School (All Classes Combined)</option>
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name || c.className}</option>
                            ))}
                        </select>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                            {fetchingStudents ? 'Loading students...' : `${existingStudents.length} students found in this scope`}
                        </span>
                    </div>

                    {/* File Upload Zone */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '0.4rem' }}>
                            Upload School Fee CSV File:
                        </label>
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                width: '100%',
                                padding: '0.62rem 1rem',
                                borderRadius: '10px',
                                border: '1.5px dashed #4f46e5',
                                background: '#eef2ff',
                                color: '#4f46e5',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s'
                            }}
                        >
                            <Upload size={16} />
                            {file ? file.name : "Select .CSV File from Computer"}
                        </button>
                    </div>

                    {/* Update Mode Selector */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '0.4rem' }}>
                            Conflict / Safe Mode:
                        </label>
                        <select
                            value={updateMode}
                            onChange={(e) => setUpdateMode(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                background: '#f8fafc',
                                fontWeight: '700',
                                color: '#1e293b',
                                fontSize: '0.85rem'
                            }}
                        >
                            <option value="safe">🟢 Safe Mode: Only Update Pending / Zero Fee Records</option>
                            <option value="overwrite">🔵 Full Sync: Overwrite with File Values</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
                <div style={{
                    padding: '0.85rem 1.25rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '12px',
                    color: '#b91c1c',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.25rem'
                }}>
                    <AlertTriangle size={18} />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Step 2: Live Verification / Preview Matrix */}
            {previewRows.length > 0 && (
                <div style={{
                    background: 'white',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    overflow: 'hidden',
                    marginBottom: '2rem'
                }}>
                    {/* KPI Stats Header Bar */}
                    <div style={{
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid #f1f5f9',
                        background: '#fafafa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '1rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Total In File</span>
                                <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>{stats.totalRows}</div>
                            </div>
                            <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase' }}>Matched with DB</span>
                                <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#059669' }}>{stats.matchedCount}</div>
                            </div>
                            <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#d97706', textTransform: 'uppercase' }}>Not Found / Skipped</span>
                                <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#d97706' }}>{stats.unmatchedCount}</div>
                            </div>
                            <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase' }}>Selected for Sync</span>
                                <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#4f46e5' }}>{stats.selectedCount}</div>
                            </div>
                        </div>

                        {/* Apply Commit Button */}
                        <button
                            type="button"
                            disabled={isApplying || stats.selectedCount === 0}
                            onClick={handleApplyMigration}
                            style={{
                                padding: '0.75rem 1.75rem',
                                background: isApplying ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: '800',
                                fontSize: '0.9rem',
                                cursor: isApplying ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            {isApplying ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    <span>Applying ({syncProgress}%)...</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={18} />
                                    <span>Confirm & Apply to ({stats.selectedCount}) Students</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Filter & Search Bar */}
                    <div style={{
                        padding: '0.85rem 1.5rem',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {[
                                { id: 'all', label: `All Rows (${previewRows.length})` },
                                { id: 'matched', label: `Matched (${stats.matchedCount})` },
                                { id: 'unmatched', label: `Not Found (${stats.unmatchedCount})` }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveFilter(tab.id)}
                                    style={{
                                        padding: '0.4rem 0.85rem',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        border: activeFilter === tab.id ? '1px solid #4f46e5' : '1px solid #e2e8f0',
                                        background: activeFilter === tab.id ? '#eef2ff' : 'white',
                                        color: activeFilter === tab.id ? '#4f46e5' : '#64748b',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ position: 'relative', width: '240px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="text"
                                placeholder="Search by name, roll..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.4rem 0.75rem 0.4rem 2rem',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto', maxHeight: '480px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 2, borderBottom: '1px solid #e2e8f0' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem 1rem', width: '40px' }}>
                                        <button
                                            type="button"
                                            onClick={handleToggleAll}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                        >
                                            {selectedRowIds.size === filteredRows.length && filteredRows.length > 0 ? (
                                                <CheckSquare size={16} color="#4f46e5" />
                                            ) : (
                                                <Square size={16} color="#94a3b8" />
                                            )}
                                        </button>
                                    </th>
                                    <th style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#475569' }}>Roll / Adm #</th>
                                    <th style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#475569' }}>Student Name</th>
                                    <th style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#475569' }}>Target Class</th>
                                    <th style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#475569' }}>Monthly Fee (PKR)</th>
                                    <th style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#475569' }}>Opening Arrears</th>
                                    <th style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#475569' }}>Settled Months</th>
                                    <th style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#475569' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((r, idx) => {
                                    const isSelected = selectedRowIds.has(r.id);
                                    return (
                                        <tr
                                            key={r.id}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                background: isSelected ? '#f8faff' : (idx % 2 === 0 ? 'white' : '#fafafa')
                                            }}
                                        >
                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                {r.isMatched ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleRow(r.id)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                    >
                                                        {isSelected ? (
                                                            <CheckSquare size={16} color="#4f46e5" />
                                                        ) : (
                                                            <Square size={16} color="#cbd5e1" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span style={{ color: '#cbd5e1' }}>--</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', fontWeight: '700', color: '#1e293b' }}>
                                                {r.rollNo !== '--' ? `Roll #${r.rollNo}` : r.admissionNo}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', fontWeight: '800', color: '#0f172a' }}>
                                                {r.studentName}
                                                {r.matchedStudent && (
                                                    <span style={{ fontSize: '0.7rem', color: '#059669', display: 'block', fontWeight: '600' }}>
                                                        Linked to: {r.matchedStudent.fullName || r.matchedStudent.name}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', color: '#475569' }}>
                                                {r.rawClass || r.matchedStudent?.className || '--'}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', fontWeight: '800', color: '#4f46e5' }}>
                                                {formatPKR(r.monthlyFee)}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', fontWeight: '700', color: r.arrears > 0 ? '#b91c1c' : '#64748b' }}>
                                                {r.arrears > 0 ? formatPKR(r.arrears) : '0'}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                {r.settledMonths.length > 0 ? (
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        background: '#ecfdf5',
                                                        color: '#065f46',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '700'
                                                    }}>
                                                        Paid up to {r.paidUpToStr} ({r.settledMonths.length} mos)
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>None</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                {r.isMatched ? (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '3px 8px',
                                                        background: '#ecfdf5',
                                                        color: '#047857',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '800'
                                                    }}>
                                                        <CheckCircle2 size={12} /> Matched
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '3px 8px',
                                                        background: '#fffbeb',
                                                        color: '#b45309',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '700'
                                                    }}>
                                                        <AlertTriangle size={12} /> Not in DB
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FeeMigrationStudio;
