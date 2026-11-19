import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, doc, getDoc, query } from 'firebase/firestore';
import { 
    Download, Database, FileSpreadsheet, Archive, CheckCircle2, 
    AlertCircle, Loader2, Users, GraduationCap, DollarSign, 
    Layers, ShieldCheck, FileText, Package, RefreshCw, 
    ArrowDownToLine, Sparkles, AlertTriangle, Lock, Eye, EyeOff
} from 'lucide-react';
import { 
    formatSafeDate, 
    downloadSingleCSV, 
    exportMultiSheetExcel, 
    exportZipArchive, 
    downloadJSON, 
    arrayToCSV 
} from '../../utils/exportHelpers';

export default function DataExportStudio({ schoolId }) {
    // Loading & Progress States
    const [statsLoading, setStatsLoading] = useState(true);
    const [exportingCategory, setExportingCategory] = useState(null); // 'all_excel' | 'all_zip' | 'students' | etc.
    const [progressStatus, setProgressStatus] = useState('');
    const [progressPercent, setProgressPercent] = useState(0);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    // Pre-fetched counts
    const [counts, setCounts] = useState({
        students: 0,
        teachers: 0,
        classes: 0,
        feeTransactions: 0,
        parents: 0,
        storeItems: 0
    });

    // School Profile Metadata
    const [schoolProfile, setSchoolProfile] = useState(null);

    // Security Gate Modal
    const [confirmModal, setConfirmModal] = useState({
        open: false,
        actionType: null, // 'all_excel' | 'all_zip' | 'category'
        categoryName: null
    });

    // 1. Initial Quick Stats Scan
    const fetchQuickStats = useCallback(async () => {
        if (!schoolId) return;
        setStatsLoading(true);
        setErrorMessage('');
        try {
            // Profile
            const profSnap = await getDoc(doc(db, 'schools', schoolId, 'settings', 'profile')).catch(() => null);
            if (profSnap && profSnap.exists()) {
                setSchoolProfile(profSnap.data());
            }

            // Classes & Students
            const classesSnap = await getDocs(query(collection(db, `schools/${schoolId}/classes`))).catch(() => ({ docs: [] }));
            const classDocs = classesSnap.docs.filter(d => d.id !== 'action_metadata');
            
            let studentCount = 0;
            // Check classes for students
            for (const cDoc of classDocs) {
                const stdsSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`)).catch(() => ({ docs: [] }));
                studentCount += stdsSnap.docs.length;
            }

            // Teachers
            const teachersSnap = await getDocs(query(collection(db, `schools/${schoolId}/teachers`))).catch(() => ({ docs: [] }));
            
            // Parents
            const parentsSnap = await getDocs(query(collection(db, `schools/${schoolId}/parents`))).catch(() => ({ docs: [] }));
            
            // Fee Transactions (Sample count)
            const feeSnap = await getDocs(query(collection(db, `schools/${schoolId}/feeTransactions`))).catch(() => ({ docs: [] }));

            // Store Items
            const storeSnap = await getDocs(query(collection(db, `schools/${schoolId}/store_items`))).catch(() => ({ docs: [] }));

            setCounts({
                students: studentCount,
                teachers: teachersSnap.docs.length,
                classes: classDocs.length,
                feeTransactions: feeSnap.docs.length,
                parents: parentsSnap.docs.length,
                storeItems: storeSnap.docs.length
            });
        } catch (err) {
            console.warn('[DataExportStudio] Quick stats scan notice:', err);
        } finally {
            setStatsLoading(false);
        }
    }, [schoolId]);

    useEffect(() => {
        fetchQuickStats();
    }, [fetchQuickStats]);

    // 2. Comprehensive Data Fetcher (Handles Classes, Students, Teachers, Fees, Parents, Store)
    const fetchAllSchoolData = async (onProgress = () => {}) => {
        onProgress(10, 'Scanning classes & school structure...');
        
        // 1. Fetch Classes
        const classesSnap = await getDocs(query(collection(db, `schools/${schoolId}/classes`)));
        const classDocs = classesSnap.docs.filter(d => d.id !== 'action_metadata');
        const classMap = {};
        const classesList = classDocs.map(d => {
            const data = d.data();
            const cObj = {
                id: d.id,
                className: data.name || data.className || d.id,
                section: data.section || '',
                tuitionFee: data.monthlyFee || data.tuitionFee || 0,
                incharge: data.incharge || data.teacherName || '',
                room: data.roomNumber || data.room || ''
            };
            classMap[d.id] = cObj;
            return cObj;
        });

        // 2. Fetch Students from all classes + root collection (de-duplicated)
        onProgress(30, 'Retrieving all student records...');
        const studentMap = new Map();

        // 2a. Per-class students
        for (const cDoc of classDocs) {
            try {
                const sSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`));
                sSnap.docs.forEach(docSnap => {
                    const sData = docSnap.data();
                    const sId = docSnap.id;
                    const cInfo = classMap[cDoc.id] || {};
                    studentMap.set(sId, {
                        admissionNo: sData.admissionNo || sData.regNo || sData.grNo || sId,
                        rollNo: sData.rollNo || '',
                        fullName: sData.name || sData.fullName || sData.studentName || 'Student',
                        className: sData.className || cInfo.className || '',
                        section: sData.section || cInfo.section || '',
                        fatherName: sData.fatherName || sData.parentDetails?.fatherName || sData.parentName || '',
                        fatherPhone: sData.fatherPhone || sData.phone || sData.parentDetails?.phone || sData.whatsapp || '',
                        fatherCnic: sData.fatherCnic || sData.cnic || sData.parentDetails?.cnic || '',
                        gender: sData.gender || '',
                        dob: formatSafeDate(sData.dob || sData.dateOfBirth),
                        admissionDate: formatSafeDate(sData.admissionDate || sData.joiningDate || sData.createdAt),
                        monthlyFee: sData.monthlyFee || sData.tuitionFee || cInfo.tuitionFee || 0,
                        discount: sData.discount || sData.concession || 0,
                        currentBalance: sData.dues || sData.balance || sData.currentBalance || 0,
                        status: sData.status || (sData.isLeft ? 'Left' : 'Active'),
                        address: sData.address || sData.homeAddress || '',
                        religion: sData.religion || 'Islam'
                    });
                });
            } catch (err) {
                console.warn(`Could not read students from class ${cDoc.id}:`, err);
            }
        }

        // 2b. Root students collection fallback
        try {
            const rootStudentsSnap = await getDocs(query(collection(db, `schools/${schoolId}/students`)));
            rootStudentsSnap.docs.forEach(docSnap => {
                const sData = docSnap.data();
                const sId = docSnap.id;
                if (!studentMap.has(sId)) {
                    const cInfo = classMap[sData.classId] || {};
                    studentMap.set(sId, {
                        admissionNo: sData.admissionNo || sData.regNo || sData.grNo || sId,
                        rollNo: sData.rollNo || '',
                        fullName: sData.name || sData.fullName || sData.studentName || 'Student',
                        className: sData.className || cInfo.className || '',
                        section: sData.section || cInfo.section || '',
                        fatherName: sData.fatherName || sData.parentDetails?.fatherName || sData.parentName || '',
                        fatherPhone: sData.fatherPhone || sData.phone || sData.parentDetails?.phone || sData.whatsapp || '',
                        fatherCnic: sData.fatherCnic || sData.cnic || sData.parentDetails?.cnic || '',
                        gender: sData.gender || '',
                        dob: formatSafeDate(sData.dob || sData.dateOfBirth),
                        admissionDate: formatSafeDate(sData.admissionDate || sData.joiningDate || sData.createdAt),
                        monthlyFee: sData.monthlyFee || sData.tuitionFee || cInfo.tuitionFee || 0,
                        discount: sData.discount || sData.concession || 0,
                        currentBalance: sData.dues || sData.balance || sData.currentBalance || 0,
                        status: sData.status || (sData.isLeft ? 'Left' : 'Active'),
                        address: sData.address || sData.homeAddress || '',
                        religion: sData.religion || 'Islam'
                    });
                }
            });
        } catch {
            // root fallback silent
        }

        const studentsList = Array.from(studentMap.values());

        // Update student count in classes list
        const classCountMap = {};
        studentsList.forEach(s => {
            const key = s.className;
            classCountMap[key] = (classCountMap[key] || 0) + 1;
        });
        const formattedClasses = classesList.map(c => ({
            ...c,
            enrolledStudents: classCountMap[c.className] || 0
        }));

        // 3. Fetch Teachers
        onProgress(55, 'Gathering teachers & faculty details...');
        const teachersSnap = await getDocs(query(collection(db, `schools/${schoolId}/teachers`))).catch(() => ({ docs: [] }));
        const teachersList = teachersSnap.docs.map(d => {
            const t = d.data();
            return {
                teacherId: d.id,
                fullName: t.name || t.fullName || 'Teacher',
                designation: t.designation || t.role || 'Teacher',
                phone: t.phone || t.contactNo || t.mobile || '',
                cnic: t.cnic || '',
                monthlySalary: t.salary || t.monthlySalary || 0,
                qualification: t.qualification || t.education || '',
                joiningDate: formatSafeDate(t.joiningDate || t.dateOfJoining || t.createdAt),
                assignedClasses: Array.isArray(t.assignedClasses) ? t.assignedClasses.join(', ') : (t.assignedClasses || ''),
                status: t.status || 'Active',
                address: t.address || ''
            };
        });

        // 4. Fetch Fee Transactions
        onProgress(70, 'Compiling fee receipts & transaction history...');
        const feeSnap = await getDocs(query(collection(db, `schools/${schoolId}/feeTransactions`))).catch(() => ({ docs: [] }));
        const feeList = feeSnap.docs.map(d => {
            const f = d.data();
            return {
                receiptNo: f.receiptNo || d.id,
                studentName: f.studentName || f.student?.name || '',
                className: f.className || f.student?.className || '',
                rollNo: f.rollNo || f.student?.rollNo || '',
                paidAmount: f.amount || f.paidAmount || 0,
                paymentDate: formatSafeDate(f.date || f.paymentDate || f.timestamp || f.createdAt),
                paymentMethod: f.method || f.paymentMethod || 'Cash',
                monthsCovered: f.monthsCovered || f.month || '',
                duesRemaining: f.balanceRemaining !== undefined ? f.balanceRemaining : (f.newBalance || 0),
                collectedBy: f.collectedBy || f.cashier || f.receivedBy || 'Admin'
            };
        });

        // 5. Fetch Parents
        onProgress(85, 'Fetching parent contacts & linked students...');
        const parentsSnap = await getDocs(query(collection(db, `schools/${schoolId}/parents`))).catch(() => ({ docs: [] }));
        const parentsList = parentsSnap.docs.map(d => {
            const p = d.data();
            const linked = Array.isArray(p.linkedStudents) 
                ? p.linkedStudents.map(s => typeof s === 'object' ? (s.name || s.studentId) : s).join('; ')
                : (p.linkedStudents || '');
            return {
                parentId: d.id,
                fatherName: p.name || p.fatherName || '',
                phone: p.phone || p.mobile || p.contact || '',
                cnic: p.cnic || '',
                occupation: p.occupation || '',
                address: p.address || '',
                linkedStudents: linked
            };
        });

        // 6. Fetch Store Items
        onProgress(92, 'Checking inventory & store records...');
        const storeSnap = await getDocs(query(collection(db, `schools/${schoolId}/store_items`))).catch(() => ({ docs: [] }));
        const storeList = storeSnap.docs.map(d => {
            const item = d.data();
            return {
                itemId: d.id,
                itemName: item.name || item.itemName || '',
                category: item.category || 'General',
                salePrice: item.salePrice || item.price || 0,
                costPrice: item.costPrice || 0,
                inStock: item.stock || item.quantity || 0
            };
        });

        onProgress(98, 'Formatting datasets for export...');
        return {
            classes: formattedClasses,
            students: studentsList,
            teachers: teachersList,
            feeTransactions: feeList,
            parents: parentsList,
            storeItems: storeList,
            schoolProfile: schoolProfile || {}
        };
    };

    // Helper: Safe School Name for File Names
    const getSafeSchoolPrefix = () => {
        const name = schoolProfile?.name || 'School';
        return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
    };

    // 3. Handler: One-Click Master Excel Export
    const handleExportMasterExcel = async () => {
        setExportingCategory('all_excel');
        setProgressPercent(5);
        setProgressStatus('Initializing complete school backup...');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const data = await fetchAllSchoolData((pct, msg) => {
                setProgressPercent(pct);
                setProgressStatus(msg);
            });

            setProgressStatus('Generating Multi-Sheet Excel Workbook...');
            setProgressPercent(99);

            const schoolName = getSafeSchoolPrefix();
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `${schoolName}_Master_Export_${dateStr}.xlsx`;

            const sheets = {
                'Students Master': data.students,
                'Teachers & Staff': data.teachers,
                'Classes & Structure': data.classes,
                'Fee History': data.feeTransactions,
                'Parents Directory': data.parents
            };

            if (data.storeItems.length > 0) {
                sheets['Store Inventory'] = data.storeItems;
            }

            exportMultiSheetExcel(fileName, sheets);

            setProgressPercent(100);
            setSuccessMessage(`Success! Multi-Sheet Excel file "${fileName}" downloaded successfully.`);
        } catch (err) {
            console.error('[DataExportStudio] Export Excel failed:', err);
            setErrorMessage('Export failed: ' + (err.message || 'Unknown network error'));
        } finally {
            setExportingCategory(null);
            setProgressStatus('');
        }
    };

    // 4. Handler: One-Click Complete ZIP Archive Export (Excel + CSVs + JSON)
    const handleExportZipArchive = async () => {
        setExportingCategory('all_zip');
        setProgressPercent(5);
        setProgressStatus('Initiating full archive package...');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const data = await fetchAllSchoolData((pct, msg) => {
                setProgressPercent(pct);
                setProgressStatus(msg);
            });

            setProgressStatus('Compressing all CSV tables and JSON into .ZIP archive...');
            setProgressPercent(95);

            const schoolName = getSafeSchoolPrefix();
            const dateStr = new Date().toISOString().split('T')[0];
            const zipName = `${schoolName}_Full_System_Backup_${dateStr}.zip`;

            // Readme Documentation text for external vendor or future systems
            const readmeText = `===========================================================
SCHOOL DATA SOVEREIGNTY BACKUP ARCHIVE
School: ${schoolProfile?.name || 'School Management System'}
School ID: ${schoolId}
Export Date: ${new Date().toLocaleString()}
Generated by: MAI School Management System
===========================================================

This archive contains 100% of your school's data in universal standard formats:

1. Students.csv           - Master Student Roster (Roll No, Parents, Fees, Contacts)
2. Teachers.csv           - Faculty & Staff Directory (Designations, Salaries, Phone)
3. Classes.csv            - Class Structure, Sections, Monthly Fees
4. Fee_Transactions.csv   - Complete Receipt Logs & Collection History
5. Parents.csv            - Parent Directory & Linked Students
6. Store_Inventory.csv    - School Bookstore & Uniform Stock
7. Complete_Database.json - Raw JSON data structure for direct software migration

All CSV files are encoded in UTF-8 with BOM for 100% compatibility with
Microsoft Excel, Google Sheets, LibreOffice, and any modern database.
===========================================================`;

            const filesMap = {
                'README_INSTRUCTIONS.txt': readmeText,
                'Students.csv': arrayToCSV(data.students),
                'Teachers.csv': arrayToCSV(data.teachers),
                'Classes.csv': arrayToCSV(data.classes),
                'Fee_Transactions.csv': arrayToCSV(data.feeTransactions),
                'Parents.csv': arrayToCSV(data.parents),
                'Complete_Database.json': JSON.stringify(data, null, 2)
            };

            if (data.storeItems.length > 0) {
                filesMap['Store_Inventory.csv'] = arrayToCSV(data.storeItems);
            }

            exportZipArchive(zipName, filesMap);

            setProgressPercent(100);
            setSuccessMessage(`Success! Complete archive "${zipName}" downloaded successfully.`);
        } catch (err) {
            console.error('[DataExportStudio] Export ZIP failed:', err);
            setErrorMessage('Archive export failed: ' + (err.message || 'Unknown network error'));
        } finally {
            setExportingCategory(null);
            setProgressStatus('');
        }
    };

    // 5. Handler: Single Category Export (Excel or CSV)
    const handleCategoryExport = async (categoryKey, format) => {
        setExportingCategory(`${categoryKey}_${format}`);
        setErrorMessage('');
        setSuccessMessage('');
        setProgressStatus(`Exporting ${categoryKey}...`);

        try {
            const schoolName = getSafeSchoolPrefix();
            const dateStr = new Date().toISOString().split('T')[0];

            let rows = [];
            let sheetName = 'Export';
            let fileName = `${schoolName}_${categoryKey}_${dateStr}`;

            if (categoryKey === 'students') {
                sheetName = 'Students';
                fileName = `${schoolName}_Students_${dateStr}`;
                // Fetch classes & students
                const classesSnap = await getDocs(query(collection(db, `schools/${schoolId}/classes`)));
                const cDocs = classesSnap.docs.filter(d => d.id !== 'action_metadata');
                const studentMap = new Map();

                for (const cDoc of cDocs) {
                    const cData = cDoc.data();
                    const sSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`));
                    sSnap.docs.forEach(docSnap => {
                        const sData = docSnap.data();
                        studentMap.set(docSnap.id, {
                            admissionNo: sData.admissionNo || sData.regNo || docSnap.id,
                            rollNo: sData.rollNo || '',
                            fullName: sData.name || sData.fullName || 'Student',
                            className: sData.className || cData.name || '',
                            section: sData.section || cData.section || '',
                            fatherName: sData.fatherName || sData.parentDetails?.fatherName || '',
                            fatherPhone: sData.fatherPhone || sData.phone || sData.parentDetails?.phone || '',
                            fatherCnic: sData.fatherCnic || sData.cnic || '',
                            gender: sData.gender || '',
                            dob: formatSafeDate(sData.dob || sData.dateOfBirth),
                            admissionDate: formatSafeDate(sData.admissionDate || sData.joiningDate),
                            monthlyFee: sData.monthlyFee || sData.tuitionFee || cData.monthlyFee || 0,
                            discount: sData.discount || sData.concession || 0,
                            balanceDues: sData.dues || sData.balance || 0,
                            status: sData.status || (sData.isLeft ? 'Left' : 'Active'),
                            address: sData.address || ''
                        });
                    });
                }
                rows = Array.from(studentMap.values());
            } else if (categoryKey === 'teachers') {
                sheetName = 'Teachers';
                fileName = `${schoolName}_Teachers_${dateStr}`;
                const tSnap = await getDocs(query(collection(db, `schools/${schoolId}/teachers`)));
                rows = tSnap.docs.map(d => {
                    const t = d.data();
                    return {
                        fullName: t.name || t.fullName || 'Teacher',
                        designation: t.designation || t.role || 'Teacher',
                        phone: t.phone || t.contactNo || '',
                        cnic: t.cnic || '',
                        monthlySalary: t.salary || t.monthlySalary || 0,
                        qualification: t.qualification || '',
                        joiningDate: formatSafeDate(t.joiningDate || t.createdAt),
                        assignedClasses: Array.isArray(t.assignedClasses) ? t.assignedClasses.join(', ') : (t.assignedClasses || ''),
                        status: t.status || 'Active'
                    };
                });
            } else if (categoryKey === 'fees') {
                sheetName = 'Fee Transactions';
                fileName = `${schoolName}_Fee_Transactions_${dateStr}`;
                const fSnap = await getDocs(query(collection(db, `schools/${schoolId}/feeTransactions`)));
                rows = fSnap.docs.map(d => {
                    const f = d.data();
                    return {
                        receiptNo: f.receiptNo || d.id,
                        studentName: f.studentName || '',
                        className: f.className || '',
                        rollNo: f.rollNo || '',
                        paidAmount: f.amount || f.paidAmount || 0,
                        paymentDate: formatSafeDate(f.date || f.paymentDate || f.timestamp),
                        paymentMethod: f.method || f.paymentMethod || 'Cash',
                        monthCovered: f.monthsCovered || f.month || '',
                        remainingBalance: f.balanceRemaining || f.newBalance || 0,
                        collectedBy: f.collectedBy || f.cashier || 'Admin'
                    };
                });
            } else if (categoryKey === 'classes') {
                sheetName = 'Classes';
                fileName = `${schoolName}_Classes_${dateStr}`;
                const cSnap = await getDocs(query(collection(db, `schools/${schoolId}/classes`)));
                rows = cSnap.docs.filter(d => d.id !== 'action_metadata').map(d => {
                    const c = d.data();
                    return {
                        className: c.name || c.className || '',
                        section: c.section || '',
                        monthlyTuitionFee: c.monthlyFee || c.tuitionFee || 0,
                        classTeacher: c.incharge || c.teacherName || '',
                        roomNumber: c.roomNumber || ''
                    };
                });
            } else if (categoryKey === 'parents') {
                sheetName = 'Parents';
                fileName = `${schoolName}_Parents_${dateStr}`;
                const pSnap = await getDocs(query(collection(db, `schools/${schoolId}/parents`)));
                rows = pSnap.docs.map(d => {
                    const p = d.data();
                    return {
                        fatherName: p.name || p.fatherName || '',
                        phone: p.phone || p.mobile || '',
                        cnic: p.cnic || '',
                        occupation: p.occupation || '',
                        address: p.address || ''
                    };
                });
            } else if (categoryKey === 'store') {
                sheetName = 'Store Inventory';
                fileName = `${schoolName}_Store_Inventory_${dateStr}`;
                const sSnap = await getDocs(query(collection(db, `schools/${schoolId}/store_items`)));
                rows = sSnap.docs.map(d => {
                    const item = d.data();
                    return {
                        itemName: item.name || '',
                        category: item.category || 'General',
                        salePrice: item.salePrice || item.price || 0,
                        costPrice: item.costPrice || 0,
                        inStock: item.stock || item.quantity || 0
                    };
                });
            }

            if (rows.length === 0) {
                setErrorMessage(`No records found for ${categoryKey} to export.`);
                return;
            }

            if (format === 'excel') {
                exportMultiSheetExcel(fileName + '.xlsx', { [sheetName]: rows });
                setSuccessMessage(`Success! "${fileName}.xlsx" downloaded with ${rows.length} records.`);
            } else {
                downloadSingleCSV(fileName + '.csv', rows);
                setSuccessMessage(`Success! "${fileName}.csv" downloaded with ${rows.length} records.`);
            }
        } catch (err) {
            console.error('[DataExportStudio] Category export error:', err);
            setErrorMessage(`Failed to export ${categoryKey}: ` + (err.message || 'Network error'));
        } finally {
            setExportingCategory(null);
            setProgressStatus('');
        }
    };

    // Category Card List definition
    const exportCategories = [
        {
            key: 'students',
            title: 'Students Master Roster',
            desc: 'Complete student directory with roll numbers, admission details, parent contacts, fees, and current dues.',
            icon: GraduationCap,
            iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-100',
            count: counts.students,
            unit: 'Students'
        },
        {
            key: 'teachers',
            title: 'Teachers & Staff Directory',
            desc: 'All faculty profiles, designations, monthly salaries, phone numbers, CNIC, and joining dates.',
            icon: Users,
            iconBg: 'bg-teal-50 text-teal-600 border-teal-100',
            count: counts.teachers,
            unit: 'Staff'
        },
        {
            key: 'fees',
            title: 'Fee Transactions & Receipts',
            desc: 'Chronological fee payment logs, paid amounts, receipt numbers, payment methods, and ledger settlements.',
            icon: DollarSign,
            iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
            count: counts.feeTransactions,
            unit: 'Receipts'
        },
        {
            key: 'classes',
            title: 'Classes & Fee Structure',
            desc: 'Registered class levels, sections, base tuition fee schedules, and enrolled student counts.',
            icon: Layers,
            iconBg: 'bg-purple-50 text-purple-600 border-purple-100',
            count: counts.classes,
            unit: 'Classes'
        },
        {
            key: 'parents',
            title: 'Parents Contact Directory',
            desc: 'Parent and guardian names, verified phone numbers, CNIC records, home addresses, and linked siblings.',
            icon: Users,
            iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
            count: counts.parents,
            unit: 'Parents'
        },
        {
            key: 'store',
            title: 'Store & Inventory Stock',
            desc: 'School bookstore inventory, uniform stock, retail prices, cost prices, and current quantities in hand.',
            icon: Package,
            iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
            count: counts.storeItems,
            unit: 'Items'
        }
    ];

    return (
        <div className="w-full space-y-6 animate-fadeIn pb-12">
            {/* 1. Header Banner */}
            <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div className="flex items-start sm:items-center gap-4">
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100 flex-shrink-0">
                        <Database className="w-7 h-7" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                                School Data Export & Sovereignty Studio
                            </h1>
                            <span className="px-3 py-0.5 text-xs font-extrabold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 flex items-center gap-1">
                                <ShieldCheck size={13} />
                                100% Zero Lock-In
                            </span>
                        </div>
                        <p className="text-sm font-medium text-slate-500 mt-1">
                            Export your complete school records in universal formats (Excel, CSV, JSON). You own your data unconditionally.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={fetchQuickStats}
                    disabled={statsLoading || !!exportingCategory}
                    className="self-start md:self-auto px-4 py-2 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-xl border border-slate-200 transition flex items-center gap-2"
                    title="Refresh data counts"
                >
                    <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} />
                    <span>Refresh Counts</span>
                </button>
            </div>

            {/* Alerts */}
            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-fadeIn">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
                    <span>{errorMessage}</span>
                </div>
            )}
            {successMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-fadeIn">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                    <span>{successMessage}</span>
                </div>
            )}

            {/* 2. Hero Action Card: One-Click Complete School Backup */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-900/50">
                {/* Background glow decoration */}
                <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute right-40 -bottom-20 w-60 h-60 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="space-y-3 max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold tracking-wide uppercase">
                            <Sparkles size={13} className="text-indigo-400" />
                            Comprehensive Full-System Export
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                            One-Click Complete School Backup
                        </h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            Download your entire school data in a single unified operation. All student profiles, faculty records, academic classes, fee collection ledgers, and parent contacts are securely bundled and prepared for immediate export. Makes migrating to any external system completely seamless.
                        </p>

                        {/* Quick Data Indicators */}
                        <div className="pt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-300">
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/10">
                                🎓 {statsLoading ? '...' : counts.students} Students
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/10">
                                👨‍🏫 {statsLoading ? '...' : counts.teachers} Teachers
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/10">
                                🏫 {statsLoading ? '...' : counts.classes} Classes
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/10">
                                💰 {statsLoading ? '...' : counts.feeTransactions} Receipts
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/10">
                                👨‍👩‍👧 {statsLoading ? '...' : counts.parents} Parents
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-3 flex-shrink-0">
                        {/* Download Master Excel */}
                        <button
                            type="button"
                            onClick={() => setConfirmModal({ open: true, actionType: 'all_excel', categoryName: 'Complete Master Excel' })}
                            disabled={!!exportingCategory}
                            className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-95"
                        >
                            {exportingCategory === 'all_excel' ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Generating Excel...</span>
                                </>
                            ) : (
                                <>
                                    <FileSpreadsheet className="w-5 h-5" />
                                    <span>Download Master Excel (.XLSX)</span>
                                </>
                            )}
                        </button>

                        {/* Download Complete ZIP Package */}
                        <button
                            type="button"
                            onClick={() => setConfirmModal({ open: true, actionType: 'all_zip', categoryName: 'Complete System ZIP' })}
                            disabled={!!exportingCategory}
                            className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-95"
                        >
                            {exportingCategory === 'all_zip' ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Packing ZIP Archive...</span>
                                </>
                            ) : (
                                <>
                                    <Archive className="w-5 h-5" />
                                    <span>Download Full Backup (.ZIP Bundle)</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Live Progress Bar for Full Exports */}
                {(exportingCategory === 'all_excel' || exportingCategory === 'all_zip') && (
                    <div className="mt-6 pt-5 border-t border-indigo-900/60 space-y-2 animate-fadeIn">
                        <div className="flex items-center justify-between text-xs font-bold text-indigo-200">
                            <span className="flex items-center gap-2">
                                <Loader2 size={13} className="animate-spin text-indigo-400" />
                                {progressStatus || 'Processing export...'}
                            </span>
                            <span>{progressPercent}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden p-0.5 border border-indigo-500/20">
                            <div 
                                className="bg-gradient-to-r from-teal-400 to-indigo-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 3. Section: Modular Category Exports */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                        <h3 className="text-lg font-black text-slate-800 tracking-tight">
                            Category-Wise Modular Exports
                        </h3>
                        <p className="text-xs font-medium text-slate-500">
                            Download specific departmental spreadsheets in Microsoft Excel (.xlsx) or Universal CSV format.
                        </p>
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        6 Export Modules Available
                    </span>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {exportCategories.map((cat) => {
                        const Icon = cat.icon;
                        const isExportingExcel = exportingCategory === `${cat.key}_excel`;
                        const isExportingCsv = exportingCategory === `${cat.key}_csv`;
                        const isBusy = !!exportingCategory;

                        return (
                            <div 
                                key={cat.key}
                                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${cat.iconBg}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <span className="px-2.5 py-1 text-xs font-extrabold bg-slate-100 text-slate-700 rounded-lg">
                                            {statsLoading ? '...' : `${cat.count} ${cat.unit}`}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className="text-base font-bold text-slate-800">
                                            {cat.title}
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                            {cat.desc}
                                        </p>
                                    </div>
                                </div>

                                {/* Download Buttons */}
                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => handleCategoryExport(cat.key, 'excel')}
                                        disabled={isBusy}
                                        className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 text-xs font-bold text-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={`Download ${cat.title} as Excel spreadsheet`}
                                    >
                                        {isExportingExcel ? (
                                            <Loader2 size={13} className="animate-spin text-emerald-600" />
                                        ) : (
                                            <FileSpreadsheet size={14} className="text-emerald-600" />
                                        )}
                                        <span>Excel (.xlsx)</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleCategoryExport(cat.key, 'csv')}
                                        disabled={isBusy}
                                        className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-xs font-bold text-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={`Download ${cat.title} as CSV file`}
                                    >
                                        {isExportingCsv ? (
                                            <Loader2 size={13} className="animate-spin text-indigo-600" />
                                        ) : (
                                            <ArrowDownToLine size={14} className="text-indigo-600" />
                                        )}
                                        <span>CSV File</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 4. Trust & Security Guarantee Footer Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 flex-shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-slate-800">
                        Zero Vendor Lock-In & Complete Data Ownership
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                        Under the MAI SMS Data Sovereignty Protocol, your institution maintains unconditional 100% legal and operational ownership of all records. All exported CSV and Excel files include native UTF-8 BOM encoding for seamless cross-platform compatibility across Microsoft Excel, Google Sheets, and third-party school software with zero formatting errors.
                    </p>
                </div>
            </div>

            {/* 5. Security & Authorization Confirmation Modal */}
            {confirmModal.open && (
                <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scaleUp">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-indigo-300">
                                <Lock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-base text-white">
                                    Confirm School Data Export
                                </h3>
                                <p className="text-xs text-indigo-200 mt-0.5">
                                    Administrative Authorization Verification
                                </p>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-4">
                            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <strong>Confidentiality Notice:</strong> School records contain sensitive student information, phone numbers, and financial receipts. Ensure you are downloading this backup to a secure device.
                                </div>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Target Export:</span>
                                    <span className="font-bold text-slate-800">{confirmModal.categoryName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">School Scope:</span>
                                    <span className="font-bold text-indigo-600">{schoolProfile?.name || 'Authorized School'}</span>
                                </div>
                            </div>

                            <p className="text-xs text-slate-600 text-center">
                                Do you wish to generate and download this export file now?
                            </p>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={() => setConfirmModal({ open: false, actionType: null, categoryName: null })}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const action = confirmModal.actionType;
                                    setConfirmModal({ open: false, actionType: null, categoryName: null });
                                    if (action === 'all_excel') {
                                        handleExportMasterExcel();
                                    } else if (action === 'all_zip') {
                                        handleExportZipArchive();
                                    }
                                }}
                                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                            >
                                <Download size={14} />
                                <span>Proceed & Download</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
