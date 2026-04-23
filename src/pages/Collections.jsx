import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Users, ChevronRight, Ban, CheckCircle, Plus, Trash2, X, CheckSquare, Square, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db, auth } from '../firebase';
import {
    collection, onSnapshot, query, doc, updateDoc, deleteField, setDoc, getDoc, deleteDoc,
    getDocs, writeBatch, getDocsFromCache
} from 'firebase/firestore';

// --- Components ---

const FinancesDashboard = ({ schoolId, currentAction }) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        baseExpectedRevenue: 0,
        basePaymentsReceived: 0,
        teachersSalary: 0,
        actionExpectedRevenue: 0,
        actionPaymentsReceived: 0
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
        
        const fetchFinances = async () => {
            try {
                // Ultra-fast offline-first fetch
                const getDocsFast = async (colRef) => {
                    try {
                        const snap = await getDocsFromCache(colRef);
                        if (snap.empty) throw new Error("cache empty");
                        return snap;
                    } catch {
                        return await getDocs(colRef);
                    }
                };

                // Parallel fetch top level collections
                const [schoolDoc, teachersSnap, classesSnap] = await Promise.all([
                    getDoc(doc(db, `schools/${schoolId}`)),
                    getDocsFast(collection(db, `schools/${schoolId}/teachers`)),
                    getDocsFast(collection(db, `schools/${schoolId}/classes`))
                ]);

                if (schoolDoc.exists()) {
                    setSchoolInfo({
                        name: schoolDoc.data().name || 'School Report',
                        logo: schoolDoc.data().profileImage || ''
                    });
                }

                // 1. Calculate Teachers Salary
                let totalSalary = 0;
                teachersSnap.docs.forEach(doc => {
                    const salary = Number(doc.data().salary) || 0;
                    totalSalary += salary;
                });

                // 2. Parallel Fetch Students
                let expectedRev = 0;
                let receivedRev = 0;
                let actionExpectedRev = 0;
                let actionReceivedRev = 0;
                
                const validClasses = classesSnap.docs.filter(c => c.id !== 'action_metadata');

                const studentPromises = validClasses.map(async (classDoc) => {
                    const isTargetedByAction = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(classDoc.id)));
                    const studentsSnap = await getDocsFast(collection(db, `schools/${schoolId}/classes/${classDoc.id}/students`));
                    return { isTargetedByAction, studentsSnap };
                });

                const studentResults = await Promise.all(studentPromises);

                studentResults.forEach(({ isTargetedByAction, studentsSnap }) => {
                    studentsSnap.docs.forEach(studentDoc => {
                        const sData = studentDoc.data();
                        
                        // Regular Fees (Legacy root fields)
                        let legacyTotalFee = (Number(sData.tuitionFee) || 0) + (Number(sData.transportFee) || 0) + (Number(sData.otherFees) || 0);
                        
                        // Recurring Structure Fees
                        let structuredFee = 0;
                        if (sData.feeStructure && sData.feeStructure.length > 0) {
                            structuredFee = sData.feeStructure.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                            legacyTotalFee = 0; // If feeStructure exists, we assume it's migrated and ignore root fields to prevent double counting
                        }

                        const totalFee = legacyTotalFee + structuredFee;
                        expectedRev += totalFee;
                        if (sData.monthlyFeeStatus === 'paid') {
                            receivedRev += totalFee;
                        }

                        // Global Action Fees (Legacy Support)
                        if (isTargetedByAction && currentAction) {
                            actionExpectedRev += Number(currentAction.amount || 0);
                            const actionStatus = sData.customPayments?.[currentAction.name]?.status;
                            if (actionStatus === 'paid') {
                                actionReceivedRev += Number(currentAction.amount || 0);
                            }
                        }

                        // Individual Actions (New Dynamic Actions)
                        if (sData.individualActions && sData.individualActions.length > 0) {
                            sData.individualActions.forEach(action => {
                                actionExpectedRev += Number(action.amount || 0);
                                if (action.status === 'paid') {
                                    actionReceivedRev += Number(action.amount || 0);
                                }
                            });
                        }
                    });
                });

                setStats({
                    baseExpectedRevenue: expectedRev,
                    basePaymentsReceived: receivedRev,
                    teachersSalary: totalSalary,
                    actionExpectedRevenue: actionExpectedRev,
                    actionPaymentsReceived: actionReceivedRev
                });
                setLoading(false);
            } catch (err) {
                console.error("Error fetching finances:", err);
                setLoading(false);
            }
        };

        fetchFinances();

        // 3. Listen to custom finances (incomes and expenses)
        const unsubFinances = onSnapshot(doc(db, `schools/${schoolId}/settings/finances`), (docSnap) => {
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

        return () => unsubFinances();
    }, [schoolId]);

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

            if (currentAction) {
                incomesBody.unshift([
                    currentAction.name,
                    'Active Action (Collected)',
                    `Rs ${(stats.actionPaymentsReceived || 0).toLocaleString()}`
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
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Add Income Form */}
                    <div className="card" style={{ padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ArrowUpRight size={18} color="#16a34a" /> Add Payments Received
                        </h4>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Income Title</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Canteen Rent" 
                                value={newIncome.name}
                                onChange={e => setNewIncome({...newIncome, name: e.target.value})}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                            />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Amount (Rs)</label>
                            <input 
                                type="number" 
                                placeholder="e.g. 5000" 
                                value={newIncome.amount}
                                onChange={e => setNewIncome({...newIncome, amount: e.target.value})}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                                onClick={() => handleAddFinance('one-time', 'incomes', newIncome, setIsSavingIncome, setNewIncome)}
                                disabled={isSavingIncome || !newIncome.name || !newIncome.amount}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: 'white', border: '1px solid #16a34a', color: '#16a34a', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Save
                            </button>
                            <button 
                                onClick={() => handleAddFinance('permanent', 'incomes', newIncome, setIsSavingIncome, setNewIncome)}
                                disabled={isSavingIncome || !newIncome.name || !newIncome.amount}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: '#16a34a', border: '1px solid #16a34a', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Save as Permanent
                            </button>
                        </div>
                    </div>

                    {/* Add Expense Form */}
                    <div className="card" style={{ padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ArrowDownRight size={18} color="#dc2626" /> Add Manual Expense
                        </h4>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Expense Title</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Electricity Bill" 
                                value={newExpense.name}
                                onChange={e => setNewExpense({...newExpense, name: e.target.value})}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                            />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Amount (Rs)</label>
                            <input 
                                type="number" 
                                placeholder="e.g. 15000" 
                                value={newExpense.amount}
                                onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                                onClick={() => handleAddFinance('one-time', 'expenses', newExpense, setIsSavingExpense, setNewExpense)}
                                disabled={isSavingExpense || !newExpense.name || !newExpense.amount}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: 'white', border: '1px solid #dc2626', color: '#dc2626', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Save
                            </button>
                            <button 
                                onClick={() => handleAddFinance('permanent', 'expenses', newExpense, setIsSavingExpense, setNewExpense)}
                                disabled={isSavingExpense || !newExpense.name || !newExpense.amount}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: '#dc2626', border: '1px solid #dc2626', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Save as Permanent
                            </button>
                        </div>
                    </div>
                </div>

                {/* Income & Expenses Breakdown */}
                <div className="card custom-scrollbar" style={{ padding: '2rem', border: '1px solid #e2e8f0', height: '100%', maxHeight: '680px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>Income & Expenses Breakdown</h4>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', padding: '0.3rem 0.6rem', borderRadius: '8px', background: '#dcfce7', color: '#16a34a' }}>
                                {financesData.incomes.length} Incomes
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', padding: '0.3rem 0.6rem', borderRadius: '8px', background: '#fee2e2', color: '#dc2626' }}>
                                {financesData.expenses.length + 1} Expenses
                            </span>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {/* Static Teacher Salary Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: '#fca5a5', padding: '0.3rem', borderRadius: '50%' }}>
                                    <ArrowDownRight size={16} color="#991b1b" />
                                </div>
                                <div>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', color: 'var(--text-main)' }}>
                                        Teachers Salaries <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: '#e2e8f0', color: '#475569', borderRadius: '12px', textTransform: 'uppercase', fontWeight: '700' }}>Auto</span>
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aggregated from all staff profiles</span>
                                </div>
                            </div>
                            <span style={{ fontWeight: '700', color: '#dc2626' }}>Rs {stats.teachersSalary.toLocaleString()}</span>
                        </div>

                        {/* Action Row (If Active) */}
                        {currentAction && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: '#86efac', padding: '0.3rem', borderRadius: '50%' }}>
                                        <ArrowUpRight size={16} color="#166534" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', color: 'var(--text-main)' }}>
                                            {currentAction.name} 
                                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: '#e2e8f0', color: '#475569', borderRadius: '12px', textTransform: 'uppercase', fontWeight: '700' }}>Active Action</span>
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Currently Collected Amount</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ fontWeight: '700', color: '#16a34a' }}>Rs {(stats.actionPaymentsReceived || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        )}

                        {/* Incomes Rows */}
                        {financesData.incomes.map(inc => (
                            <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: '#86efac', padding: '0.3rem', borderRadius: '50%' }}>
                                        <ArrowUpRight size={16} color="#166534" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', color: 'var(--text-main)' }}>
                                            {inc.name} 
                                            {inc.type === 'permanent' && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: '#e2e8f0', color: '#475569', borderRadius: '12px', textTransform: 'uppercase', fontWeight: '700' }}>Auto</span>}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Manual Entry</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ fontWeight: '700', color: '#16a34a' }}>Rs {Number(inc.amount).toLocaleString()}</span>
                                    <button 
                                        onClick={() => handleDeleteFinance(inc.id, 'incomes')}
                                        style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', padding: '0.2rem' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Expenses Rows */}
                        {financesData.expenses.map(exp => (
                            <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: '#fca5a5', padding: '0.3rem', borderRadius: '50%' }}>
                                        <ArrowDownRight size={16} color="#991b1b" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', color: 'var(--text-main)' }}>
                                            {exp.name} 
                                            {exp.type === 'permanent' && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: '#e2e8f0', color: '#475569', borderRadius: '12px', textTransform: 'uppercase', fontWeight: '700' }}>Auto</span>}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Manual Entry</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ fontWeight: '700', color: '#dc2626' }}>Rs {Number(exp.amount).toLocaleString()}</span>
                                    <button 
                                        onClick={() => handleDeleteFinance(exp.id, 'expenses')}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {financesData.incomes.length === 0 && financesData.expenses.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                No manual incomes or expenses added yet.
                            </div>
                        )}
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

const Collections = () => {
    const [classes, setClasses] = useState([]);
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('collections');
    const [currentAction, setCurrentAction] = useState(null);
    const [showModal, setShowModal] = useState(false);
    
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

        return () => {
            unsubClasses();
            unsubAction();
            unsubFeeSettings();
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
                    <p style={{ color: 'var(--text-secondary)' }}>Overview of student fee payments across all classes</p>
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
                                className="btn-primary" // Assuming global class exists, or use inline
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

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
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
