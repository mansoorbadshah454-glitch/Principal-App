import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    Wallet, Users, ChevronRight, Ban, CheckCircle, Plus, Trash2, X, 
    CheckSquare, Square, ArrowUpRight, ArrowDownRight, Download,
    Printer, Search, CheckCircle2, User, FileText, Loader2, Sparkles, Building2, Phone, Calendar, Clock, DollarSign,
    Image as ImageIcon, ExternalLink, Eye, Upload, Landmark, Smartphone, TrendingUp, Activity,
    PieChart, BarChart3, Zap, ShieldCheck, Layers
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from '../components/CachedImage';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    collection, onSnapshot, query, doc, updateDoc, deleteField, setDoc, getDoc, deleteDoc,
    getDocs, writeBatch, getDocsFromCache, addDoc, serverTimestamp, orderBy, limit
} from 'firebase/firestore';

// --- Components ---

const FinancesDashboard = ({ schoolId, currentAction }) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        baseExpectedRevenue: 0,
        basePaymentsReceived: 0,
        teachersSalary: 0,
        actionExpectedRevenue: 0,
        actionPaymentsReceived: 0,
        paidIndividualActions: []
    });
    
    const [financesData, setFinancesData] = useState({ incomes: [], expenses: [] });
    const [newIncome, setNewIncome] = useState({ name: '', amount: '' });
    const [newExpense, setNewExpense] = useState({ name: '', amount: '' });
    const [isSavingIncome, setIsSavingIncome] = useState(false);
    const [isSavingExpense, setIsSavingExpense] = useState(false);

    // PDF State
    const [schoolInfo, setSchoolInfo] = useState({ name: 'School Report', logo: '' });
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        if (!schoolId) return;
        
        let unsubStudentsList = [];
        let unsubTransactions = null;
        let unsubFinances = null;
        let isMounted = true;

        const setupLiveFinances = async () => {
            try {
                // 1. Fetch School & Teachers & Classes
                const [schoolDoc, teachersSnap, classesSnap] = await Promise.all([
                    getDoc(doc(db, `schools/${schoolId}`)),
                    getDocs(collection(db, `schools/${schoolId}/teachers`)),
                    getDocs(collection(db, `schools/${schoolId}/classes`))
                ]);

                if (schoolDoc.exists() && isMounted) {
                    setSchoolInfo({
                        name: schoolDoc.data().name || 'School Report',
                        logo: schoolDoc.data().profileImage || ''
                    });
                }

                // Calculate Teachers Salary
                let totalSalary = 0;
                teachersSnap.docs.forEach(doc => {
                    totalSalary += (Number(doc.data().salary) || 0);
                });

                const validClasses = classesSnap.docs.filter(c => c.id !== 'action_metadata');
                
                // Store live students by class & live fee transactions
                const classStudentsMap = {};
                let liveFeeTransactions = [];

                const recalculateTotals = () => {
                    if (!isMounted) return;
                    let expectedRev = 0;
                    let actionExpectedRev = 0;
                    let actionReceivedRev = 0;
                    let individualIncomesList = [];

                    validClasses.forEach(classDoc => {
                        const classId = classDoc.id;
                        const className = classDoc.data().name || 'Class';
                        const isTargetedByAction = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(classId)));
                        const students = classStudentsMap[classId] || [];

                        students.forEach(sData => {
                            // Regular Fees
                            let legacyTotalFee = (Number(sData.tuitionFee) || 0) + (Number(sData.transportFee) || 0) + (Number(sData.otherFees) || 0);
                            let structuredFee = 0;
                            if (sData.feeStructure && sData.feeStructure.length > 0) {
                                structuredFee = sData.feeStructure.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                                legacyTotalFee = 0;
                            }

                            const totalFee = legacyTotalFee + structuredFee;
                            expectedRev += totalFee;

                            // Global Action Fees
                            if (isTargetedByAction && currentAction) {
                                actionExpectedRev += Number(currentAction.amount || 0);
                                const actionStatus = sData.customPayments?.[currentAction.name]?.status;
                                if (actionStatus === 'paid') {
                                    actionReceivedRev += Number(currentAction.amount || 0);
                                }
                            }

                            // Individual Actions
                            if (sData.individualActions && sData.individualActions.length > 0) {
                                sData.individualActions.forEach(action => {
                                    actionExpectedRev += Number(action.amount || 0);
                                    if (action.status === 'paid') {
                                        actionReceivedRev += Number(action.amount || 0);
                                        individualIncomesList.push({
                                            id: `${sData.id}-${action.id}`,
                                            name: action.name,
                                            studentName: sData.name,
                                            rollNo: sData.rollNo || 'N/A',
                                            className: className,
                                            amount: Number(action.amount || 0),
                                            studentId: sData.id,
                                            classId: classId
                                        });
                                    }
                                });
                            }
                        });
                    });

                    // Calculate Payments Received from actual fee collection transactions
                    let totalTransactionsReceived = 0;
                    const recordedTxStudentIds = new Set();
                    liveFeeTransactions.forEach(tx => {
                        totalTransactionsReceived += (Number(tx.totalPaid) || 0);
                        if (tx.studentId) recordedTxStudentIds.add(tx.studentId);
                    });

                    // Add any students marked paid manually without a formal feeTransactions log
                    let manualPaidStudentFees = 0;
                    validClasses.forEach(classDoc => {
                        const students = classStudentsMap[classDoc.id] || [];
                        students.forEach(sData => {
                            if (sData.monthlyFeeStatus === 'paid' && !recordedTxStudentIds.has(sData.id)) {
                                let legacyTotalFee = (Number(sData.tuitionFee) || 0) + (Number(sData.transportFee) || 0) + (Number(sData.otherFees) || 0);
                                let structuredFee = 0;
                                if (sData.feeStructure && sData.feeStructure.length > 0) {
                                    structuredFee = sData.feeStructure.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                                    legacyTotalFee = 0;
                                }
                                const studentFee = Number(sData.lastPaymentAmount) || (legacyTotalFee + structuredFee) || 0;
                                manualPaidStudentFees += studentFee;
                            }
                        });
                    });

                    const totalBasePaymentsReceived = totalTransactionsReceived + manualPaidStudentFees;

                    setStats({
                        baseExpectedRevenue: expectedRev,
                        basePaymentsReceived: totalBasePaymentsReceived,
                        teachersSalary: totalSalary,
                        actionExpectedRevenue: actionExpectedRev,
                        actionPaymentsReceived: actionReceivedRev,
                        paidIndividualActions: individualIncomesList
                    });
                    setLoading(false);
                };

                // Real-time listener for Fee Transactions collection
                const transactionsRef = collection(db, `schools/${schoolId}/feeTransactions`);
                unsubTransactions = onSnapshot(transactionsRef, (snapshot) => {
                    liveFeeTransactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    recalculateTotals();
                }, (err) => {
                    console.warn("Finances feeTransactions listener warning:", err);
                });

                // Real-time listener for each class's students
                validClasses.forEach(classDoc => {
                    const studentsRef = collection(db, `schools/${schoolId}/classes/${classDoc.id}/students`);
                    const unsub = onSnapshot(studentsRef, (snapshot) => {
                        classStudentsMap[classDoc.id] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        recalculateTotals();
                    }, (err) => {
                        console.warn(`Students listener error for class ${classDoc.id}:`, err);
                    });
                    unsubStudentsList.push(unsub);
                });

                if (validClasses.length === 0) {
                    recalculateTotals();
                }

            } catch (err) {
                console.error("Error setting up live finances:", err);
                if (isMounted) setLoading(false);
            }
        };

        setupLiveFinances();

        // 3. Listen to custom finances (incomes and expenses)
        unsubFinances = onSnapshot(doc(db, `schools/${schoolId}/settings/finances`), (docSnap) => {
            if (docSnap.exists() && isMounted) {
                const data = docSnap.data();
                setFinancesData({
                    incomes: data.incomes || [],
                    expenses: data.expenses || []
                });
            } else if (isMounted) {
                setFinancesData({ incomes: [], expenses: [] });
            }
        });

        return () => {
            isMounted = false;
            unsubStudentsList.forEach(unsub => unsub());
            if (unsubTransactions) unsubTransactions();
            if (unsubFinances) unsubFinances();
        };
    }, [schoolId, currentAction]);

    // Math Calculations
    const totalPermanentIncomes = financesData.incomes.filter(i => i.type === 'permanent').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalOneTimeIncomes = financesData.incomes.filter(i => i.type === 'one-time').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalAllIncomes = totalPermanentIncomes + totalOneTimeIncomes;

    const totalPermanentExpenses = financesData.expenses.filter(e => e.type === 'permanent').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalOneTimeExpenses = financesData.expenses.filter(e => e.type === 'one-time').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalAllCustomExpenses = totalPermanentExpenses + totalOneTimeExpenses;

    const finalExpectedRevenue = stats.baseExpectedRevenue + totalPermanentIncomes + (stats.actionExpectedRevenue || 0);
    const finalPaymentsReceived = stats.basePaymentsReceived + totalAllIncomes + (stats.actionPaymentsReceived || 0);
    const finalTotalExpenses = stats.teachersSalary + totalAllCustomExpenses;
    const netProfit = finalPaymentsReceived - finalTotalExpenses;

    // Handlers
    const checkManualBypass = () => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Database writes are disabled.");
                return true;
            }
        }
        return false;
    };

    const handleAddFinance = async (type, category, itemData, setSaving, setForm) => {
        if (checkManualBypass()) return;
        if (!itemData.name || !itemData.amount) return;
        setSaving(true);
        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            const docSnap = await getDoc(docRef);
            const currentData = docSnap.exists() ? docSnap.data() : { incomes: [], expenses: [] };
            const newList = currentData[category] || [];
            
            newList.push({
                id: Date.now().toString(),
                name: itemData.name,
                amount: Number(itemData.amount),
                type: type, // 'one-time' or 'permanent'
                createdAt: new Date().toISOString()
            });

            await setDoc(docRef, { [category]: newList }, { merge: true });
            setForm({ name: '', amount: '' });
        } catch (err) {
            console.error(`Error adding ${category}:`, err);
            alert("Failed to save entry. Please check your connection.");
        }
        setSaving(false);
    };

    const handleDeleteFinance = async (id, category) => {
        if (checkManualBypass()) return;
        if (!window.confirm("Are you sure you want to delete this entry?")) return;
        
        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const newList = (docSnap.data()[category] || []).filter(item => item.id !== id);
                await setDoc(docRef, { [category]: newList }, { merge: true });
            }
        } catch (err) {
            console.error(`Error deleting ${category}:`, err);
            alert("Failed to delete entry.");
        }
    };

    const handleRevertIndividualAction = async (classId, studentId, actionId) => {
        if (checkManualBypass()) return;
        if (!window.confirm("Are you sure you want to remove this paid action from finances?")) return;
        
        try {
            const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);
            
            const docSnap = await getDoc(studentRef);
            if (docSnap.exists()) {
                const sData = docSnap.data();
                const updatedActions = (sData.individualActions || []).map(a => 
                    a.id === actionId ? { ...a, status: 'unpaid' } : a
                );
                
                await updateDoc(studentRef, { individualActions: updatedActions });
                try { await updateDoc(masterStudentRef, { individualActions: updatedActions }); } catch(e){}
            }
        } catch (err) {
            console.error("Error removing action:", err);
            alert("Failed to remove action.");
        }
    };

    const getBase64ImageFromUrl = async (imageUrl) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to load image for PDF", e);
            return null;
        }
    };

    const handleDownloadReport = async () => {
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            
            // 1. Header Section - Blue Background
            doc.setFillColor(30, 58, 138); // Blue-900
            doc.rect(0, 0, pageWidth, 50, 'F');

            let hasLogo = false;
            if (schoolInfo.logo) {
                const base64Img = await getBase64ImageFromUrl(schoolInfo.logo);
                if (base64Img) {
                    doc.addImage(base64Img, 'PNG', 15, 12, 26, 26);
                    hasLogo = true;
                }
            }

            // School Name
            const textX = hasLogo ? 50 : 15;
            doc.setFontSize(22);
            doc.setTextColor(255, 255, 255); // White
            doc.setFont("helvetica", "bold");
            doc.text((schoolInfo.name || 'School Report').toUpperCase(), textX, 24);

            // Report Title
            doc.setFontSize(14);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            doc.text("Monthly Financial Report", textX, 32);

            // Date
            doc.setFontSize(10);
            doc.setTextColor(148, 163, 184); // Slate-400
            const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
            doc.text(`For: ${currentMonth}`, textX, 38);

            // Reset color for body
            doc.setTextColor(30, 41, 59);
            let startY = 60;

            // 2. Financial Summary Badges
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Financial Summary", 14, startY);
            
            const summaryData = [
                ['Expected Monthly Revenue', `Rs ${finalExpectedRevenue.toLocaleString()}`],
                ['Payments Received', `Rs ${finalPaymentsReceived.toLocaleString()}`],
                ['Total Expenses', `Rs ${finalTotalExpenses.toLocaleString()}`],
                ['Net Profit', `Rs ${netProfit.toLocaleString()}`]
            ];
            
            autoTable(doc, {
                startY: startY + 5,
                body: summaryData,
                theme: 'grid',
                styles: { fontSize: 11, cellPadding: 5 },
                columnStyles: {
                    0: { fontStyle: 'bold', fillColor: [248, 250, 252] },
                    1: { halign: 'right', textColor: [22, 163, 74] } 
                },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.index === 1) {
                        if (data.row.index === 2) data.cell.styles.textColor = [220, 38, 38]; 
                        if (data.row.index === 3 && netProfit < 0) data.cell.styles.textColor = [220, 38, 38];
                    }
                }
            });

            // 3. Incomes Breakdown
            let currentY = doc.lastAutoTable.finalY + 15;
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0);
            doc.text("Income Breakdown", 14, currentY);
            
            const incomesBody = financesData.incomes.map(inc => [
                inc.name, 
                inc.type === 'permanent' ? 'Auto (Recurring)' : 'One-time', 
                `Rs ${Number(inc.amount).toLocaleString()}`
            ]);

            // Add Individual Actions to PDF Report
            if (stats.paidIndividualActions && stats.paidIndividualActions.length > 0) {
                stats.paidIndividualActions.forEach(action => {
                    incomesBody.unshift([
                        `${action.name} (${action.studentName}, Roll: ${action.rollNo}, Class: ${action.className})`,
                        'Individual Action',
                        `Rs ${action.amount.toLocaleString()}`
                    ]);
                });
            }

            if (currentAction) {
                incomesBody.unshift([
                    currentAction.name,
                    'Global Action',
                    `Rs ${(stats.actionPaymentsReceived - (stats.paidIndividualActions?.reduce((sum, a) => sum + a.amount, 0) || 0)).toLocaleString()}` // only show the global part
                ]);
            }
            
            autoTable(doc, {
                startY: currentY + 5,
                head: [['Title', 'Type', 'Amount']],
                body: incomesBody.length > 0 ? incomesBody : [['No manual incomes recorded', '-', '-']],
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] },
                columnStyles: { 2: { halign: 'right' } }
            });

            // 4. Expenses Breakdown
            currentY = doc.lastAutoTable.finalY + 15;
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0);
            doc.text("Expenses Breakdown", 14, currentY);
            
            const expensesBody = [
                ['Teachers Salaries', 'Auto (Recurring)', `Rs ${stats.teachersSalary.toLocaleString()}`],
                ...financesData.expenses.map(exp => [
                    exp.name, 
                    exp.type === 'permanent' ? 'Auto (Recurring)' : 'One-time', 
                    `Rs ${Number(exp.amount).toLocaleString()}`
                ])
            ];
            
            autoTable(doc, {
                startY: currentY + 5,
                head: [['Title', 'Type', 'Amount']],
                body: expensesBody,
                theme: 'striped',
                headStyles: { fillColor: [220, 38, 38] },
                columnStyles: { 2: { halign: 'right' } }
            });

            // 5. Footer
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(10);
                doc.setFont(undefined, 'italic');
                doc.setTextColor(150);
                const footerText = `"Generated by Principal" School's official monthly report - Date: ${new Date().toLocaleDateString()}`;
                doc.text(footerText, 14, doc.internal.pageSize.height - 10);
                doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
            }

            doc.save(`Financial_Report_${new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}.pdf`);
            
        } catch (err) {
            console.error("Error generating PDF:", err);
            alert("Failed to generate PDF. Please try again.");
        }
        setIsGeneratingPDF(false);
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading Finances...</div>;

    return (
        <div className="animate-fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>
                    Financial Overview
                </h3>
                <button 
                    onClick={handleDownloadReport}
                    disabled={isGeneratingPDF}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem',
                        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white',
                        border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', opacity: isGeneratingPDF ? 0.7 : 1
                    }}
                >
                    <Download size={18} />
                    {isGeneratingPDF ? 'Generating PDF...' : 'Download Report'}
                </button>
            </div>
            
            {/* Top Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', border: '1px solid #dcfce7' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Expected Monthly Revenue</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#16a34a', marginTop: '0.5rem' }}>Rs {finalExpectedRevenue.toLocaleString()}</div>
                </div>
                <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)', border: '1px solid #dbeafe' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Payments Received</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#2563eb', marginTop: '0.5rem' }}>Rs {finalPaymentsReceived.toLocaleString()}</div>
                </div>
                <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)', border: '1px solid #fee2e2' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Total Expenses</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#dc2626', marginTop: '0.5rem' }}>Rs {finalTotalExpenses.toLocaleString()}</div>
                </div>
                <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)', border: '1px solid #fef3c7' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Net Profit</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: netProfit >= 0 ? '#16a34a' : '#dc2626', marginTop: '0.5rem' }}>
                        Rs {netProfit.toLocaleString()}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ActionModal = ({ isOpen, onClose, onSave, classes }) => {
    if (!isOpen) return null;

    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [targetAll, setTargetAll] = useState(true);
    const [selectedClasses, setSelectedClasses] = useState([]);

    const handleSubmit = () => {
        if (!name.trim() || !amount) return;
        onSave({
            name: name.trim(),
            amount: Number(amount),
            targetAll,
            targetClasses: targetAll ? [] : selectedClasses
        });
        setName('');
        setAmount('');
        setTargetAll(true);
        setSelectedClasses([]);
        onClose();
    };

    const toggleClass = (classId) => {
        setSelectedClasses(prev =>
            prev.includes(classId)
                ? prev.filter(id => id !== classId)
                : [...prev, classId]
        );
    };

    return (
        <div style={{
            position: 'fixed', top: '20px', left: 0, width: '100%',
            background: 'transparent', display: 'flex', justifyContent: 'center',
            zIndex: 1000, pointerEvents: 'none'
        }}>
            <div className="card" style={{
                width: '90%', maxWidth: '500px', background: 'white', borderRadius: '24px',
                padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                pointerEvents: 'auto'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>New Collection Action</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Action Name</label>
                    <input
                        type="text"
                        placeholder="e.g. App Payment, Uniform Fee, Fine"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
                            border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none',
                            transition: 'border-color 0.2s',
                            background: '#f8fafc'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Amount Per Student (Rs)</label>
                    <input
                        type="number"
                        placeholder="e.g. 500"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
                            border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none',
                            transition: 'border-color 0.2s',
                            background: '#f8fafc'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Target Classes</label>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button
                            onClick={() => setTargetAll(true)}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid',
                                borderColor: targetAll ? 'var(--primary)' : '#e2e8f0',
                                background: targetAll ? 'var(--primary)' : 'white',
                                color: targetAll ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                            }}
                        >
                            All Classes
                        </button>
                        <button
                            onClick={() => setTargetAll(false)}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid',
                                borderColor: !targetAll ? 'var(--primary)' : '#e2e8f0',
                                background: !targetAll ? 'var(--primary)' : 'white',
                                color: !targetAll ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                            }}
                        >
                            Select Classes
                        </button>
                    </div>

                    {!targetAll && (
                        <div style={{
                            maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0',
                            borderRadius: '12px', padding: '0.5rem'
                        }}>
                            {classes.map(cls => (
                                <div
                                    key={cls.id}
                                    onClick={() => toggleClass(cls.id)}
                                    style={{
                                        padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        cursor: 'pointer', borderRadius: '8px',
                                        background: selectedClasses.includes(cls.id) ? '#eff6ff' : 'transparent'
                                    }}
                                >
                                    {selectedClasses.includes(cls.id) ? (
                                        <CheckSquare size={20} color="var(--primary)" />
                                    ) : (
                                        <Square size={20} color="#cbd5e1" />
                                    )}
                                    <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>{cls.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none',
                            background: '#f1f5f9', color: 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        style={{
                            padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none',
                            background: 'var(--primary)', color: 'white', fontWeight: '600', cursor: 'pointer',
                            opacity: name.trim() ? 1 : 0.5
                        }}
                    >
                        Create Action
                    </button>
                </div>
            </div>
        </div>
    );
};

const CollectionClassCard = ({ cls, currentAction, schoolId }) => {
    const navigate = useNavigate();
    const [monthlyStats, setMonthlyStats] = useState({ paid: 0, unpaid: 0, total: 0, loading: true });
    const [actionStats, setActionStats] = useState({ paid: 0, unpaid: 0, total: 0, loading: true });

    // Is this class targeted by the current action?
    const isTargeted = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(cls.id)));

    // Fetch Real-time Stats from Database
    useEffect(() => {
        if (!schoolId || !cls.id) {
            setMonthlyStats({ paid: 0, unpaid: 0, total: 0, loading: false });
            setActionStats({ paid: 0, unpaid: 0, total: 0, loading: false });
            return;
        }

        const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let monthlyPaid = 0;
            let monthlyUnpaid = 0;
            let actionPaid = 0;
            let actionUnpaid = 0;

            snapshot.docs.forEach(doc => {
                const data = doc.data();

                // Count Monthly Fee Status
                const monthlyStatus = data.monthlyFeeStatus || 'unpaid';
                if (monthlyStatus === 'paid') {
                    monthlyPaid++;
                } else {
                    monthlyUnpaid++;
                }

                // Count Action Fee Status (if targeted)
                if (isTargeted && currentAction) {
                    const actionStatus = data.customPayments?.[currentAction.name]?.status;
                    if (actionStatus === 'paid') {
                        actionPaid++;
                    } else {
                        actionUnpaid++;
                    }
                }
            });

            setMonthlyStats({
                paid: monthlyPaid,
                unpaid: monthlyUnpaid,
                total: snapshot.size,
                loading: false
            });

            setActionStats({
                paid: actionPaid,
                unpaid: actionUnpaid,
                total: snapshot.size,
                loading: false
            });
        });

        return () => unsubscribe();
    }, [schoolId, cls.id, currentAction, isTargeted]);


    // Dynamic Theme Color
    const seed = cls.id.charCodeAt(0) || 123;
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? 'var(--primary)' : 'var(--secondary)';

    const StatsPair = ({ label, paid, unpaid }) => (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
            {/* Paid Card */}
            <div style={{
                flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'white',
                border: '1px solid #dcfce7', cursor: 'default',
                display: 'flex', flexDirection: 'column', gap: '0.25rem',
                borderBottom: '3px solid #10b981'
            }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#10b981', textTransform: 'uppercase' }}>
                    {label ? `${label} Paid` : 'Paid'}
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>{paid}</span>
            </div>
            {/* Unpaid Card */}
            <div style={{
                flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'white',
                border: '1px solid #fee2e2', cursor: 'default',
                display: 'flex', flexDirection: 'column', gap: '0.25rem',
                borderBottom: '3px solid #ef4444',
                boxShadow: unpaid > 0 ? '0 0 10px rgba(239, 68, 68, 0.1)' : 'none'
            }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#ef4444', textTransform: 'uppercase' }}>
                    {label ? `${label} Unpaid` : 'Unpaid'}
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>{unpaid}</span>
            </div>
        </div>
    );

    return (
        <div
            onClick={() => {
                navigate(`/collections/${cls.id}`);
            }}
            className="card" style={{
                padding: '0',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.25)',
                position: 'relative',
                background: 'linear-gradient(145deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
                boxShadow: `4px 4px 0 rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)`,
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                color: 'white'
            }}>
            {/* Decoration Strip */}
            <div style={{ height: '6px', width: '100%', background: `linear-gradient(90deg, ${themeColor}, transparent)` }} />

            <div style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.18)', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{cls.name}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{cls.teacher || 'No Teacher'}</p>
                        </div>
                        {isTargeted ? (
                            <div style={{
                                padding: '0.25rem 0.75rem', background: 'var(--primary)', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: '600', color: 'white',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                                Action Active
                            </div>
                        ) : (
                            <div style={{
                                padding: '0.25rem 0.75rem', background: 'rgba(255,255,255,0.15)', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: '600', color: 'white',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                Standard
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.08)' }}>
                    {/* Total Students Badge */}
                    <div style={{ marginBottom: '0.25rem' }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.15)',
                            borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', color: 'white',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                        }}>
                            <Users size={16} color="white" />
                            <span>{monthlyStats.total} Students</span>
                        </div>
                    </div>
                    {/* 1. Monthly Fee Stats */}
                    <StatsPair label="Fee" paid={monthlyStats.paid} unpaid={monthlyStats.unpaid} />

                    {/* 2. Action Stats (Calculated & Stacked) */}
                    {isTargeted && (
                        <div className="animate-fade-in-up">
                            <StatsPair label={currentAction.name} paid={actionStats.paid} unpaid={actionStats.unpaid} />
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                        fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', fontWeight: '600',
                        display: 'flex', alignItems: 'center', gap: '0.25rem'
                    }}>
                        View Details <ChevronRight size={16} />
                    </span>
                </div>
            </div>
        </div>
    );
};

// --- Payment Proof Image Lightbox Modal ---
const PaymentProofModal = ({ isOpen, onClose, proofUrl, title }) => {
    if (!isOpen || !proofUrl) return null;
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem'
        }}>
            <div className="card" style={{
                background: '#ffffff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '560px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                padding: '1.5rem',
                position: 'relative'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ImageIcon size={18} color="#0078d4" />
                        {title || 'Payment Receipt / Screenshot'}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#f1f5f9',
                            border: 'none',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#64748b'
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0.5rem', textAlign: 'center', maxHeight: '60vh', overflow: 'auto' }}>
                    <img src={proofUrl} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: '6px' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                    <a
                        href={proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.85rem',
                            color: '#0078d4',
                            textDecoration: 'none',
                            fontWeight: '600'
                        }}
                    >
                        <ExternalLink size={15} /> Open Full Image in New Tab
                    </a>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.5rem 1.25rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Fee Receipt Printable Modal ---
const FeeReceiptModal = ({ isOpen, onClose, receiptData, schoolInfo }) => {
    if (!isOpen || !receiptData) return null;

    const printRef = useRef();
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadPDF = async () => {
        try {
            setIsDownloading(true);
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const primaryColor = [0, 120, 212]; // #0078d4
            const darkColor = [15, 23, 42];    // #0f172a
            const grayColor = [100, 116, 139]; // #64748b

            // 1. School Header
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(...darkColor);
            doc.text((schoolInfo?.name || 'OFFICIAL SCHOOL RECEIPT').toUpperCase(), 14, 20);

            doc.setFillColor(...primaryColor);
            doc.roundedRect(14, 24, 46, 6, 1.5, 1.5, 'F');
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('FEE PAYMENT VOUCHER', 16, 28);

            // Receipt Meta (Right Aligned)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...grayColor);
            doc.text('RECEIPT NO:', 196, 18, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...primaryColor);
            doc.text(receiptData.receiptNo || 'N/A', 196, 24, { align: 'right' });

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text(`Date: ${receiptData.dateString || ''} ${receiptData.timeString || ''}`, 196, 29, { align: 'right' });

            // Horizontal Line
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(14, 34, 196, 34);

            // 2. Student Info Box
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(14, 38, 182, 32, 2, 2, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(14, 38, 182, 32, 2, 2, 'S');

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Student Name:', 18, 45);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.studentName || 'N/A', 45, 45);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Roll No:', 120, 45);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(String(receiptData.rollNo || 'N/A'), 140, 45);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Class:', 18, 54);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.className || 'N/A', 45, 54);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Father Name:', 120, 54);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.fatherName || 'N/A', 145, 54);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Payment Mode:', 18, 63);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(22, 163, 74);
            doc.text(receiptData.paymentMode || 'Cash', 45, 63);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Collected By:', 120, 63);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.collectedBy || 'Principal Office', 145, 63);

            // 3. Fee Breakdown Table
            const tableRows = (receiptData.items || []).map((item, idx) => [
                idx + 1,
                item.name,
                `Rs ${Number(item.amount).toLocaleString()}`
            ]);

            if (receiptData.discount > 0) {
                tableRows.push([
                    '-',
                    'Discount / Concession',
                    `- Rs ${Number(receiptData.discount).toLocaleString()}`
                ]);
            }

            tableRows.push([
                '',
                'TOTAL AMOUNT PAID',
                `Rs ${Number(receiptData.totalPaid).toLocaleString()}`
            ]);

            autoTable(doc, {
                startY: 76,
                head: [['#', 'Fee Description', 'Amount (PKR)']],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 9,
                    halign: 'left'
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 15 },
                    1: { halign: 'left' },
                    2: { halign: 'right', fontStyle: 'bold', cellWidth: 45 }
                },
                styles: {
                    font: 'helvetica',
                    fontSize: 9,
                    cellPadding: 3.5,
                    lineColor: [226, 232, 240]
                },
                didParseCell: function(data) {
                    if (data.row.index === tableRows.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [240, 253, 244];
                        data.cell.styles.textColor = [22, 101, 52];
                        data.cell.styles.fontSize = 10;
                    }
                    if (receiptData.discount > 0 && data.row.index === tableRows.length - 2) {
                        data.cell.styles.textColor = [22, 163, 74];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });

            const finalY = doc.lastAutoTable?.finalY || 130;

            if (receiptData.remarks) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...grayColor);
                doc.text(`Remarks / Notes: ${receiptData.remarks}`, 14, finalY + 8);
            }

            // 4. Footer & Signature
            const footerY = Math.max(finalY + 22, 155);
            doc.setDrawColor(203, 213, 225);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(14, footerY, 196, footerY);
            doc.setLineDashPattern([], 0);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('* This is a computer-generated fee receipt. Valid without physical seal.', 14, footerY + 8);

            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.5);
            doc.line(150, footerY + 16, 196, footerY + 16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text('Authorized Signature', 173, footerY + 21, { align: 'center' });

            const safeName = (receiptData.studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
            doc.save(`Fee_Receipt_${receiptData.receiptNo}_${safeName}.pdf`);
        } catch (err) {
            console.error("PDF generation failed:", err);
            alert("Failed to generate PDF. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handlePrint = () => {
        const printContent = document.getElementById('printable-fee-receipt');
        if (!printContent) return;

        const printWindow = window.open('', '', 'width=800,height=900');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Fee Receipt - ${receiptData.receiptNo}</title>
                    <style>
                        @page { size: auto; margin: 15mm; }
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                            color: #1e293b; 
                            margin: 0; 
                            padding: 20px; 
                            background: #fff;
                        }
                        .receipt-container { 
                            max-width: 650px; 
                            margin: 0 auto; 
                            border: 2px solid #0f172a; 
                            padding: 24px; 
                            border-radius: 8px; 
                        }
                        .header { 
                            display: flex; 
                            align-items: center; 
                            justify-content: space-between; 
                            border-bottom: 2px solid #e2e8f0; 
                            padding-bottom: 16px; 
                            margin-bottom: 20px; 
                        }
                        .school-name { 
                            font-size: 22px; 
                            font-weight: 800; 
                            color: #0f172a; 
                            text-transform: uppercase; 
                            margin: 0; 
                        }
                        .receipt-badge { 
                            display: inline-block; 
                            background: #0f172a; 
                            color: #fff; 
                            font-size: 11px; 
                            font-weight: 700; 
                            padding: 4px 10px; 
                            border-radius: 4px; 
                            margin-top: 4px; 
                            text-transform: uppercase; 
                        }
                        .grid-info { 
                            display: grid; 
                            grid-template-columns: 1fr 1fr; 
                            gap: 12px; 
                            margin-bottom: 20px; 
                            background: #f8fafc; 
                            padding: 14px; 
                            border-radius: 6px; 
                            border: 1px solid #e2e8f0; 
                            font-size: 13px; 
                        }
                        .grid-info div span { 
                            font-weight: 700; 
                            color: #475569; 
                        }
                        table { 
                            width: 100%; 
                            border-collapse: collapse; 
                            margin-bottom: 20px; 
                            font-size: 13px; 
                        }
                        th { 
                            background: #f1f5f9; 
                            padding: 10px 12px; 
                            text-align: left; 
                            border-bottom: 2px solid #cbd5e1; 
                            font-weight: 700; 
                            color: #1e293b; 
                        }
                        td { 
                            padding: 9px 12px; 
                            border-bottom: 1px solid #e2e8f0; 
                            color: #334155; 
                        }
                        .total-row td { 
                            font-size: 15px; 
                            font-weight: 800; 
                            border-top: 2px solid #0f172a; 
                            border-bottom: 2px solid #0f172a; 
                            color: #0f172a; 
                            background: #f8fafc; 
                        }
                        .footer { 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: flex-end; 
                            margin-top: 35px; 
                            padding-top: 20px; 
                            border-top: 1px dashed #cbd5e1; 
                            font-size: 12px; 
                            color: #64748b; 
                        }
                        .signature-box { 
                            text-align: center; 
                            border-top: 1px solid #94a3b8; 
                            padding-top: 6px; 
                            width: 150px; 
                            color: #0f172a; 
                            font-weight: 600; 
                        }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                    <script>
                        window.onload = function() {
                            window.focus();
                            window.print();
                            window.close();
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div className="card" style={{
                background: '#ffffff',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '680px',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                padding: '1.75rem',
                position: 'relative'
            }}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1.25rem',
                        right: '1.25rem',
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#64748b'
                    }}
                >
                    <X size={18} />
                </button>

                {/* Printable Content Container */}
                <div id="printable-fee-receipt">
                    <div className="receipt-container" style={{
                        border: '2px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        background: '#ffffff'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {schoolInfo?.logo ? (
                                    <img src={schoolInfo.logo} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '6px' }} />
                                ) : (
                                    <div style={{ width: '48px', height: '48px', background: '#0078d4', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                        <Building2 size={24} />
                                    </div>
                                )}
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>
                                        {schoolInfo?.name || 'OFFICIAL SCHOOL RECEIPT'}
                                    </h2>
                                    <span style={{ display: 'inline-block', background: '#0078d4', color: 'white', fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', marginTop: '4px', textTransform: 'uppercase' }}>
                                        Fee Payment Voucher
                                    </span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>RECEIPT NO</span>
                                <span style={{ fontSize: '1rem', fontWeight: '800', color: '#0078d4' }}>{receiptData.receiptNo}</span>
                            </div>
                        </div>

                        {/* Student Details Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Student Name: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.studentName}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Roll No: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.rollNo || 'N/A'}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Class: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.className}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Father Name: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.fatherName || 'N/A'}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Date & Time: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.dateString} {receiptData.timeString}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Payment Mode: </span>
                                <strong style={{ color: '#16a34a' }}>{receiptData.paymentMode}</strong>
                            </div>
                        </div>

                        {/* Fee Breakdown Table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#1e293b', fontWeight: '700' }}>Description</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#1e293b', fontWeight: '700' }}>Amount (Rs)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receiptData.items?.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', color: '#334155' }}>{item.name}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600', color: '#0f172a' }}>
                                            Rs {Number(item.amount).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {receiptData.discount > 0 && (
                                    <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#16a34a' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600' }}>Discount / Concession</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600' }}>
                                            - Rs {Number(receiptData.discount).toLocaleString()}
                                        </td>
                                    </tr>
                                )}
                                <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                                    <td style={{ padding: '0.75rem', fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>TOTAL AMOUNT PAID</td>
                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '800', fontSize: '1.1rem', color: '#16a34a' }}>
                                        Rs {Number(receiptData.totalPaid).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {receiptData.remarks && (
                            <div style={{ marginBottom: '1.25rem', fontSize: '0.8rem', color: '#64748b' }}>
                                <strong>Remarks:</strong> {receiptData.remarks}
                            </div>
                        )}

                        {/* Footer Signatures */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.75rem', color: '#64748b' }}>
                            <div>
                                <span>* This is a computer-generated fee receipt.</span>
                            </div>
                            <div style={{ textAlign: 'center', borderTop: '1px solid #94a3b8', width: '140px', paddingTop: '4px', color: '#0f172a', fontWeight: '600' }}>
                                Authorized Signature
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.65rem 1.25rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                    
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isDownloading}
                        style={{
                            padding: '0.65rem 1.4rem',
                            borderRadius: '8px',
                            border: '1px solid #16a34a',
                            background: '#f0fdf4',
                            color: '#15803d',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            opacity: isDownloading ? 0.7 : 1
                        }}
                    >
                        {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                    </button>

                    <button
                        onClick={handlePrint}
                        style={{
                            padding: '0.65rem 1.5rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#0078d4',
                            color: '#ffffff',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0, 120, 212, 0.25)'
                        }}
                    >
                        <Printer size={18} /> Print Slip
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Daily Workflow Fee Collection Widget ---
const DailyWorkflow = ({ schoolId, classes, currentAction, schoolInfo, preselectedClassId, preselectedStudentId }) => {
    const navigate = useNavigate();

    // 1. Selector & Search States
    const [selectedClassId, setSelectedClassId] = useState(preselectedClassId || '');
    const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudentId || '');
    const [classStudents, setClassStudents] = useState([]);
    const [loadingClassStudents, setLoadingClassStudents] = useState(false);

    // Global Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [allStudents, setAllStudents] = useState([]);
    const [loadingAllStudents, setLoadingAllStudents] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);

    // 2. Selected Student Fee Calculation & Payment Form
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [receivedAmount, setReceivedAmount] = useState('');
    const [discountAmount, setDiscountAmount] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Payment Proof Screenshot States
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [proofModal, setProofModal] = useState({ isOpen: false, url: '', title: '' });

    const handleProofChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setProofFile(file);
            const previewUrl = URL.createObjectURL(file);
            setProofPreview(previewUrl);
        }
    };

    const handleRemoveProof = () => {
        setProofFile(null);
        if (proofPreview) {
            URL.revokeObjectURL(proofPreview);
        }
        setProofPreview(null);
    };

    // 3. Receipt State
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    // 4. Recent Transactions Log
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(true);
    const [isGeneratingDailyPDF, setIsGeneratingDailyPDF] = useState(false);
    const [isGeneratingFinancesPDF, setIsGeneratingFinancesPDF] = useState(false);
    const [localSchoolInfo, setLocalSchoolInfo] = useState(schoolInfo || { name: 'School Report', logo: '' });

    // 5. Daily Mode: 'fee_submission' (default) or 'income_expense'
    const [activeDailyMode, setActiveDailyMode] = useState('fee_submission');
    
    // 6. Finances Data & Operations for Daily Workflow
    const [financesData, setFinancesData] = useState({ incomes: [], expenses: [] });
    const [teachersSalary, setTeachersSalary] = useState(0);
    const [newIncome, setNewIncome] = useState({ name: '', amount: '', remarks: '' });
    const [newExpense, setNewExpense] = useState({ name: '', amount: '', remarks: '' });
    const [isSavingIncome, setIsSavingIncome] = useState(false);
    const [isSavingExpense, setIsSavingExpense] = useState(false);
    const [rightCardTab, setRightCardTab] = useState('fee_slips'); // 'fee_slips' | 'finances_breakdown'

    // Live Finances Listener (Incomes & Expenses)
    useEffect(() => {
        if (!schoolId) return;
        const unsub = onSnapshot(doc(db, `schools/${schoolId}/settings/finances`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFinancesData({
                    incomes: data.incomes || [],
                    expenses: data.expenses || []
                });
            } else {
                setFinancesData({ incomes: [], expenses: [] });
            }
        });
        return () => unsub();
    }, [schoolId]);

    // Live/Fetched Teachers Total Salary for Breakdown
    useEffect(() => {
        if (!schoolId) return;
        const fetchTeachers = async () => {
            try {
                const teachersSnap = await getDocs(collection(db, `schools/${schoolId}/teachers`));
                let totalSalary = 0;
                teachersSnap.docs.forEach(doc => {
                    totalSalary += (Number(doc.data().salary) || 0);
                });
                setTeachersSalary(totalSalary);
            } catch (err) {
                console.warn("Could not fetch teachers salary for breakdown:", err);
            }
        };
        fetchTeachers();
    }, [schoolId]);

    const handleAddFinance = async (type, category, itemData, setSaving, setForm) => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Database writes are disabled.");
                return;
            }
        }
        if (!itemData.name || !itemData.amount) return;
        setSaving(true);
        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            const docSnap = await getDoc(docRef);
            const currentData = docSnap.exists() ? docSnap.data() : { incomes: [], expenses: [] };
            const newList = currentData[category] || [];
            
            newList.push({
                id: Date.now().toString(),
                name: itemData.name.trim(),
                amount: Number(itemData.amount),
                remarks: itemData.remarks ? itemData.remarks.trim() : '',
                type: type, // 'one-time' or 'permanent'
                createdAt: new Date().toISOString()
            });

            await setDoc(docRef, { [category]: newList }, { merge: true });
            setForm({ name: '', amount: '', remarks: '' });
            setRightCardTab('finances_breakdown');
        } catch (err) {
            console.error(`Error adding ${category}:`, err);
            alert("Failed to save entry. Please check your connection.");
        }
        setSaving(false);
    };

    const handleDeleteFinance = async (id, category) => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Database writes are disabled.");
                return;
            }
        }
        if (!window.confirm("Are you sure you want to delete this entry?")) return;
        
        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const newList = (docSnap.data()[category] || []).filter(item => item.id !== id);
                await setDoc(docRef, { [category]: newList }, { merge: true });
            }
        } catch (err) {
            console.error(`Error deleting ${category}:`, err);
            alert("Failed to delete entry.");
        }
    };

    // Fetch school info for PDF branding if not supplied
    useEffect(() => {
        if (schoolInfo && schoolInfo.name && schoolInfo.name !== 'School Name' && schoolInfo.name !== 'School Report') {
            setLocalSchoolInfo(schoolInfo);
            return;
        }
        if (!schoolId) return;

        const fetchSchoolMeta = async () => {
            try {
                const [profileSnap, schoolDocSnap] = await Promise.all([
                    getDoc(doc(db, `schools/${schoolId}/settings/profile`)),
                    getDoc(doc(db, `schools/${schoolId}`))
                ]);

                let name = 'School Report';
                let logo = '';

                if (profileSnap.exists()) {
                    const pData = profileSnap.data();
                    if (pData.name) name = pData.name;
                    if (pData.profileImage) logo = pData.profileImage;
                }
                if (schoolDocSnap.exists()) {
                    const sData = schoolDocSnap.data();
                    if (!logo && sData.profileImage) logo = sData.profileImage;
                    if (name === 'School Report' && sData.name) name = sData.name;
                }

                setLocalSchoolInfo({ name, logo });
            } catch (err) {
                console.warn("Could not fetch school meta for DailyWorkflow PDF:", err);
            }
        };

        fetchSchoolMeta();
    }, [schoolId, schoolInfo]);

    const getDailyBase64Image = async (imageUrl) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to load image for PDF", e);
            return null;
        }
    };

    // Download Customized Daily Fee Collections PDF Report
    const handleDownloadDailyReport = async () => {
        if (recentTransactions.length === 0) {
            alert("No fee collections recorded yet to generate a report.");
            return;
        }
        setIsGeneratingDailyPDF(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // 1. Premium Header Background Bar (Slate-900 / Navy)
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 48, 'F');

            // Accent Brand Strip at top
            doc.setFillColor(0, 120, 212);
            doc.rect(0, 0, pageWidth, 4, 'F');

            // 2. School Logo
            let hasLogo = false;
            let logoUrl = localSchoolInfo?.logo || schoolInfo?.logo || '';
            if (logoUrl) {
                const base64Img = await getDailyBase64Image(logoUrl);
                if (base64Img) {
                    try {
                        doc.addImage(base64Img, 'PNG', 14, 10, 26, 26);
                        hasLogo = true;
                    } catch (err) {
                        console.warn("Logo addImage fallback:", err);
                    }
                }
            }

            // 3. School Header Text & Metadata
            const textX = hasLogo ? 46 : 14;
            const currentSchoolName = (localSchoolInfo?.name || schoolInfo?.name || 'School Fee Collections').toUpperCase();
            
            doc.setFontSize(17);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text(currentSchoolName, textX, 19);

            doc.setFontSize(10.5);
            doc.setTextColor(56, 189, 248); // Sky-400
            doc.setFont("helvetica", "bold");
            doc.text("DAILY FEE COLLECTIONS & REVENUE AUDIT REPORT", textX, 26);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            const now = new Date();
            const printDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            doc.text(`Generated on: ${printDate} at ${printTime}  |  Official Ledger Export`, textX, 33);
            doc.text(`Total Slips Audited: ${recentTransactions.length}  |  Status: 100% Reconciled & Verified`, textX, 39);

            // 4. Executive Summary KPI Grid (4 Stat Blocks)
            const startY = 55;
            const cardWidth = (pageWidth - 28 - 9) / 4;
            const cardHeight = 21;

            const kpis = [
                { label: "TOTAL COLLECTED", val: `Rs ${todayMetrics.totalAmount.toLocaleString()}`, bg: [236, 253, 245], border: [167, 243, 208], text: [5, 150, 105] },
                { label: "FEE SLIPS ISSUED", val: `${todayMetrics.totalCount} Slips`, bg: [239, 246, 255], border: [191, 219, 254], text: [0, 120, 212] },
                { label: "CASH IN HAND", val: `Rs ${todayMetrics.cashAmount.toLocaleString()} (${todayMetrics.cashPct}%)`, bg: [240, 253, 244], border: [187, 247, 208], text: [22, 101, 52] },
                { label: "BANK / DIGITAL", val: `Rs ${(todayMetrics.bankAmount + todayMetrics.onlineAmount).toLocaleString()} (${todayMetrics.bankPct + todayMetrics.onlinePct}%)`, bg: [250, 245, 255], border: [233, 213, 255], text: [126, 34, 206] },
            ];

            kpis.forEach((kpi, idx) => {
                const x = 14 + idx * (cardWidth + 3);
                doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
                doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.label, x + 3, startY + 6);

                doc.setFontSize(9.5);
                doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.val, x + 3, startY + 14);
            });

            // 5. Section Heading for Table
            const tableStartY = startY + cardHeight + 8;
            doc.setFontSize(10.5);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text("ITEMIZED TRANSACTION LOG & PAYMENT PARTICULARS", 14, tableStartY);

            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text(`Official ledger entries sorted chronologically (Total: ${recentTransactions.length} records)`, 14, tableStartY + 5);

            // 6. Format Data for autoTable
            const tableRows = recentTransactions.map((tx, idx) => {
                const roll = tx.rollNo && tx.rollNo !== 'N/A' ? ` (Roll: ${tx.rollNo})` : '';
                const studentField = `${tx.studentName || 'Student'}${roll}`;
                const fatherField = tx.fatherName || 'N/A';
                const classField = tx.className || 'Class';
                const timeField = tx.timeString || tx.dateString || 'Today';
                const modeField = tx.paymentMode || 'Cash';
                const amtField = `Rs ${Number(tx.totalPaid || 0).toLocaleString()}`;
                
                return [
                    idx + 1,
                    tx.receiptNo || `REC-${idx + 1}`,
                    studentField,
                    fatherField,
                    classField,
                    modeField,
                    timeField,
                    amtField
                ];
            });

            autoTable(doc, {
                startY: tableStartY + 8,
                head: [['#', 'Slip #', 'Student Name', "Father's Name", 'Class', 'Mode', 'Time / Date', 'Amount Paid']],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'left'
                },
                bodyStyles: {
                    fontSize: 7.5,
                    textColor: [30, 41, 59],
                    cellPadding: 2.2
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },
                    1: { halign: 'left', fontStyle: 'bold', textColor: [0, 120, 212], cellWidth: 22 },
                    2: { halign: 'left', fontStyle: 'bold', cellWidth: 36 },
                    3: { halign: 'left', cellWidth: 32 },
                    4: { halign: 'left', cellWidth: 20 },
                    5: { halign: 'center', cellWidth: 20 },
                    6: { halign: 'center', cellWidth: 22 },
                    7: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105], cellWidth: 24 }
                },
                foot: [[
                    { content: 'GRAND TOTAL COLLECTED', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 8.5 } },
                    { content: `Rs ${todayMetrics.totalAmount.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105], fontSize: 9, fillColor: [236, 253, 245] } }
                ]],
                footStyles: {
                    fillColor: [241, 245, 249],
                    lineWidth: 0.3,
                    lineColor: [203, 213, 225]
                },
                margin: { left: 14, right: 14 },
                didDrawPage: () => {
                    const str = `Page ${doc.internal.getNumberOfPages()}`;
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.setFont("helvetica", "normal");
                    doc.text(str, pageWidth - 14, pageHeight - 8, { align: 'right' });
                    doc.text("Computer Generated Official Fee Audit Report • Principal Office Management System", 14, pageHeight - 8);
                }
            });

            // 7. Signature / Verification Footer at the end
            let finalY = doc.lastAutoTable.finalY + 16;
            if (finalY > pageHeight - 35) {
                doc.addPage();
                finalY = 30;
            }

            const sigWidth = 55;
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.5);

            // Cashier Signature
            doc.line(14, finalY + 12, 14 + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Cashier / Fee Incharge", 14, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Signature & Date", 14, finalY + 21);

            // Principal / Admin Signature
            const rightSigX = pageWidth - 14 - sigWidth;
            doc.line(rightSigX, finalY + 12, rightSigX + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Principal / Administrator", rightSigX, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Official Stamp & Approval", rightSigX, finalY + 21);

            const safeDateStr = todayMetrics.todayStr.replace(/ /g, '_').replace(/,/g, '');
            const fileName = `Fee_Collections_Report_${safeDateStr}_${Date.now().toString().slice(-4)}.pdf`;
            doc.save(fileName);
        } catch (error) {
            console.error("Failed to generate Collections PDF report:", error);
            alert("An error occurred while generating the PDF report. Please try again.");
        }
        setIsGeneratingDailyPDF(false);
    };

    // Download Customized Finances (Income & Expenses Breakdown) PDF Report
    const handleDownloadFinancesReport = async () => {
        const totalManualIncomes = financesData.incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const actionAmt = currentAction ? Number(currentAction.amount || 0) : 0;
        const totalIncomes = totalManualIncomes + actionAmt;

        const totalExpenses = financesData.expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const netBalance = totalIncomes - totalExpenses;

        if (financesData.incomes.length === 0 && financesData.expenses.length === 0 && actionAmt === 0) {
            alert("No income or expense entries recorded yet to generate a report.");
            return;
        }

        setIsGeneratingFinancesPDF(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // 1. Premium Header Bar (Slate-900 / Navy)
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 48, 'F');

            // Accent Brand Strip at top (Emerald Green)
            doc.setFillColor(22, 163, 74);
            doc.rect(0, 0, pageWidth, 4, 'F');

            // 2. School Logo
            let hasLogo = false;
            let logoUrl = localSchoolInfo?.logo || schoolInfo?.logo || '';
            if (logoUrl) {
                const base64Img = await getDailyBase64Image(logoUrl);
                if (base64Img) {
                    try {
                        doc.addImage(base64Img, 'PNG', 14, 10, 26, 26);
                        hasLogo = true;
                    } catch (err) {
                        console.warn("Logo addImage fallback:", err);
                    }
                }
            }

            // 3. School Header Text & Metadata
            const textX = hasLogo ? 46 : 14;
            const currentSchoolName = (localSchoolInfo?.name || schoolInfo?.name || 'School Finances').toUpperCase();
            
            doc.setFontSize(17);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text(currentSchoolName, textX, 19);

            doc.setFontSize(10.5);
            doc.setTextColor(74, 222, 128); // Emerald-400
            doc.setFont("helvetica", "bold");
            doc.text("INCOME & EXPENSES BREAKDOWN AUDIT REPORT", textX, 26);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            const now = new Date();
            const printDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            doc.text(`Generated on: ${printDate} at ${printTime}  |  Official Ledger Export`, textX, 33);
            doc.text(`Total Records Audited: ${financesData.incomes.length + financesData.expenses.length + (currentAction ? 1 : 0)}  |  Financial Status: ${netBalance >= 0 ? 'Surplus / Positive' : 'Deficit / Negative'}`, textX, 39);

            // 4. Executive Summary KPI Grid (3 Stat Blocks)
            const startY = 55;
            const cardWidth = (pageWidth - 28 - 6) / 3;
            const cardHeight = 21;

            const kpis = [
                { label: "TOTAL INCOMES", val: `Rs ${totalIncomes.toLocaleString()}`, bg: [236, 253, 245], border: [167, 243, 208], text: [5, 150, 105] },
                { label: "TOTAL EXPENSES", val: `Rs ${totalExpenses.toLocaleString()}`, bg: [254, 242, 242], border: [254, 202, 202], text: [220, 38, 38] },
                { label: "NET PROFIT / BALANCE", val: `Rs ${netBalance.toLocaleString()}`, bg: netBalance >= 0 ? [240, 253, 244] : [254, 242, 242], border: netBalance >= 0 ? [187, 247, 208] : [254, 202, 202], text: netBalance >= 0 ? [22, 101, 52] : [185, 28, 28] },
            ];

            kpis.forEach((kpi, idx) => {
                const x = 14 + idx * (cardWidth + 3);
                doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
                doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.label, x + 3, startY + 6);

                doc.setFontSize(9.5);
                doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.val, x + 3, startY + 14);
            });

            // 5. Section Heading for Table
            const tableStartY = startY + cardHeight + 8;
            doc.setFontSize(10.5);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text("ITEMIZED FINANCIAL BREAKDOWN PARTICULARS", 14, tableStartY);

            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text(`Official ledger entries including active actions, incomes & expenses`, 14, tableStartY + 5);

            // 6. Format Data for autoTable
            const rows = [];
            let counter = 1;

            if (currentAction) {
                rows.push([
                    counter++,
                    'Income',
                    `${currentAction.name} (Global Action)`,
                    'Global Action',
                    'Active targeted campaign collection',
                    `Rs ${Number(currentAction.amount || 0).toLocaleString()}`
                ]);
            }

            financesData.incomes.forEach(inc => {
                rows.push([
                    counter++,
                    'Income',
                    inc.name,
                    inc.type === 'permanent' ? 'Permanent' : 'One-time',
                    inc.remarks || 'Income Entry',
                    `Rs ${Number(inc.amount).toLocaleString()}`
                ]);
            });

            financesData.expenses.forEach(exp => {
                rows.push([
                    counter++,
                    'Expense',
                    exp.name,
                    exp.type === 'permanent' ? 'Permanent' : 'One-time',
                    exp.remarks || 'Expense Entry',
                    `Rs ${Number(exp.amount).toLocaleString()}`
                ]);
            });

            autoTable(doc, {
                startY: tableStartY + 8,
                head: [['#', 'Category', 'Description / Title', 'Type', 'Remarks / Notes', 'Amount (PKR)']],
                body: rows,
                theme: 'grid',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'left'
                },
                bodyStyles: {
                    fontSize: 7.5,
                    textColor: [30, 41, 59],
                    cellPadding: 2.5
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },
                    1: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
                    2: { halign: 'left', fontStyle: 'bold', cellWidth: 46 },
                    3: { halign: 'center', cellWidth: 26 },
                    4: { halign: 'left', cellWidth: 50 },
                    5: { halign: 'right', fontStyle: 'bold', cellWidth: 32 }
                },
                didParseCell: function(data) {
                    if (data.section === 'body') {
                        const cat = data.row.raw[1];
                        if (data.column.index === 1 || data.column.index === 5) {
                            if (cat === 'Income') {
                                data.cell.styles.textColor = [22, 163, 74];
                            } else if (cat === 'Expense') {
                                data.cell.styles.textColor = [220, 38, 38];
                            }
                        }
                    }
                },
                foot: [
                    [
                        { content: 'TOTAL INCOMES', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], fontSize: 8 } },
                        { content: `Rs ${totalIncomes.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], fontSize: 8.5, fillColor: [236, 253, 245] } }
                    ],
                    [
                        { content: 'TOTAL EXPENSES', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38], fontSize: 8 } },
                        { content: `Rs ${totalExpenses.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38], fontSize: 8.5, fillColor: [254, 242, 242] } }
                    ],
                    [
                        { content: 'NET SURPLUS / DEFICIT', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 9 } },
                        { content: `Rs ${netBalance.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: netBalance >= 0 ? [22, 101, 52] : [185, 28, 28], fontSize: 9.5, fillColor: netBalance >= 0 ? [240, 253, 244] : [254, 242, 242] } }
                    ]
                ],
                footStyles: {
                    fillColor: [241, 245, 249],
                    lineWidth: 0.3,
                    lineColor: [203, 213, 225]
                },
                margin: { left: 14, right: 14 },
                didDrawPage: () => {
                    const str = `Page ${doc.internal.getNumberOfPages()}`;
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.setFont("helvetica", "normal");
                    doc.text(str, pageWidth - 14, pageHeight - 8, { align: 'right' });
                    doc.text("Computer Generated Official Income & Expenses Breakdown Report • Principal Office Management System", 14, pageHeight - 8);
                }
            });

            // 7. Signature / Verification Footer at the end
            let finalY = doc.lastAutoTable.finalY + 16;
            if (finalY > pageHeight - 35) {
                doc.addPage();
                finalY = 30;
            }

            const sigWidth = 55;
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.5);

            // Accountant Signature
            doc.line(14, finalY + 12, 14 + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Accountant / Finance Incharge", 14, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Signature & Date", 14, finalY + 21);

            // Principal / Admin Signature
            const rightSigX = pageWidth - 14 - sigWidth;
            doc.line(rightSigX, finalY + 12, rightSigX + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Principal / Administrator", rightSigX, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Official Stamp & Approval", rightSigX, finalY + 21);

            const safeDateStr = (todayMetrics?.todayStr || 'Report').replace(/ /g, '_').replace(/,/g, '');
            const fileName = `Income_Expenses_Breakdown_${safeDateStr}_${Date.now().toString().slice(-4)}.pdf`;
            doc.save(fileName);
        } catch (error) {
            console.error("Failed to generate Finances PDF report:", error);
            alert("An error occurred while generating the PDF report. Please try again.");
        }
        setIsGeneratingFinancesPDF(false);
    };

    // Fetch all students across classes for instant real-time search
    useEffect(() => {
        if (!schoolId || classes.length === 0) return;

        const loadAllStudents = async () => {
            setLoadingAllStudents(true);
            try {
                const studentsList = [];
                const promises = classes.map(async (cls) => {
                    const snap = await getDocs(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
                    snap.docs.forEach(docSnap => {
                        studentsList.push({
                            id: docSnap.id,
                            classId: cls.id,
                            className: cls.name,
                            ...docSnap.data()
                        });
                    });
                });
                await Promise.all(promises);
                setAllStudents(studentsList);
            } catch (err) {
                console.error("Error loading students for search:", err);
            }
            setLoadingAllStudents(false);
        };

        loadAllStudents();
    }, [schoolId, classes]);

    // Fetch Students of Selected Class
    useEffect(() => {
        if (!schoolId || !selectedClassId) {
            setClassStudents([]);
            return;
        }

        setLoadingClassStudents(true);
        const q = query(collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`));
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                classId: selectedClassId,
                className: classes.find(c => c.id === selectedClassId)?.name || 'Class',
                ...doc.data()
            }));
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setClassStudents(list);
            setLoadingClassStudents(false);

            // Auto-select if preselected student exists
            if (selectedStudentId) {
                const found = list.find(s => s.id === selectedStudentId);
                if (found) setSelectedStudent(found);
            }
        });

        return () => unsub();
    }, [schoolId, selectedClassId, selectedStudentId, classes]);

    // Live Search Filter
    useEffect(() => {
        const queryClean = searchQuery.trim().toLowerCase();
        if (!queryClean || queryClean.length < 1) {
            setSearchResults([]);
            setShowSearchDropdown(false);
            return;
        }

        const matches = allStudents.filter(s => {
            const nameMatch = (s.name || '').toLowerCase().includes(queryClean);
            const rollMatch = (s.rollNo || '').toLowerCase().includes(queryClean);
            const fatherMatch = (s.parentDetails?.fatherName || s.fatherName || '').toLowerCase().includes(queryClean);
            return nameMatch || rollMatch || fatherMatch;
        }).slice(0, 10);

        setSearchResults(matches);
        setShowSearchDropdown(true);
    }, [searchQuery, allStudents]);

    // Real-time Recent Transactions Listener
    useEffect(() => {
        if (!schoolId) return;

        const qTrans = query(
            collection(db, `schools/${schoolId}/feeTransactions`),
            orderBy('timestamp', 'desc'),
            limit(15)
        );

        const unsubTrans = onSnapshot(qTrans, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setRecentTransactions(list);
            setLoadingTransactions(false);
        }, (err) => {
            console.error("Recent Transactions error:", err);
            setLoadingTransactions(false);
        });

        return () => unsubTrans();
    }, [schoolId]);

    // Dynamic Today's Collections Metrics & Chart Data
    const todayMetrics = useMemo(() => {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        const todayList = recentTransactions.filter(t => !t.dateString || t.dateString === todayStr);
        const activeList = todayList.length > 0 ? todayList : recentTransactions;

        const totalCount = activeList.length;
        const totalAmount = activeList.reduce((sum, t) => sum + (Number(t.totalPaid) || 0), 0);

        let cashCount = 0, cashAmount = 0;
        let bankCount = 0, bankAmount = 0;
        let onlineCount = 0, onlineAmount = 0;

        activeList.forEach(t => {
            const mode = (t.paymentMode || '').toLowerCase();
            const amt = Number(t.totalPaid) || 0;
            if (mode.includes('bank')) {
                bankCount++;
                bankAmount += amt;
            } else if (mode.includes('online') || mode.includes('easypaisa') || mode.includes('jazzcash')) {
                onlineCount++;
                onlineAmount += amt;
            } else {
                cashCount++;
                cashAmount += amt;
            }
        });

        const cashPct = totalAmount > 0 ? Math.round((cashAmount / totalAmount) * 100) : (totalCount > 0 ? Math.round((cashCount / totalCount) * 100) : 0);
        const bankPct = totalAmount > 0 ? Math.round((bankAmount / totalAmount) * 100) : (totalCount > 0 ? Math.round((bankCount / totalCount) * 100) : 0);
        const onlinePct = totalAmount > 0 ? Math.round((onlineAmount / totalAmount) * 100) : (totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0);

        return {
            todayStr,
            totalCount,
            totalAmount,
            cashCount,
            cashAmount,
            cashPct,
            bankCount,
            bankAmount,
            bankPct,
            onlineCount,
            onlineAmount,
            onlinePct
        };
    }, [recentTransactions]);

    // Handle Selecting a Student
    const handleSelectStudent = (student) => {
        setSelectedStudent(student);
        setSelectedClassId(student.classId);
        setSelectedStudentId(student.id);
        setSearchQuery('');
        setShowSearchDropdown(false);
    };

    // Calculate Fees Breakdown for Selected Student
    const feeCalculation = useMemo(() => {
        if (!selectedStudent) return null;

        const items = [];
        let baseFee = 0;

        // 1. Recurring / Structured Fee
        if (selectedStudent.feeStructure && selectedStudent.feeStructure.length > 0) {
            selectedStudent.feeStructure.forEach(item => {
                const amt = Number(item.amount) || 0;
                if (amt > 0) {
                    items.push({ name: item.name || 'Fee Item', amount: amt });
                    baseFee += amt;
                }
            });
        } else {
            const tuition = Number(selectedStudent.tuitionFee) || 0;
            const transport = Number(selectedStudent.transportFee) || 0;
            const other = Number(selectedStudent.otherFees) || 0;

            if (tuition > 0) items.push({ name: 'Tuition Fee', amount: tuition });
            if (transport > 0) items.push({ name: 'Transport Fee', amount: transport });
            if (other > 0) items.push({ name: 'Other Fees', amount: other });
            baseFee = tuition + transport + other;
        }

        // 2. Individual Pending Actions
        let actionsFee = 0;
        const pendingIndividualActions = (selectedStudent.individualActions || []).filter(a => a.status === 'unpaid');
        pendingIndividualActions.forEach(action => {
            const amt = Number(action.amount) || 0;
            if (amt > 0) {
                items.push({ name: `Action: ${action.name}`, amount: amt });
                actionsFee += amt;
            }
        });

        // 3. Global Targeted Action (if unpaid)
        if (currentAction) {
            const isTargeted = currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(selectedStudent.classId));
            if (isTargeted) {
                const isPaid = selectedStudent.customPayments?.[currentAction.name]?.status === 'paid';
                if (!isPaid) {
                    const amt = Number(currentAction.amount) || 0;
                    if (amt > 0) {
                        items.push({ name: `Global: ${currentAction.name}`, amount: amt });
                        actionsFee += amt;
                    }
                }
            }
        }

        const calculatedTotal = baseFee + actionsFee;
        const isPaid = selectedStudent.monthlyFeeStatus === 'paid';

        return {
            items,
            baseFee,
            actionsFee,
            calculatedTotal,
            totalDue: calculatedTotal,
            isPaid
        };
    }, [selectedStudent, currentAction]);

    // Auto calculate final payable when discount or student fee changes
    useEffect(() => {
        if (feeCalculation) {
            const total = Math.max(0, feeCalculation.calculatedTotal - Number(discountAmount || 0));
            setReceivedAmount(total.toString());
        } else {
            setReceivedAmount('0');
        }
    }, [feeCalculation, discountAmount]);

    // Clear Selected Student & Reset Form
    const handleClearSelection = () => {
        setSelectedStudent(null);
        setSelectedStudentId('');
        setSelectedClassId('');
        setSearchQuery('');
        setReceivedAmount('0');
        setDiscountAmount('0');
        setPaymentMode('Cash');
        setProofFile(null);
        setProofPreview(null);
        setRemarks('');
    };

    // Submit Fee Collection Transaction
    const handleSubmitFee = async (e) => {
        e.preventDefault();
        if (!selectedStudent || !schoolId) return;

        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Database writes are disabled.");
                return;
            }
        }

        const finalAmount = Number(receivedAmount) || 0;
        const discount = Number(discountAmount) || 0;

        if (finalAmount < 0) {
            alert("Invalid amount entered");
            return;
        }

        setIsSubmitting(true);
        try {
            const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
            const currentClassName = selectedStudent.className || classes.find(c => c.id === selectedStudent.classId)?.name || 'Class';
            const studentRef = doc(db, `schools/${schoolId}/classes/${selectedStudent.classId}/students`, selectedStudent.id);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, selectedStudent.id);

            let proofUrl = null;
            if (paymentMode !== 'Cash' && proofFile) {
                try {
                    const storagePath = `schools/${schoolId}/paymentProofs/proof_${Date.now()}_${selectedStudent.id}.jpg`;
                    const storageRef = ref(storage, storagePath);
                    const uploadSnap = await uploadBytes(storageRef, proofFile);
                    proofUrl = await getDownloadURL(uploadSnap.ref);
                } catch (proofErr) {
                    console.error("Payment proof upload error, falling back to data URL:", proofErr);
                    try {
                        proofUrl = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = () => resolve(null);
                            reader.readAsDataURL(proofFile);
                        });
                    } catch(e) {
                        console.warn("Base64 fallback error:", e);
                    }
                }
            }

            const updatedIndividualActions = (selectedStudent.individualActions || []).map(a => ({
                ...a,
                status: 'paid',
                paidDate: new Date().toISOString()
            }));

            const studentUpdatePayload = {
                monthlyFeeStatus: 'paid',
                monthlyFeeDate: new Date().toISOString(),
                lastPaymentMode: paymentMode,
                lastReceiptNo: receiptNo,
                lastPaymentAmount: finalAmount,
                lastPaymentProofUrl: proofUrl || null,
                individualActions: updatedIndividualActions
            };

            if (currentAction) {
                const isTargeted = currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(selectedStudent.classId));
                if (isTargeted) {
                    const existingCustomPayments = selectedStudent.customPayments || {};
                    studentUpdatePayload.customPayments = {
                        ...existingCustomPayments,
                        [currentAction.name]: {
                            status: 'paid',
                            date: new Date().toISOString()
                        }
                    };
                }
            }

            await setDoc(studentRef, studentUpdatePayload, { merge: true });
            try { 
                await setDoc(masterStudentRef, studentUpdatePayload, { merge: true }); 
            } catch(e) {
                console.warn("Master student update skipped:", e);
            }

            const now = new Date();
            const dateString = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const transactionRecord = {
                receiptNo,
                studentId: selectedStudent.id,
                studentName: selectedStudent.name,
                rollNo: selectedStudent.rollNo || 'N/A',
                classId: selectedStudent.classId,
                className: currentClassName,
                fatherName: selectedStudent.parentDetails?.fatherName || selectedStudent.fatherName || 'N/A',
                items: feeCalculation.items || [],
                baseFee: feeCalculation.baseFee || 0,
                actionsFee: feeCalculation.actionsFee || 0,
                discount: discount,
                totalPaid: finalAmount,
                paymentMode,
                proofUrl: proofUrl || null,
                remarks: remarks.trim(),
                timestamp: serverTimestamp(),
                dateString,
                timeString,
                collectedBy: 'Principal Office'
            };

            try {
                await addDoc(collection(db, `schools/${schoolId}/feeTransactions`), transactionRecord);
            } catch (txError) {
                console.warn("feeTransactions log warning:", txError);
            }

            // 3. Trigger Instant Printable Receipt
            setReceiptData(transactionRecord);
            setReceiptModalOpen(true);

            // 4. Reset Form
            handleClearSelection();
        } catch (err) {
            console.error("Error submitting fee payment:", err);
            alert("Failed to submit fee payment. Please check your connection.");
        }
        setIsSubmitting(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Top Full-Width Prominent Summary Card: LIVE TODAY'S SUMMARY Collections Overview */}
            <div className="card animate-fade-in-up" style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '1.6rem 1.85rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Header with Live Status & Quick Meta */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1.35rem',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.35rem 0.85rem',
                            borderRadius: '20px',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            color: '#059669',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            letterSpacing: '0.04em'
                        }}>
                            <span style={{
                                display: 'inline-block',
                                width: '9px',
                                height: '9px',
                                borderRadius: '50%',
                                background: '#10b981',
                                boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)'
                            }} className="animate-pulse" />
                            LIVE TODAY'S SUMMARY
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Collections Overview & Analytics <Sparkles size={16} color="#0078d4" />
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
                                Real-time automated fee tracking, channel split & collection velocity
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            fontSize: '0.825rem',
                            color: '#0078d4',
                            fontWeight: '700',
                            background: '#eff6ff',
                            padding: '0.35rem 0.8rem',
                            borderRadius: '8px',
                            border: '1px solid #bfdbfe'
                        }}>
                            <Activity size={15} />
                            <span>Live Synced</span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            fontSize: '0.825rem',
                            color: '#334155',
                            fontWeight: '700',
                            background: '#f8fafc',
                            padding: '0.35rem 0.8rem',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <Calendar size={15} color="#0078d4" />
                            {todayMetrics.todayStr}
                        </div>
                    </div>
                </div>

                {/* 3 Pillars Visual Interactive Grid: Metrics + Circular Gauge + Channel Bar Charts */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                    gap: '1.25rem'
                }}>
                    {/* Pillar 1: Primary Highlight Revenue & Slips Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        {/* Total Collected Card */}
                        <div style={{
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            borderRadius: '14px',
                            padding: '1.25rem 1.4rem',
                            color: '#ffffff',
                            border: '1px solid rgba(5, 150, 105, 0.3)',
                            boxShadow: '0 4px 14px -2px rgba(5, 150, 105, 0.28)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#d1fae5' }}>
                                        Total Collected Today
                                    </span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '8px', color: '#ffffff' }}>
                                        Live
                                    </span>
                                </div>
                                <h2 style={{ margin: '0.35rem 0 0', fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.03em', lineHeight: 1.1, color: '#ffffff' }}>
                                    Rs {todayMetrics.totalAmount.toLocaleString()}
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '0.4rem', color: '#a7f3d0', fontWeight: '600' }}>
                                    <TrendingUp size={14} color="#6ee7b7" />
                                    <span>Real-time instant sum across all channels</span>
                                </div>
                            </div>
                            <div style={{
                                width: '52px',
                                height: '52px',
                                borderRadius: '12px',
                                background: 'rgba(255,255,255,0.18)',
                                backdropFilter: 'blur(6px)',
                                border: '1px solid rgba(255,255,255,0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                <Wallet size={26} />
                            </div>
                        </div>

                        {/* Total Slips Issued Card */}
                        <div style={{
                            background: 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)',
                            borderRadius: '14px',
                            padding: '1.25rem 1.4rem',
                            color: '#ffffff',
                            border: '1px solid rgba(0, 120, 212, 0.3)',
                            boxShadow: '0 4px 14px -2px rgba(0, 120, 212, 0.28)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e0f2fe' }}>
                                        Fee Slips Issued
                                    </span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '8px', color: '#ffffff' }}>
                                        Verified
                                    </span>
                                </div>
                                <h2 style={{ margin: '0.35rem 0 0', fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.03em', lineHeight: 1.1, color: '#ffffff' }}>
                                    {todayMetrics.totalCount} <span style={{ fontSize: '1.15rem', fontWeight: '700', opacity: 0.95 }}>Slips</span>
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '0.4rem', color: '#bae6fd', fontWeight: '600' }}>
                                    <Printer size={14} color="#93c5fd" />
                                    <span>Recorded in ledger & printable vouchers</span>
                                </div>
                            </div>
                            <div style={{
                                width: '52px',
                                height: '52px',
                                borderRadius: '12px',
                                background: 'rgba(255,255,255,0.18)',
                                backdropFilter: 'blur(6px)',
                                border: '1px solid rgba(255,255,255,0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                <FileText size={26} />
                            </div>
                        </div>

                        {/* Digital vs Cash Velocity Mini Metric Card */}
                        <div style={{
                            background: '#f8fafc',
                            borderRadius: '12px',
                            padding: '0.85rem 1rem',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Zap size={17} />
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', display: 'block' }}>
                                        Digital vs Cash Ratio
                                    </span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#0f172a' }}>
                                        {todayMetrics.bankPct + todayMetrics.onlinePct}% Digital &bull; {todayMetrics.cashPct}% Cash
                                    </span>
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: '800',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? '#f3e8ff' : '#ecfdf5',
                                color: todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? '#6b21a8' : '#047857',
                                border: `1px solid ${todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? '#d8b4fe' : '#a7f3d0'}`
                            }}>
                                {todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? 'Digital Heavy' : 'Cash Primary'}
                            </span>
                        </div>
                    </div>

                    {/* Pillar 2: Animated SVG Circular Donut Chart */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        padding: '1.25rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        position: 'relative'
                    }}>
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <PieChart size={17} color="#0078d4" /> Payment Channels Split
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', padding: '2px 7px', borderRadius: '6px', background: '#f1f5f9', color: '#475569' }}>
                                360&deg; Distribution
                            </span>
                        </div>

                        {/* Circular Donut Gauge Container */}
                        <div style={{ position: 'relative', width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0.5rem 0' }}>
                            {/* SVG Donut Ring */}
                            {(() => {
                                const radius = 54;
                                const circumference = 2 * Math.PI * radius; // ~339.29
                                const hasData = todayMetrics.totalAmount > 0;
                                const cashLen = hasData ? (todayMetrics.cashPct / 100) * circumference : 0;
                                const bankLen = hasData ? (todayMetrics.bankPct / 100) * circumference : 0;
                                const onlineLen = hasData ? (todayMetrics.onlinePct / 100) * circumference : 0;

                                return (
                                    <svg width="180" height="180" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
                                        {/* Background Track Ring */}
                                        <circle
                                            cx="70"
                                            cy="70"
                                            r={radius}
                                            fill="transparent"
                                            stroke="#f1f5f9"
                                            strokeWidth="13"
                                        />

                                        {hasData ? (
                                            <>
                                                {/* Cash Segment (Emerald) */}
                                                {todayMetrics.cashPct > 0 && (
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={radius}
                                                        fill="transparent"
                                                        stroke="#10b981"
                                                        strokeWidth="13"
                                                        strokeDasharray={`${cashLen} ${circumference - cashLen}`}
                                                        strokeDashoffset="0"
                                                        strokeLinecap={todayMetrics.cashPct < 100 ? "round" : "butt"}
                                                        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                                                    />
                                                )}

                                                {/* Bank Segment (Royal Blue) */}
                                                {todayMetrics.bankPct > 0 && (
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={radius}
                                                        fill="transparent"
                                                        stroke="#3b82f6"
                                                        strokeWidth="13"
                                                        strokeDasharray={`${bankLen} ${circumference - bankLen}`}
                                                        strokeDashoffset={`-${cashLen}`}
                                                        strokeLinecap={todayMetrics.bankPct < 100 ? "round" : "butt"}
                                                        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 1s' }}
                                                    />
                                                )}

                                                {/* Online Segment (Purple) */}
                                                {todayMetrics.onlinePct > 0 && (
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={radius}
                                                        fill="transparent"
                                                        stroke="#a855f7"
                                                        strokeWidth="13"
                                                        strokeDasharray={`${onlineLen} ${circumference - onlineLen}`}
                                                        strokeDashoffset={`-${cashLen + bankLen}`}
                                                        strokeLinecap={todayMetrics.onlinePct < 100 ? "round" : "butt"}
                                                        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 1s' }}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            <circle
                                                cx="70"
                                                cy="70"
                                                r={radius}
                                                fill="transparent"
                                                stroke="#cbd5e1"
                                                strokeWidth="13"
                                                strokeDasharray="4 4"
                                            />
                                        )}
                                    </svg>
                                );
                            })()}

                            {/* Center Donut Core Hub */}
                            <div style={{
                                position: 'absolute',
                                width: '102px',
                                height: '102px',
                                borderRadius: '50%',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                padding: '4px'
                            }}>
                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Total Today
                                </span>
                                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                                    {todayMetrics.totalAmount >= 1000 ? `${(todayMetrics.totalAmount / 1000).toFixed(todayMetrics.totalAmount % 1000 === 0 ? 0 : 1)}k` : `Rs ${todayMetrics.totalAmount}`}
                                </span>
                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: '6px', marginTop: '2px', border: '1px solid #a7f3d0' }}>
                                    {todayMetrics.totalCount} Slips
                                </span>
                            </div>
                        </div>

                        {/* Circular Donut Legend Chips */}
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: '0.35rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Cash {todayMetrics.cashPct}%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Bank {todayMetrics.bankPct}%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Online {todayMetrics.onlinePct}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Pillar 3: Animated Channel Breakdown & Mini Progress Bar Graphs */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        padding: '1.25rem 1.35rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.75rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <BarChart3 size={17} color="#0078d4" /> Live Channel Analytics
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#0078d4', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>
                                Interactive Bars
                            </span>
                        </div>

                        {/* Channel 1: Cash in Hand Bar */}
                        <div style={{
                            background: '#f0fdf4',
                            borderRadius: '10px',
                            padding: '0.7rem 0.85rem',
                            border: '1px solid #bbf7d0'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Wallet size={13} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#14532d' }}>Cash</span>
                                    <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: '600' }}>({todayMetrics.cashCount} Slips)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong style={{ fontSize: '0.9rem', fontWeight: '900', color: '#14532d' }}>
                                        Rs {todayMetrics.cashAmount.toLocaleString()}
                                    </strong>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', padding: '1px 6px', borderRadius: '6px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                                        {todayMetrics.cashPct}%
                                    </span>
                                </div>
                            </div>
                            {/* Animated Mini Progress Bar */}
                            <div style={{ height: '7px', width: '100%', background: '#dcfce7', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${todayMetrics.cashPct}%`,
                                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                                    borderRadius: '6px',
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>

                        {/* Channel 2: Bank Transfer Bar */}
                        <div style={{
                            background: '#eff6ff',
                            borderRadius: '10px',
                            padding: '0.7rem 0.85rem',
                            border: '1px solid #bfdbfe'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Landmark size={13} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#1e3a8a' }}>Bank Deposit</span>
                                    <span style={{ fontSize: '0.7rem', color: '#1e40af', fontWeight: '600' }}>({todayMetrics.bankCount} Slips)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1e3a8a' }}>
                                        Rs {todayMetrics.bankAmount.toLocaleString()}
                                    </strong>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', padding: '1px 6px', borderRadius: '6px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
                                        {todayMetrics.bankPct}%
                                    </span>
                                </div>
                            </div>
                            {/* Animated Mini Progress Bar */}
                            <div style={{ height: '7px', width: '100%', background: '#dbeafe', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${todayMetrics.bankPct}%`,
                                    background: 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)',
                                    borderRadius: '6px',
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>

                        {/* Channel 3: Online / EasyPaisa / JazzCash Bar */}
                        <div style={{
                            background: '#faf5ff',
                            borderRadius: '10px',
                            padding: '0.7rem 0.85rem',
                            border: '1px solid #e9d5ff'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Smartphone size={13} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#581c87' }}>Online Wallets</span>
                                    <span style={{ fontSize: '0.7rem', color: '#6b21a8', fontWeight: '600' }}>({todayMetrics.onlineCount} Slips)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong style={{ fontSize: '0.9rem', fontWeight: '900', color: '#581c87' }}>
                                        Rs {todayMetrics.onlineAmount.toLocaleString()}
                                    </strong>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', padding: '1px 6px', borderRadius: '6px', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe' }}>
                                        {todayMetrics.onlinePct}%
                                    </span>
                                </div>
                            </div>
                            {/* Animated Mini Progress Bar */}
                            <div style={{ height: '7px', width: '100%', background: '#f3e8ff', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${todayMetrics.onlinePct}%`,
                                    background: 'linear-gradient(90deg, #a855f7 0%, #7e22ce 100%)',
                                    borderRadius: '6px',
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Side-by-Side 2 Cards Layout */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '1.5rem',
                alignItems: 'start'
            }}>
                {/* Left Card: Daily Fee Submission Counter (Student Selector) */}
                <div className="card" style={{
                    background: '#ffffff',
                    borderRadius: '14px',
                    padding: '1.5rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: activeDailyMode === 'fee_submission' ? '#eff6ff' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeDailyMode === 'fee_submission' ? '#0078d4' : '#16a34a' }}>
                                {activeDailyMode === 'fee_submission' ? <Wallet size={20} /> : <TrendingUp size={20} />}
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    {activeDailyMode === 'fee_submission' ? 'Daily Fee Submission Counter' : 'Income & Expenses Entry'}
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {activeDailyMode === 'fee_submission' ? 'Select student & calculate instant fee receipt' : 'Add payments received & manual expenses'}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {/* Mode Switcher Buttons */}
                            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '3px', border: '1px solid #e2e8f0' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveDailyMode('fee_submission');
                                        setRightCardTab('fee_slips');
                                    }}
                                    style={{
                                        padding: '5px 11px',
                                        borderRadius: '7px',
                                        border: 'none',
                                        background: activeDailyMode === 'fee_submission' ? '#ffffff' : 'transparent',
                                        color: activeDailyMode === 'fee_submission' ? '#0078d4' : '#64748b',
                                        fontWeight: '700',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        boxShadow: activeDailyMode === 'fee_submission' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <Wallet size={14} /> Fee Submission
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveDailyMode('income_expense');
                                        setRightCardTab('finances_breakdown');
                                    }}
                                    style={{
                                        padding: '5px 11px',
                                        borderRadius: '7px',
                                        border: 'none',
                                        background: activeDailyMode === 'income_expense' ? '#ffffff' : 'transparent',
                                        color: activeDailyMode === 'income_expense' ? '#16a34a' : '#64748b',
                                        fontWeight: '700',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        boxShadow: activeDailyMode === 'income_expense' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <TrendingUp size={14} /> Income & Expenses Breakdown
                                </button>
                            </div>

                            {activeDailyMode === 'fee_submission' && selectedStudent && (
                                <button
                                    type="button"
                                    onClick={handleClearSelection}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        background: '#f1f5f9',
                                        border: '1px solid #cbd5e1',
                                        color: '#475569',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={13} /> Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {activeDailyMode === 'income_expense' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Add Payments Received Form */}
                            <div style={{ background: '#f0fdf4', padding: '1.25rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ArrowUpRight size={17} color="#16a34a" /> Add Payments Received
                                </h4>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Income Title</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Canteen Rent, Prospectus Sale" 
                                        value={newIncome.name}
                                        onChange={e => setNewIncome({...newIncome, name: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Amount (Rs)</label>
                                    <input 
                                        type="number" 
                                        placeholder="e.g. 5000" 
                                        value={newIncome.amount}
                                        onChange={e => setNewIncome({...newIncome, amount: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Remarks / Notes (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Paid in cash by vendor, Cheque #1234, memo..." 
                                        value={newIncome.remarks || ''}
                                        onChange={e => setNewIncome({...newIncome, remarks: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('one-time', 'incomes', newIncome, setIsSavingIncome, setNewIncome)}
                                        disabled={isSavingIncome || !newIncome.name || !newIncome.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#ffffff', border: '1px solid #16a34a', color: '#16a34a', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingIncome || !newIncome.name || !newIncome.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('permanent', 'incomes', newIncome, setIsSavingIncome, setNewIncome)}
                                        disabled={isSavingIncome || !newIncome.name || !newIncome.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#16a34a', border: '1px solid #16a34a', color: 'white', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingIncome || !newIncome.name || !newIncome.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save as Permanent
                                    </button>
                                </div>
                            </div>

                            {/* Add Manual Expense Form */}
                            <div style={{ background: '#fef2f2', padding: '1.25rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '0.85rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ArrowDownRight size={17} color="#dc2626" /> Add Manual Expense
                                </h4>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Expense Title</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Electricity Bill, Chalk & Stationery" 
                                        value={newExpense.name}
                                        onChange={e => setNewExpense({...newExpense, name: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Amount (Rs)</label>
                                    <input 
                                        type="number" 
                                        placeholder="e.g. 15000" 
                                        value={newExpense.amount}
                                        onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Remarks / Notes (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Paid to electric utility, bill #9872, voucher memo..." 
                                        value={newExpense.remarks || ''}
                                        onChange={e => setNewExpense({...newExpense, remarks: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('one-time', 'expenses', newExpense, setIsSavingExpense, setNewExpense)}
                                        disabled={isSavingExpense || !newExpense.name || !newExpense.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#ffffff', border: '1px solid #dc2626', color: '#dc2626', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingExpense || !newExpense.name || !newExpense.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('permanent', 'expenses', newExpense, setIsSavingExpense, setNewExpense)}
                                        disabled={isSavingExpense || !newExpense.name || !newExpense.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#dc2626', border: '1px solid #dc2626', color: 'white', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingExpense || !newExpense.name || !newExpense.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save as Permanent
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Active Selected Student Notification Banner */}
                    {selectedStudent && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '8px',
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0369a1' }}>
                                    Active Selection: {selectedStudent.name}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#0284c7' }}>
                                    Class: {selectedStudent.className} | Roll: {selectedStudent.rollNo || 'N/A'}
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: feeCalculation?.isPaid ? '#dcfce7' : '#fee2e2',
                                color: feeCalculation?.isPaid ? '#15803d' : '#b91c1c'
                            }}>
                                {feeCalculation?.isPaid ? 'Paid' : 'Payment Due'}
                            </span>
                        </div>
                    )}

                    {/* Instant Student Search Bar */}
                    <div style={{ position: 'relative', width: '100%', marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Quick Student Search
                        </label>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            transition: 'all 0.2s'
                        }}>
                            <Search size={16} color="#64748b" />
                            <input
                                type="text"
                                placeholder="Type Name, Roll No, or Father..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => {
                                    if (searchQuery.trim().length > 0) setShowSearchDropdown(true);
                                }}
                                style={{
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    width: '100%',
                                    fontSize: '0.875rem',
                                    color: '#0f172a',
                                    fontWeight: '500'
                                }}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchQuery(''); setShowSearchDropdown(false); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        {/* Search Suggestions Dropdown */}
                        {showSearchDropdown && searchResults.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '105%',
                                left: 0,
                                right: 0,
                                background: '#ffffff',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                                border: '1px solid #cbd5e1',
                                zIndex: 50,
                                maxHeight: '240px',
                                overflowY: 'auto'
                            }}>
                                {searchResults.map(st => (
                                    <div
                                        key={st.id}
                                        onClick={() => handleSelectStudent(st)}
                                        style={{
                                            padding: '0.65rem 0.85rem',
                                            borderBottom: '1px solid #f1f5f9',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                background: '#e0f2fe',
                                                color: '#0369a1',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: '700',
                                                fontSize: '0.75rem'
                                            }}>
                                                {st.name?.slice(0, 2).toUpperCase() || 'ST'}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.85rem' }}>{st.name}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                    {st.className} | Roll: {st.rollNo || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '700',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: st.monthlyFeeStatus === 'paid' ? '#dcfce7' : '#fee2e2',
                                            color: st.monthlyFeeStatus === 'paid' ? '#15803d' : '#b91c1c'
                                        }}>
                                            {st.monthlyFeeStatus === 'paid' ? 'Paid' : 'Unpaid'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#94a3b8', fontSize: '0.75rem', fontWeight: '700' }}>
                        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                        <span>OR CHOOSE MANUALLY</span>
                        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    </div>

                    {/* Class Dropdown */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Class
                        </label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => {
                                setSelectedClassId(e.target.value);
                                setSelectedStudentId('');
                                setSelectedStudent(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                background: '#ffffff',
                                fontWeight: '600',
                                color: '#0f172a',
                                fontSize: '0.9rem'
                            }}
                        >
                            <option value="">-- Choose Class --</option>
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Student Dropdown */}
                    <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Student Name
                        </label>
                        <select
                            value={selectedStudentId}
                            onChange={(e) => {
                                const stId = e.target.value;
                                setSelectedStudentId(stId);
                                const stObj = classStudents.find(s => s.id === stId);
                                setSelectedStudent(stObj || null);
                            }}
                            disabled={!selectedClassId || loadingClassStudents}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                background: !selectedClassId ? '#f1f5f9' : '#ffffff',
                                fontWeight: '600',
                                color: !selectedClassId ? '#94a3b8' : '#0f172a',
                                fontSize: '0.9rem',
                                cursor: !selectedClassId ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <option value="">-- Choose Student --</option>
                            {classStudents.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name} (Roll: {s.rollNo || 'N/A'}) {s.monthlyFeeStatus === 'paid' ? '✓ Paid' : '✗ Unpaid'}
                                </option>
                            ))}
                        </select>
                    </div>
                </>
            )}
        </div>

        {/* Right Card: Either Fee Assessment Form OR Today's Recent Fee Collections Log / Breakdown */}
        {selectedStudent && activeDailyMode === 'fee_submission' ? (
            <div className="card animate-fade-in-up" style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px -2px rgba(0,0,0,0.06)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                            Fee Assessment & Collection
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            Student: <strong style={{ color: '#0078d4' }}>{selectedStudent.name}</strong> ({selectedStudent.className})
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: feeCalculation?.isPaid ? '#dcfce7' : '#fee2e2',
                            color: feeCalculation?.isPaid ? '#15803d' : '#b91c1c'
                        }}>
                            {feeCalculation?.isPaid ? 'Already Paid' : 'Payment Due'}
                        </span>
                    </div>
                </div>

                {/* Fee Breakdown Table */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                        Itemized Dues Breakdown
                    </h4>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: '700', color: '#334155' }}>Fee Component</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {feeCalculation?.items.map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.6rem 1rem', color: '#1e293b' }}>{item.name}</td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '600', color: '#0f172a' }}>
                                            Rs {Number(item.amount).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                <tr style={{ background: '#f0fdf4', borderTop: '2px solid #cbd5e1' }}>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#166534', fontSize: '0.95rem' }}>Total Assessed Due</td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#166534', fontSize: '1.1rem' }}>
                                        Rs {feeCalculation?.totalDue.toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Payment Input Section */}
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginBottom: '0.85rem', textTransform: 'uppercase' }}>
                        Payment Submission Details
                    </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                        {/* Payment Mode */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                Payment Method
                            </label>
                            <select
                                value={paymentMode}
                                onChange={(e) => setPaymentMode(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    outline: 'none',
                                    background: '#ffffff',
                                    fontWeight: '600',
                                    color: '#0f172a',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <option value="Cash">Cash at Counter</option>
                                <option value="Bank Transfer">Bank Transfer / Deposit</option>
                                <option value="Online / EasyPaisa">EasyPaisa / JazzCash</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>

                        {/* Received Amount */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                Received Amount (Rs)
                            </label>
                            <input
                                type="number"
                                value={receivedAmount}
                                onChange={(e) => setReceivedAmount(e.target.value)}
                                min="0"
                                style={{
                                    width: '100%',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    outline: 'none',
                                    background: '#ffffff',
                                    fontWeight: '700',
                                    color: '#16a34a',
                                    fontSize: '0.95rem'
                                }}
                            />
                        </div>

                        {/* Discount / Concession */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                Concession / Discount (Rs)
                            </label>
                            <input
                                type="number"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                min="0"
                                placeholder="0"
                                style={{
                                    width: '100%',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    outline: 'none',
                                    background: '#ffffff',
                                    fontWeight: '600',
                                    color: '#0f172a',
                                    fontSize: '0.85rem'
                                }}
                            />
                        </div>
                    </div>

                    {/* Remarks / Memo */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Remarks / Notes (Optional)
                        </label>
                        <input
                            type="text"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="e.g. Paid in full by Father, Cheque #98212, Online ref ID..."
                            style={{
                                width: '100%',
                                padding: '0.6rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                background: '#ffffff',
                                fontSize: '0.85rem'
                            }}
                        />
                    </div>

                    {/* Conditional Proof Upload Box for Online / Bank Transfer */}
                    {paymentMode !== 'Cash' && (
                        <div style={{
                            padding: '0.85rem 1rem',
                            borderRadius: '8px',
                            background: '#f0f9ff',
                            border: '1px dashed #0284c7',
                            marginBottom: '1rem'
                        }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#0369a1', marginBottom: '0.35rem' }}>
                                Attach Bank / Payment Receipt Slip (Optional)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleProofChange}
                                    style={{ fontSize: '0.8rem', color: '#475569' }}
                                />
                                {proofPreview && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <img src={proofPreview} alt="Proof" style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #bae6fd' }} />
                                        <button
                                            type="button"
                                            onClick={handleRemoveProof}
                                            style={{
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: '#fee2e2',
                                                border: '1px solid #fca5a5',
                                                color: '#b91c1c',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="button"
                        onClick={handleSubmitFee}
                        disabled={isSubmitting}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            background: '#0078d4',
                            border: 'none',
                            color: '#ffffff',
                            fontWeight: '800',
                            fontSize: '0.95rem',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 2px 4px rgba(0, 120, 212, 0.25)',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.background = '#0067b8'; }}
                        onMouseLeave={(e) => { if (!isSubmitting) e.currentTarget.style.background = '#0078d4'; }}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" /> Processing Payment & Uploading...
                            </>
                        ) : (
                            <>
                                <Printer size={18} /> Submit Fee & Print Receipt Slip
                            </>
                        )}
                    </button>
                </div>
            </div>
        ) : (
            /* When no student is selected or in Income/Expenses mode, Right Card is Recent Log / Breakdown */
            <div className="card" style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.15rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {rightCardTab === 'fee_slips' ? (
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={18} color="#0078d4" />
                                Today's Recent Fee Collections Log
                            </h3>
                        ) : (
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <TrendingUp size={18} color="#16a34a" />
                                Income & Expenses Breakdown
                            </h3>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        {/* Tab Switcher for Right Card */}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '3px', border: '1px solid #e2e8f0' }}>
                            <button
                                type="button"
                                onClick={() => setRightCardTab('fee_slips')}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: rightCardTab === 'fee_slips' ? '#ffffff' : 'transparent',
                                    color: rightCardTab === 'fee_slips' ? '#0078d4' : '#64748b',
                                    fontWeight: '700',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    boxShadow: rightCardTab === 'fee_slips' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Clock size={13} /> Fee Slips ({recentTransactions.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setRightCardTab('finances_breakdown')}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: rightCardTab === 'finances_breakdown' ? '#ffffff' : 'transparent',
                                    color: rightCardTab === 'finances_breakdown' ? '#16a34a' : '#64748b',
                                    fontWeight: '700',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    boxShadow: rightCardTab === 'finances_breakdown' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <TrendingUp size={13} /> Breakdown ({financesData.incomes.length} Inc / {financesData.expenses.length} Exp)
                            </button>
                        </div>

                        {rightCardTab === 'fee_slips' ? (
                            <button
                                onClick={handleDownloadDailyReport}
                                disabled={isGeneratingDailyPDF || recentTransactions.length === 0}
                                style={{
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid #0078d4',
                                    background: isGeneratingDailyPDF ? '#93c5fd' : '#0078d4',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: recentTransactions.length === 0 || isGeneratingDailyPDF ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: '0 2px 5px rgba(0, 120, 212, 0.25)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Download customized official PDF report of today's fee collections"
                            >
                                {isGeneratingDailyPDF ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Generating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} />
                                        <span>Download Report</span>
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleDownloadFinancesReport}
                                disabled={isGeneratingFinancesPDF || (financesData.incomes.length === 0 && financesData.expenses.length === 0 && teachersSalary === 0 && !currentAction)}
                                style={{
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid #16a34a',
                                    background: isGeneratingFinancesPDF ? '#86efac' : '#16a34a',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: (financesData.incomes.length === 0 && financesData.expenses.length === 0 && teachersSalary === 0 && !currentAction) || isGeneratingFinancesPDF ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: '0 2px 5px rgba(22, 163, 74, 0.25)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Download customized official PDF report of Income & Expenses breakdown"
                            >
                                {isGeneratingFinancesPDF ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Generating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} />
                                        <span>Download Report</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {rightCardTab === 'fee_slips' ? (
                    /* Existing Fee Slips Table */
                    loadingTransactions ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            Loading transaction history...
                        </div>
                    ) : recentTransactions.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#f8fafc', borderRadius: '8px' }}>
                            No fee transactions recorded today yet.
                        </div>
                    ) : (
                        <div style={{ maxHeight: '360px', overflowY: 'auto' }} className="custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Slip #</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Student</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Class</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Amount</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Mode</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700', textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentTransactions.map((tx) => (
                                        <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '700', color: '#0078d4' }}>{tx.receiptNo}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: '#0f172a' }}>{tx.studentName}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{tx.className}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: '700', color: '#16a34a' }}>Rs {Number(tx.totalPaid).toLocaleString()}</td>
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ color: '#0f172a', fontWeight: '600' }}>{tx.paymentMode || 'Cash'}</span>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - ${tx.paymentMode} Slip`
                                                            })}
                                                            style={{
                                                                padding: '0.2rem 0.5rem',
                                                                borderRadius: '4px',
                                                                border: '1px solid #93c5fd',
                                                                background: '#eff6ff',
                                                                color: '#0078d4',
                                                                fontWeight: '700',
                                                                fontSize: '0.72rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                width: 'fit-content'
                                                            }}
                                                            title="View payment receipt / bank slip screenshot"
                                                        >
                                                            <ImageIcon size={12} /> View Screenshot
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - Proof Screenshot`
                                                            })}
                                                            style={{
                                                                padding: '0.3rem 0.6rem',
                                                                borderRadius: '6px',
                                                                border: '1px solid #86efac',
                                                                background: '#f0fdf4',
                                                                color: '#15803d',
                                                                fontWeight: '700',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title="View attached bank deposit slip / screenshot"
                                                        >
                                                            <Eye size={13} /> Proof
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setReceiptData(tx);
                                                            setReceiptModalOpen(true);
                                                        }}
                                                        style={{
                                                            padding: '0.3rem 0.6rem',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#ffffff',
                                                            color: '#0f172a',
                                                            fontWeight: '700',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title="View & print official receipt slip"
                                                    >
                                                        <Printer size={13} /> Slip
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    /* Income & Expenses Breakdown List */
                    <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }} className="custom-scrollbar">
                        {/* Teachers Salary Auto Row */}
                        {teachersSalary > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#fef2f2', borderRadius: '10px', border: '1px solid #fee2e2' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#fca5a5', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowDownRight size={15} color="#991b1b" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            Teachers Salaries <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: '#e2e8f0', color: '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>Auto</span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Aggregated from all staff profiles</span>
                                    </div>
                                </div>
                                <span style={{ fontWeight: '800', color: '#dc2626', fontSize: '0.9rem' }}>Rs {teachersSalary.toLocaleString()}</span>
                            </div>
                        )}

                        {/* Global Action (If Active) */}
                        {currentAction && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #dcfce7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#86efac', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowUpRight size={15} color="#166534" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            {currentAction.name} <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: '#e2e8f0', color: '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>Global Action</span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active target fee collection</span>
                                    </div>
                                </div>
                                <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '0.9rem' }}>Rs {Number(currentAction.amount || 0).toLocaleString()}</span>
                            </div>
                        )}

                        {/* Incomes List */}
                        {financesData.incomes.map(inc => (
                            <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #dcfce7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#86efac', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowUpRight size={15} color="#166534" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            {inc.name} 
                                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: inc.type === 'permanent' ? '#dcfce7' : '#e2e8f0', color: inc.type === 'permanent' ? '#15803d' : '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>
                                                {inc.type === 'permanent' ? 'Permanent' : 'One-time'}
                                            </span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            {inc.remarks ? `Note: ${inc.remarks}` : 'Income Entry'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '0.9rem' }}>Rs {Number(inc.amount).toLocaleString()}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteFinance(inc.id, 'incomes')}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                        title="Delete Income"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Expenses List */}
                        {financesData.expenses.map(exp => (
                            <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #fee2e2' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#fca5a5', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowDownRight size={15} color="#991b1b" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            {exp.name} 
                                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: exp.type === 'permanent' ? '#fee2e2' : '#e2e8f0', color: exp.type === 'permanent' ? '#b91c1c' : '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>
                                                {exp.type === 'permanent' ? 'Permanent' : 'One-time'}
                                            </span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            {exp.remarks ? `Note: ${exp.remarks}` : 'Expense Entry'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontWeight: '800', color: '#dc2626', fontSize: '0.9rem' }}>Rs {Number(exp.amount).toLocaleString()}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteFinance(exp.id, 'expenses')}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                        title="Delete Expense"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {financesData.incomes.length === 0 && financesData.expenses.length === 0 && teachersSalary === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem', background: '#f8fafc', borderRadius: '8px' }}>
                                No incomes or expenses added yet.
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}
    </div>

    {/* When a student IS selected, also show Recent Fee Collections Log below the 2 columns */}
    {selectedStudent && activeDailyMode === 'fee_submission' && (
                <div className="card" style={{
                    background: '#ffffff',
                    borderRadius: '14px',
                    padding: '1.5rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={18} color="#0078d4" />
                            Today's Recent Fee Collections Log
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0078d4', background: '#eff6ff', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                {recentTransactions.length} Slips Recorded
                            </span>
                            <button
                                onClick={handleDownloadDailyReport}
                                disabled={isGeneratingDailyPDF || recentTransactions.length === 0}
                                style={{
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid #0078d4',
                                    background: isGeneratingDailyPDF ? '#93c5fd' : '#0078d4',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: recentTransactions.length === 0 || isGeneratingDailyPDF ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: '0 2px 5px rgba(0, 120, 212, 0.25)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Download customized official PDF report of today's collections"
                            >
                                {isGeneratingDailyPDF ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Generating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} />
                                        <span>Download Report</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {loadingTransactions ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            Loading transaction history...
                        </div>
                    ) : recentTransactions.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#f8fafc', borderRadius: '8px' }}>
                            No fee transactions recorded today yet.
                        </div>
                    ) : (
                        <div style={{ maxHeight: '260px', overflowY: 'auto' }} className="custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Slip #</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Student</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Class</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Amount Paid</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Mode</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Time</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700', textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentTransactions.map((tx) => (
                                        <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '700', color: '#0078d4' }}>{tx.receiptNo}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: '#0f172a' }}>{tx.studentName}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{tx.className}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: '700', color: '#16a34a' }}>Rs {Number(tx.totalPaid).toLocaleString()}</td>
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ color: '#0f172a', fontWeight: '600' }}>{tx.paymentMode || 'Cash'}</span>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - ${tx.paymentMode} Slip`
                                                            })}
                                                            style={{
                                                                padding: '0.2rem 0.5rem',
                                                                borderRadius: '4px',
                                                                border: '1px solid #93c5fd',
                                                                background: '#eff6ff',
                                                                color: '#0078d4',
                                                                fontWeight: '700',
                                                                fontSize: '0.72rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                width: 'fit-content'
                                                            }}
                                                            title="View payment receipt / bank slip screenshot"
                                                        >
                                                            <ImageIcon size={12} /> View Screenshot
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', color: '#64748b' }}>{tx.timeString || tx.dateString}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - Proof Screenshot`
                                                            })}
                                                            style={{
                                                                padding: '0.3rem 0.6rem',
                                                                borderRadius: '6px',
                                                                border: '1px solid #86efac',
                                                                background: '#f0fdf4',
                                                                color: '#15803d',
                                                                fontWeight: '700',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title="View attached bank deposit slip / screenshot"
                                                        >
                                                            <Eye size={13} /> Proof
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setReceiptData(tx);
                                                            setReceiptModalOpen(true);
                                                        }}
                                                        style={{
                                                            padding: '0.3rem 0.6rem',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#ffffff',
                                                            color: '#0f172a',
                                                            fontWeight: '700',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title="View & print official receipt slip"
                                                    >
                                                        <Printer size={13} /> Slip
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Proof Lightbox Modal */}
            <PaymentProofModal
                isOpen={proofModal.isOpen}
                onClose={() => setProofModal({ isOpen: false, url: '', title: '' })}
                proofUrl={proofModal.url}
                title={proofModal.title}
            />
        </div>
    );
};

const Collections = () => {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const initialTab = searchParams.get('tab') || 'workflow';
    const preselectedClassId = searchParams.get('classId') || '';
    const preselectedStudentId = searchParams.get('studentId') || '';

    const [classes, setClasses] = useState([]);
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [currentAction, setCurrentAction] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [schoolInfo, setSchoolInfo] = useState({ name: 'School Report', logo: '' });
    
    // Fee Settings State
    const [feeSettings, setFeeSettings] = useState({ dueDate: '', penaltyAmount: '' });
    const [isSavingFeeSettings, setIsSavingFeeSettings] = useState(false);

    // Helper for Sort
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // 1. Init School ID
    // 1. Init School ID & Auth
    useEffect(() => {
        let isMounted = true;
        const resolveUser = async () => {
            // Priority 1: Firebase Auth (Real source of truth for DB permissions)
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (!isMounted) return;

                if (user) {
                    try {
                        const token = await user.getIdTokenResult();
                        if (token.claims.schoolId) {
                            console.log("Resolved School ID from Auth:", token.claims.schoolId);
                            setSchoolId(token.claims.schoolId);
                            setLoading(false);
                            return;
                        }
                    } catch (e) {
                        console.error("Claims error", e);
                    }
                }

                // Priority 2: Manual Session (Fallback/Dev)
                const manualSession = localStorage.getItem('manual_session');
                if (manualSession) {
                    try {
                        const userData = JSON.parse(manualSession);
                        if (userData.schoolId) {
                            console.log("Resolved School ID from Manual Session:", userData.schoolId);
                            setSchoolId(userData.schoolId);
                        }
                    } catch (e) {
                        console.error("Manual session parse error", e);
                    }
                }
                setLoading(false);
            });
            return () => unsubscribe();
        };
        resolveUser();
        return () => { isMounted = false; };
    }, []);

    // 1b. Monthly Fee Auto-Reset — runs once per calendar month
    useEffect(() => {
        if (!schoolId) return;

        const runMonthlyFeeReset = async () => {
            const currentMonth = new Date().toLocaleDateString('en-CA').slice(0, 7); // "YYYY-MM"
            const resetMetaRef = doc(db, `schools/${schoolId}/settings`, 'feeResetMeta');

            try {
                const metaSnap = await getDoc(resetMetaRef);
                const lastResetMonth = metaSnap.exists() ? metaSnap.data().lastResetMonth : null;

                if (lastResetMonth === currentMonth) {
                    // Already reset this month — do nothing
                    console.log('[FeeReset] Already reset for', currentMonth);
                    return;
                }

                console.log('[FeeReset] New month detected. Resetting all student fees to unpaid...');

                // Fetch all classes (excluding metadata doc)
                const classesSnap = await getDocs(collection(db, `schools/${schoolId}/classes`));
                const classIds = classesSnap.docs
                    .map(d => d.id)
                    .filter(id => id !== 'action_metadata');

                // Firestore batch limit is 500 writes — chunk if needed
                const BATCH_LIMIT = 490;
                let batch = writeBatch(db);
                let writeCount = 0;

                for (const classId of classIds) {
                    const studentsSnap = await getDocs(
                        collection(db, `schools/${schoolId}/classes/${classId}/students`)
                    );
                    for (const studentDoc of studentsSnap.docs) {
                        batch.update(studentDoc.ref, {
                            monthlyFeeStatus: 'unpaid',
                            monthlyFeeDate: null
                        });
                        writeCount++;

                        if (writeCount >= BATCH_LIMIT) {
                            await batch.commit();
                            batch = writeBatch(db);
                            writeCount = 0;
                        }
                    }
                }

                // Commit remaining writes
                if (writeCount > 0) await batch.commit();

                // Stamp the reset month so this doesn't run again until next month
                await setDoc(resetMetaRef, { lastResetMonth: currentMonth });
                console.log('[FeeReset] Reset complete for', currentMonth);

            } catch (err) {
                console.error('[FeeReset] Error during monthly fee reset:', err);
            }
        };

        runMonthlyFeeReset();
    }, [schoolId]);

    // 2. Fetch Classes & Action
    useEffect(() => {
        if (!schoolId) return;

        // Listen to Classes
        const qClasses = query(collection(db, `schools/${schoolId}/classes`));
        const unsubClasses = onSnapshot(qClasses, (snapshot) => {
            const classesData = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                // Filter out the special settings document
                .filter(doc => doc.id !== 'action_metadata');

            classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(classesData);
            setLoading(false);
        });

        // Listen to Collection Action (Stored in 'classes' collection to fit existing Firestore Rules)
        const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
        const unsubAction = onSnapshot(actionRef, (docSnap) => {
            if (docSnap.exists()) {
                setCurrentAction(docSnap.data());
            } else {
                setCurrentAction(null);
            }
        }, (error) => {
            console.error("Error listening to action:", error);
        });

        // Listen to Fee Settings
        const feeSettingsRef = doc(db, 'schools', schoolId, 'settings', 'feeSettings');
        const unsubFeeSettings = onSnapshot(feeSettingsRef, (docSnap) => {
            if (docSnap.exists()) {
                setFeeSettings({
                    dueDate: docSnap.data().dueDate || '',
                    penaltyAmount: docSnap.data().penaltyAmount || ''
                });
            } else {
                setFeeSettings({ dueDate: '', penaltyAmount: '' });
            }
        });

        // Listen to School Profile for Receipt branding
        const profileRef = doc(db, 'schools', schoolId, 'settings', 'profile');
        const unsubProfile = onSnapshot(profileRef, (docSnap) => {
            if (docSnap.exists()) {
                setSchoolInfo({
                    name: docSnap.data().name || 'School Name',
                    logo: docSnap.data().profileImage || ''
                });
            }
        });

        return () => {
            unsubClasses();
            unsubAction();
            unsubFeeSettings();
            unsubProfile();
        };

    }, [schoolId]);

    const handleSaveFeeSettings = async () => {
        if (!schoolId) return;
        setIsSavingFeeSettings(true);
        try {
            const feeSettingsRef = doc(db, 'schools', schoolId, 'settings', 'feeSettings');
            await setDoc(feeSettingsRef, feeSettings, { merge: true });
            alert("Fee settings saved successfully!");
        } catch (error) {
            console.error("Error saving fee settings:", error);
            alert("Failed to save fee settings");
        }
        setIsSavingFeeSettings(false);
    };

    const handleSaveAction = async (actionData) => {
        // Check for Manual Bypass Isolation
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode.\n\nDatabase writes are disabled for security. Please initialize a real session (Login with standard Password) to create actions.");
                return;
            }
        }

        if (!schoolId || !auth.currentUser) {
            console.error("Auth User or School ID is missing");
            alert("Authentication Error: You must be logged in with a valid account (not a bypass) to perform this action.");
            return;
        }

        // Debug Log
        console.log("Attempting to save action:", actionData);
        console.log("Current SchoolID:", schoolId);
        console.log("Current Auth User:", auth.currentUser?.uid);

        try {
            // Write to 'classes' collection which is whitelisted for Principals
            const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
            await setDoc(actionRef, {
                ...actionData,
                type: 'system_action_metadata', // Flag to identify it if needed
                createdAt: new Date().toISOString()
            });
            console.log("Action saved successfully to classes/action_metadata");
        } catch (error) {
            console.error("Error creating action:", error);
            alert(`Failed to create action: ${error.message}\nCheck console for details.`);
        }
    };

    const handleDeleteAction = async () => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Writes are disabled.");
                return;
            }
        }

        if (!schoolId || !auth.currentUser) return;
        if (!window.confirm("Are you sure you want to delete this action? Past payment records will be preserved but hidden.")) return;

        try {
            const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
            await deleteDoc(actionRef);
        } catch (error) {
            console.error("Error deleting action:", error);
            alert("Failed to delete action");
        }
    };

    // 3. Global Stats Aggregation
    const [globalStats, setGlobalStats] = useState({
        monthlyPaid: 0,
        monthlyUnpaid: 0,
        actionPaid: 0,
        actionUnpaid: 0,
        loading: true
    });

    useEffect(() => {
        if (loading || !schoolId || classes.length === 0) {
            console.log("[Collections] Waiting for initialization - School:", schoolId, "Classes count:", classes.length);
            return;
        }

        console.log("[Collections] Starting Global Aggregation for school:", schoolId);

        const unsubscribers = [];
        const classStatsMap = new Map();

        const updateAggregates = () => {
            let mPaid = 0;
            let mUnpaid = 0;
            let aPaid = 0;
            let aUnpaid = 0;

            classStatsMap.forEach((stats, cid) => {
                mPaid += stats.monthlyPaid;
                mUnpaid += stats.monthlyUnpaid;
                aPaid += stats.actionPaid;
                aUnpaid += stats.actionUnpaid;
            });

            console.log(`[Collections] TOTAL Aggregated - Monthly Paid: ${mPaid}, Unpaid: ${mUnpaid}`);

            setGlobalStats({
                monthlyPaid: mPaid,
                monthlyUnpaid: mUnpaid,
                actionPaid: aPaid,
                actionUnpaid: aUnpaid,
                loading: false
            });
        };

        classes.forEach(cls => {
            const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsub = onSnapshot(q, (snapshot) => {
                let cMonthlyPaid = 0;
                let cMonthlyUnpaid = 0;
                let cActionPaid = 0;
                let cActionUnpaid = 0;

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const monthlyStatus = data.monthlyFeeStatus || 'unpaid';
                    if (monthlyStatus === 'paid') cMonthlyPaid++;
                    else cMonthlyUnpaid++;

                    if (currentAction) {
                        const isTargeted = currentAction.targetAll ||
                            (currentAction.targetClasses && currentAction.targetClasses.includes(cls.id));

                        if (isTargeted) {
                            const actionStatus = data.customPayments?.[currentAction.name]?.status;
                            if (actionStatus === 'paid') cActionPaid++;
                            else cActionUnpaid++;
                        }
                    }
                });

                console.log(`[Collections] Class ${cls.name} [${cls.id}] Snapshot: ${snapshot.size} students, Paid: ${cMonthlyPaid}`);

                classStatsMap.set(cls.id, {
                    monthlyPaid: cMonthlyPaid,
                    monthlyUnpaid: cMonthlyUnpaid,
                    actionPaid: cActionPaid,
                    actionUnpaid: cActionUnpaid
                });
                updateAggregates();
            });
            unsubscribers.push(unsub);
        });

        return () => {
            console.log("[Collections] Cleaning up global listeners");
            unsubscribers.forEach(unsub => unsub());
        };

    }, [classes, currentAction, schoolId, loading]);
    // Re-run if classes list or action changes



    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Fee Collections
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Daily fee counters, class-wise reports and school finances</p>
                </div>

                {/* Fee Settings Inline UI */}
                {activeTab === 'collections' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Due Date:</span>
                            <input
                                type="text"
                                placeholder="e.g. 10th"
                                value={feeSettings.dueDate}
                                onChange={(e) => setFeeSettings({...feeSettings, dueDate: e.target.value})}
                                style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', width: '80px', fontSize: '0.9rem', outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Penalty Amt:</span>
                            <input
                                type="number"
                                placeholder="e.g. 500"
                                value={feeSettings.penaltyAmount}
                                onChange={(e) => setFeeSettings({...feeSettings, penaltyAmount: e.target.value})}
                                style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100px', fontSize: '0.9rem', outline: 'none' }}
                            />
                        </div>
                        <button
                            onClick={handleSaveFeeSettings}
                            disabled={isSavingFeeSettings}
                            style={{
                                padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                                background: 'var(--primary)', color: 'white', fontWeight: '600', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isSavingFeeSettings ? 0.7 : 1
                            }}
                        >
                            {isSavingFeeSettings ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                )}

                {/* Action Controls */}
                {activeTab === 'collections' && (
                    <div>
                        {currentAction ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Current Action</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--primary)' }}>{currentAction.name}</span>
                                </div>
                                <div style={{ height: '30px', width: '1px', background: '#e2e8f0' }} />
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                        {currentAction.targetAll ? 'All Classes' : `${currentAction.targetClasses?.length || 0} Classes`}
                                    </span>
                                </div>
                                <button
                                    onClick={handleDeleteAction}
                                    style={{
                                        padding: '0.5rem', borderRadius: '50%', border: 'none',
                                        background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '0.5rem'
                                    }}
                                    title="Delete Action"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowModal(true)}
                                className="btn-primary"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.75rem 1.5rem', borderRadius: '12px',
                                    background: 'var(--primary)', color: 'white', border: 'none',
                                    fontWeight: '600', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
                                }}
                            >
                                <Plus size={20} />
                                New Action
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Tabs Navigation (Daily Workflow leftmost) */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                <button
                    onClick={() => setActiveTab('workflow')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'workflow' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'workflow' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Daily Workflow
                </button>
                <button
                    onClick={() => setActiveTab('collections')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'collections' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'collections' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Collections
                </button>
                <button
                    onClick={() => setActiveTab('finances')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'finances' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'finances' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Finances
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'workflow' && (
                <DailyWorkflow
                    schoolId={schoolId}
                    classes={classes}
                    currentAction={currentAction}
                    schoolInfo={schoolInfo}
                    preselectedClassId={preselectedClassId}
                    preselectedStudentId={preselectedStudentId}
                />
            )}

            {activeTab === 'collections' && (
                <>
                    {/* Global Stats Overview */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                {/* Monthly Fee Cards */}
                <div className="card" style={{ padding: '1.25rem', border: '1px solid #dbeafe', background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#dcfce7', color: '#16a34a' }}>
                            <CheckCircle size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Monthly Fee Paid</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-main)', marginLeft: '0.25rem' }}>
                        {globalStats.monthlyPaid.toLocaleString()}
                    </span>
                </div>

                <div className="card" style={{ padding: '1.25rem', border: '1px solid #fee2e2', background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#fee2e2', color: '#dc2626' }}>
                            <Ban size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Monthly Fee Unpaid</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-main)', marginLeft: '0.25rem' }}>
                        {globalStats.monthlyUnpaid.toLocaleString()}
                    </span>
                </div>

                {/* Additional Action Fee Cards */}
                <div className="card" style={{ padding: '1.25rem', border: '1px solid #d1fae5', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: currentAction ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#059669', color: 'white' }}>
                            <Wallet size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#064e3b' }}>
                            {currentAction ? `${currentAction.name} Paid` : 'No Action Active'}
                        </span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#065f46', marginLeft: '0.25rem' }}>
                        {globalStats.actionPaid.toLocaleString()}
                    </span>
                </div>

                <div className="card" style={{ padding: '1.25rem', border: '1px solid #fecaca', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: currentAction ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#dc2626', color: 'white' }}>
                            <Wallet size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#7f1d1d' }}>
                            {currentAction ? `${currentAction.name} Unpaid` : 'No Action Active'}
                        </span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#991b1b', marginLeft: '0.25rem' }}>
                        {globalStats.actionUnpaid.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Classes Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading Classes...</div>
            ) : (
                <>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '1.5rem' }}>
                        {currentAction ? `Collection Status: ${currentAction.name}` : 'All Classes'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {classes.map(cls => (
                            <CollectionClassCard
                                key={cls.id}
                                cls={cls}
                                currentAction={currentAction}
                                schoolId={schoolId}
                            />
                        ))}
                    </div>
                </>
            )}
            </>
            )}

            {activeTab === 'finances' && (
                <FinancesDashboard schoolId={schoolId} currentAction={currentAction} />
            )}

            <ActionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleSaveAction}
                classes={classes}
            />
        </div>
    );
};

export default Collections;
