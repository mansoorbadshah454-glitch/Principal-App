import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, CheckCircle, Ban, Search, Filter, MoreVertical, Edit, Plus, Trash2, X,
    Printer, Download, Eye, ExternalLink, Image as ImageIcon, Building2, Loader2
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from '../components/CachedImage';

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

    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadPDF = async () => {
        try {
            setIsDownloading(true);
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const primaryColor = [0, 120, 212];
            const darkColor = [15, 23, 42];
            const grayColor = [100, 116, 139];

            // Header
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

            // Receipt Meta
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

            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(14, 34, 196, 34);

            // Student Info Box
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

            // Table
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
                }
            });

            const finalY = doc.lastAutoTable?.finalY || 130;

            // Footer
            const footerY = Math.max(finalY + 22, 155);
            doc.setDrawColor(203, 213, 225);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(14, footerY, 196, footerY);
            doc.setLineDashPattern([], 0);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('* This is a computer-generated fee receipt.', 14, footerY + 8);

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
            alert("Failed to generate PDF");
        } finally {
            setIsDownloading(false);
        }
    };

    const handlePrint = () => {
        const printContent = document.getElementById('printable-class-fee-receipt');
        if (!printContent) return;

        const printWindow = window.open('', '', 'width=800,height=900');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Fee Receipt - ${receiptData.receiptNo}</title>
                    <style>
                        @page { size: auto; margin: 15mm; }
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; background: #fff; }
                        .receipt-container { max-width: 650px; margin: 0 auto; border: 2px solid #0f172a; padding: 24px; border-radius: 8px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
                        th { background: #f1f5f9; padding: 10px 12px; text-align: left; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #1e293b; }
                        td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                    <script>
                        window.onload = function() { window.focus(); window.print(); window.close(); };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
        }}>
            <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '1.75rem', position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
                    <X size={18} />
                </button>

                <div id="printable-class-fee-receipt">
                    <div style={{ border: '2px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', background: '#ffffff' }}>
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                            <div><span style={{ color: '#64748b', fontWeight: '600' }}>Student Name: </span><strong style={{ color: '#0f172a' }}>{receiptData.studentName}</strong></div>
                            <div><span style={{ color: '#64748b', fontWeight: '600' }}>Roll No: </span><strong style={{ color: '#0f172a' }}>{receiptData.rollNo || 'N/A'}</strong></div>
                            <div><span style={{ color: '#64748b', fontWeight: '600' }}>Class: </span><strong style={{ color: '#0f172a' }}>{receiptData.className}</strong></div>
                            <div><span style={{ color: '#64748b', fontWeight: '600' }}>Father Name: </span><strong style={{ color: '#0f172a' }}>{receiptData.fatherName || 'N/A'}</strong></div>
                            <div><span style={{ color: '#64748b', fontWeight: '600' }}>Date & Time: </span><strong style={{ color: '#0f172a' }}>{receiptData.dateString} {receiptData.timeString}</strong></div>
                            <div><span style={{ color: '#64748b', fontWeight: '600' }}>Payment Mode: </span><strong style={{ color: '#16a34a' }}>{receiptData.paymentMode}</strong></div>
                        </div>

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
                                <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                                    <td style={{ padding: '0.75rem', fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>TOTAL AMOUNT PAID</td>
                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '800', fontSize: '1.1rem', color: '#16a34a' }}>
                                        Rs {Number(receiptData.totalPaid).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {receiptData.proofUrl && (
                            <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.8rem', color: '#166534', fontWeight: '600' }}>
                                ✓ Online/Bank Transfer Receipt Screenshot Attached
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '1.5rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.75rem', color: '#64748b' }}>
                            <div><span>* This is a computer-generated fee receipt.</span></div>
                            <div style={{ textAlign: 'center', borderTop: '1px solid #94a3b8', width: '130px', paddingTop: '3px', color: '#0f172a', fontWeight: '600' }}>Authorized Signature</div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                    <button onClick={onClose} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer' }}>Close</button>
                    <button onClick={handleDownloadPDF} disabled={isDownloading} style={{ padding: '0.65rem 1.4rem', borderRadius: '8px', border: '1px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', opacity: isDownloading ? 0.7 : 1 }}>
                        {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                    </button>
                    <button onClick={handlePrint} style={{ padding: '0.65rem 1.5rem', borderRadius: '8px', border: 'none', background: '#0078d4', color: '#ffffff', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0, 120, 212, 0.25)' }}>
                        <Printer size={18} /> Print Slip
                    </button>
                </div>
            </div>
        </div>
    );
};

const ClassCollection = () => {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [className, setClassName] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'paid', 'unpaid'
    const [schoolId, setSchoolId] = useState(null);
    const [currentAction, setCurrentAction] = useState(null);
    const [teacherName, setTeacherName] = useState('');
    const [schoolDetails, setSchoolDetails] = useState({ name: '', logo: '' });
    
    // New Individual Actions State
    const [menuStudentId, setMenuStudentId] = useState(null);
    const [showAddActionPopup, setShowAddActionPopup] = useState(false);
    const [actionStudentId, setActionStudentId] = useState(null);
    const [newActionTitle, setNewActionTitle] = useState('');
    const [newActionAmount, setNewActionAmount] = useState('');

    // Receipt & Payment Proof Modals State
    const [proofModal, setProofModal] = useState({ isOpen: false, url: '', title: '' });
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setMenuStudentId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // 1. Resolve School ID
    useEffect(() => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            setSchoolId(JSON.parse(manualSession).schoolId);
        } else {
            // Fallback to auth if needed, but sticking to pattern
            const unsubscribe = auth.onAuthStateChanged(user => {
                if (user) user.getIdTokenResult().then(token => setSchoolId(token.claims.schoolId));
            });
            return () => unsubscribe();
        }
    }, []);

    // 2. Fetch Data (Real-time)
    useEffect(() => {
        if (!schoolId || !classId) return;

        setLoading(true);

        // A. Class Info
        const classRef = doc(db, `schools/${schoolId}/classes`, classId);
        getDoc(classRef).then(snap => {
            if (snap.exists()) {
                setClassName(snap.data().name);
                setTeacherName(snap.data().teacher || 'Not Assigned');
            }
        });

        // A2. School Info
        const schoolRef = doc(db, `schools/${schoolId}/settings`, 'profile');
        getDoc(schoolRef).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setSchoolDetails({
                    name: data.name || 'School Name',
                    logo: data.profileImage || ''
                });
            }
        });

        // B. Students (Real-time)
        const studentsRef = collection(db, `schools/${schoolId}/classes/${classId}/students`);
        const unsubStudents = onSnapshot(studentsRef, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort by name
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setStudents(list);
            setLoading(false);
        });

        // C. Action Metadata (Real-time)
        const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
        const unsubAction = onSnapshot(actionRef, (docSnap) => {
            if (docSnap.exists()) {
                setCurrentAction(docSnap.data());
            } else {
                setCurrentAction(null);
            }
        });

        return () => {
            unsubStudents();
            unsubAction();
        };
    }, [schoolId, classId]);

    // Check if targeted
    const isTargeted = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(classId)));

    // Toggle Functions
    const toggleMonthlyFee = async (studentId, currentStatus) => {
        if (!schoolId) {
            console.error("[ClassCollection] Cannot toggle fee: schoolId is null");
            return;
        }
        const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
        const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);

        console.log(`[ClassCollection] Attempting toggle for student ${studentId}`);
        console.log(`[ClassCollection] Path: schools/${schoolId}/classes/${classId}/students/${studentId}`);
        console.log(`[ClassCollection] New Status: ${newStatus}`);

        try {
            await updateDoc(studentRef, {
                monthlyFeeStatus: newStatus,
                monthlyFeeDate: newStatus === 'paid' ? new Date().toISOString() : null
            });
            console.log(`[ClassCollection] Update SUCCESS for student: ${studentId}, monthlyFeeStatus: ${newStatus}`);
        } catch (error) {
            console.error("[ClassCollection] Update FAILED:", error);
            alert("Failed to update status. Check console for details.");
        }
    };


    const toggleActionFee = async (studentId, currentStatus) => {
        if (!schoolId || !currentAction) return;
        const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
        const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
        try {
            await updateDoc(studentRef, {
                [`customPayments.${currentAction.name}`]: {
                    status: newStatus,
                    date: new Date().toISOString()
                }
            });
            console.log(`[ClassCollection] Update successful for student: ${studentId}, action: ${currentAction.name}, status: ${newStatus}`);
        } catch (error) {
            console.error("Error updating action fee:", error);
            alert("Failed to update status");
        }
    };

    const toggleIndividualAction = async (studentId, actionId, newStatus) => {
        if (!schoolId || !classId) return;
        const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
        const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);

        const student = students.find(s => s.id === studentId);
        if (!student) return;

        const updatedActions = (student.individualActions || []).map(action => {
            if (action.id === actionId) {
                return { ...action, status: newStatus };
            }
            return action;
        });

        try {
            await updateDoc(studentRef, { individualActions: updatedActions });
            try {
                await updateDoc(masterStudentRef, { individualActions: updatedActions });
            } catch (err) {}
        } catch (error) {
            console.error("Error updating individual action:", error);
            alert("Failed to update status");
        }
    };

    const deleteIndividualAction = async (studentId, actionId) => {
        if (!window.confirm("Are you sure you want to remove this fine/action?")) return;
        if (!schoolId || !classId) return;
        const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
        const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);

        const student = students.find(s => s.id === studentId);
        if (!student) return;

        const updatedActions = (student.individualActions || []).filter(action => action.id !== actionId);

        try {
            await updateDoc(studentRef, { individualActions: updatedActions });
            try {
                await updateDoc(masterStudentRef, { individualActions: updatedActions });
            } catch (err) {}
        } catch (error) {
            console.error("Error deleting individual action:", error);
            alert("Failed to delete action");
        }
    };

    const handleAddIndividualAction = async () => {
        if (!schoolId || !classId || !actionStudentId || !newActionTitle.trim() || !newActionAmount) return;
        
        const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, actionStudentId);
        const masterStudentRef = doc(db, `schools/${schoolId}/students`, actionStudentId);
        const student = students.find(s => s.id === actionStudentId);
        
        if (!student) return;

        const newAction = {
            id: Date.now().toString(),
            name: newActionTitle.trim(),
            amount: Number(newActionAmount),
            status: 'unpaid'
        };

        const updatedActions = [...(student.individualActions || []), newAction];

        try {
            await updateDoc(studentRef, { individualActions: updatedActions });
            try {
                await updateDoc(masterStudentRef, { individualActions: updatedActions });
            } catch (err) {}
            setShowAddActionPopup(false);
            setNewActionTitle('');
            setNewActionAmount('');
            setActionStudentId(null);
        } catch (error) {
            console.error("Error adding new action:", error);
            alert("Failed to add action");
        }
    };

    const filteredStudents = students.filter(s => {
        if (activeTab === 'all') return true;
        return (s.monthlyFeeStatus || 'unpaid') === activeTab;
    });

    const generatePDF = async () => {
        if (!students.length) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const monthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

        const loadImage = async (url) => {
            if (!url) return null;
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.error("Error loading image:", error);
                return null;
            }
        };

        try {
            // 1. Header Section - Solid Blue
            doc.setFillColor(30, 58, 138); // Dark Blue
            doc.rect(0, 0, pageWidth, 50, 'F');

            // Logo
            if (schoolDetails.logo) {
                const imgData = await loadImage(schoolDetails.logo);
                if (imgData) {
                    doc.addImage(imgData, 'PNG', 15, 12, 26, 26);
                }
            }

            // School Name
            doc.setFontSize(22);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text(schoolDetails.name.toUpperCase(), 50, 22);

            // Report Title
            doc.setFontSize(14);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            doc.text("Fee Collections Report", 50, 31);

            // Month
            doc.setFontSize(11);
            doc.setTextColor(248, 250, 252);
            doc.text(`Month: ${monthYear}`, 50, 38);

            // 2. Metadata Section
            let yPos = 65;
            doc.setTextColor(30, 41, 59); // Slate-800
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(`Class: ${className}`, 15, yPos);

            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.text(`Teacher: ${teacherName}`, 15, yPos + 7);

            // Stats
            const paidCount = students.filter(s => s.monthlyFeeStatus === 'paid').length;
            const unpaidCount = students.length - paidCount;

            doc.text(`Total Students: ${students.length}`, pageWidth - 15, yPos, { align: 'right' });
            doc.text(`Total Paid: ${paidCount}`, pageWidth - 15, yPos + 7, { align: 'right' });
            doc.text(`Total Unpaid: ${unpaidCount}`, pageWidth - 15, yPos + 14, { align: 'right' });

            // 3. Table Data
            const tableColumn = ["Roll No", "Student Name", "Status", "Date Marked"];
            const tableRows = students.map(s => [
                s.rollNo || '-',
                s.name || 'N/A',
                (s.monthlyFeeStatus || 'unpaid').toUpperCase(),
                s.monthlyFeeDate ? new Date(s.monthlyFeeDate).toLocaleDateString() : '-'
            ]);

            autoTable(doc, {
                startY: yPos + 25,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [30, 58, 138],
                    textColor: 255,
                    fontSize: 10,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    textColor: 50,
                    fontSize: 9,
                    halign: 'center'
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    1: { halign: 'left' }
                },
                didParseCell: (data) => {
                    if (data.column.index === 2) {
                        if (data.cell.raw === 'PAID') {
                            data.cell.styles.textColor = [22, 101, 52];
                            data.cell.styles.fontStyle = 'bold';
                        } else if (data.cell.raw === 'UNPAID') {
                            data.cell.styles.textColor = [153, 27, 27];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            });

            // Footer
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Generated on ${new Date().toLocaleString()}`, 15, doc.internal.pageSize.getHeight() - 10);
                doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
            }

            doc.save(`Fee_Report_${className.replace(/\s+/g, '_')}_${monthYear.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("Failed to generate PDF.");
        }
    };

    return (
        <div className="animate-fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/collections')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        background: 'none', border: 'none', color: 'var(--text-secondary)',
                        cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600'
                    }}
                >
                    <ArrowLeft size={18} /> Back to Collections
                </button>
            </div>

            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    {className} <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>Collections</span>
                </h1>
                {isTargeted && (
                    <div style={{
                        marginTop: '0.5rem', display: 'inline-block', padding: '0.5rem 1rem',
                        background: 'var(--primary)', color: 'white', borderRadius: '20px',
                        fontSize: '0.85rem', fontWeight: '600', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.3)'
                    }}>
                        Active Action: {currentAction.name}
                    </div>
                )}
            </header>

            {/* Simple Filter */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => setActiveTab('all')}
                    style={{
                        padding: '0.5rem 1.5rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                        background: activeTab === 'all' ? 'var(--text-main)' : 'white',
                        color: activeTab === 'all' ? 'white' : 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: '600'
                    }}
                >
                    All Students
                </button>
                <button
                    onClick={() => setActiveTab('paid')}
                    style={{
                        padding: '0.5rem 1.5rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                        background: activeTab === 'paid' ? '#dcfce7' : 'white',
                        color: activeTab === 'paid' ? '#166534' : 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: '600'
                    }}
                >
                    Monthly Paid
                </button>
                <button
                    onClick={() => setActiveTab('unpaid')}
                    style={{
                        padding: '0.5rem 1.5rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                        background: activeTab === 'unpaid' ? '#fee2e2' : 'white',
                        color: activeTab === 'unpaid' ? '#991b1b' : 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: '600'
                    }}
                >
                    Monthly Unpaid
                </button>

                <button
                    onClick={generatePDF}
                    style={{
                        marginLeft: 'auto',
                        padding: '0.5rem 1.5rem', borderRadius: '10px', border: 'none',
                        background: 'var(--primary)',
                        color: 'white',
                        cursor: 'pointer', fontWeight: '600',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.3)'
                    }}
                >
                    <Filter size={16} /> Download Report
                </button>
            </div>

            {/* Student List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>Loading Student Data...</div>
            ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', background: '#f8fafc', borderRadius: '16px', color: 'var(--text-secondary)' }}>
                    No students found.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
                    {filteredStudents.map(student => {
                        const monthlyStatus = student.monthlyFeeStatus || 'unpaid';
                        const actionStatus = isTargeted
                            ? (student.customPayments?.[currentAction.name]?.status || 'unpaid')
                            : null;

                        return (
                            <div key={student.id} className="card" style={{
                                padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                                borderTop: `4px solid ${monthlyStatus === 'paid' ? '#10b981' : '#f43f5e'}`,
                                position: 'relative'
                            }}>
                                {/* 3-Dot Menu Button */}
                                <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuStudentId(menuStudentId === student.id ? null : student.id);
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem' }}
                                    >
                                        <MoreVertical size={20} />
                                    </button>
                                    
                                    {/* Dropdown Menu */}
                                    {menuStudentId === student.id && (
                                        <div style={{
                                            position: 'absolute', top: '100%', right: '0', background: 'white',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', borderRadius: '12px',
                                            padding: '0.5rem', minWidth: '180px', zIndex: 10, border: '1px solid #e2e8f0'
                                        }}>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/student/edit/${classId}/${student.id}?from=collections`);
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                                                    padding: '0.5rem', border: 'none', background: 'transparent',
                                                    textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
                                                    color: 'var(--text-main)', borderRadius: '8px', fontWeight: '500'
                                                }}
                                                className="hover:bg-slate-100"
                                            >
                                                <Edit size={14} color="var(--primary)" /> Edit Profile & Fee
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActionStudentId(student.id);
                                                    setShowAddActionPopup(true);
                                                    setMenuStudentId(null);
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                                                    padding: '0.5rem', border: 'none', background: 'transparent',
                                                    textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
                                                    color: 'var(--text-main)', borderRadius: '8px', fontWeight: '500'
                                                }}
                                                className="hover:bg-slate-100"
                                            >
                                                <Plus size={14} color="#ec4899" /> Add New Action
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <CachedImage
                                        src={student.profilePic || `https://ui-avatars.com/api/?name=${student.name}&background=random`}
                                        alt={student.name}
                                        style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                                    />
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>{student.name}</h4>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                            Roll No: {student.rollNo || 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ height: '1px', background: '#f1f5f9', margin: '0.25rem 0' }} />

                                {/* 1. Monthly Fee Status (Uneditable Official Badge) */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>Monthly Fee</span>
                                        {monthlyStatus === 'paid' && student.monthlyFeeDate && (
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                Paid: {new Date(student.monthlyFeeDate).toLocaleDateString()} {student.lastPaymentMode ? `(${student.lastPaymentMode})` : ''}
                                            </div>
                                        )}
                                    </div>

                                    {monthlyStatus === 'paid' ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <div
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                                    padding: '0.35rem 0.65rem', borderRadius: '6px',
                                                    background: '#dcfce7', color: '#15803d', fontWeight: '700',
                                                    fontSize: '0.8rem', border: '1px solid #bbf7d0'
                                                }}
                                                title="Fee marked as paid via official workflow"
                                            >
                                                <CheckCircle size={14} /> Paid
                                            </div>

                                            {/* View Receipt Slip Button */}
                                            <button
                                                onClick={() => {
                                                    const items = [];
                                                    let total = 0;
                                                    if (student.feeStructure && student.feeStructure.length > 0) {
                                                        student.feeStructure.forEach(f => {
                                                            const amt = Number(f.amount) || 0;
                                                            if (amt > 0) { items.push({ name: f.name, amount: amt }); total += amt; }
                                                        });
                                                    } else {
                                                        const base = Number(student.tuitionFee) || 0;
                                                        items.push({ name: 'Tuition Fee', amount: base });
                                                        total += base;
                                                    }
                                                    setReceiptData({
                                                        receiptNo: student.lastReceiptNo || `REC-${(student.id || '').slice(-6).toUpperCase()}`,
                                                        studentName: student.name,
                                                        rollNo: student.rollNo || 'N/A',
                                                        className: className || 'Class',
                                                        fatherName: student.parentDetails?.fatherName || student.fatherName || 'N/A',
                                                        items: items.length > 0 ? items : [{ name: 'Monthly Fee', amount: total }],
                                                        totalPaid: total,
                                                        paymentMode: student.lastPaymentMode || 'Cash',
                                                        proofUrl: student.lastPaymentProofUrl || null,
                                                        dateString: student.monthlyFeeDate ? new Date(student.monthlyFeeDate).toLocaleDateString() : new Date().toLocaleDateString(),
                                                        timeString: student.monthlyFeeDate ? new Date(student.monthlyFeeDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                                                        collectedBy: 'Principal Office'
                                                    });
                                                    setReceiptModalOpen(true);
                                                }}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                    padding: '0.35rem 0.65rem', borderRadius: '6px',
                                                    background: '#f8fafc', color: '#0078d4', fontWeight: '600',
                                                    fontSize: '0.75rem', border: '1px solid #cbd5e1', cursor: 'pointer'
                                                }}
                                                title="View & Print Official Receipt Slip"
                                            >
                                                <Printer size={12} /> Slip
                                            </button>

                                            {/* View Proof Button if Screenshot exists */}
                                            {student.lastPaymentProofUrl && (
                                                <button
                                                    onClick={() => setProofModal({
                                                        isOpen: true,
                                                        url: student.lastPaymentProofUrl,
                                                        title: `${student.name} - Payment Screenshot`
                                                    })}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                        padding: '0.35rem 0.65rem', borderRadius: '6px',
                                                        background: '#eff6ff', color: '#0078d4', fontWeight: '600',
                                                        fontSize: '0.75rem', border: '1px solid #93c5fd', cursor: 'pointer'
                                                    }}
                                                    title="View attached bank deposit slip / screenshot"
                                                >
                                                    <Eye size={12} /> Proof
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                    padding: '0.35rem 0.75rem', borderRadius: '6px',
                                                    background: '#fee2e2', color: '#b91c1c', fontWeight: '700',
                                                    fontSize: '0.85rem', border: '1px solid #fecaca'
                                                }}
                                            >
                                                <Ban size={15} /> Unpaid
                                            </div>
                                            <button
                                                onClick={() => navigate(`/collections?tab=workflow&classId=${classId}&studentId=${student.id}`)}
                                                style={{
                                                    padding: '0.35rem 0.75rem', borderRadius: '6px',
                                                    background: '#0078d4', color: '#ffffff', fontWeight: '600',
                                                    fontSize: '0.8rem', border: 'none', cursor: 'pointer',
                                                    boxShadow: '0 2px 4px rgba(0, 120, 212, 0.2)'
                                                }}
                                                title="Collect fee in Daily Workflow"
                                            >
                                                Collect
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* 2. Action Fee Control (If Targeted) */}
                                {isTargeted && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary)' }}>{currentAction.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Special Collection</span>
                                        </div>

                                        {actionStatus === 'paid' ? (
                                            <button
                                                onClick={() => toggleActionFee(student.id, 'paid')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none',
                                                    background: '#dcfce7', color: '#166534', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem'
                                                }}
                                            >
                                                <CheckCircle size={14} /> Paid
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => toggleActionFee(student.id, 'unpaid')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #fee2e2',
                                                    background: 'white', color: '#dc2626', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem'
                                                }}
                                            >
                                                <Ban size={14} /> Unpaid
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* 3. Individual Actions Control */}
                                {student.individualActions && student.individualActions.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {student.individualActions.map(action => (
                                            <div key={action.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ec4899' }}>{action.name}</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Rs {action.amount}</span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {action.status === 'paid' ? (
                                                        <button
                                                            onClick={() => toggleIndividualAction(student.id, action.id, 'unpaid')}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                                padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none',
                                                                background: '#dcfce7', color: '#166534', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem'
                                                            }}
                                                        >
                                                            <CheckCircle size={14} /> Paid
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => toggleIndividualAction(student.id, action.id, 'paid')}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                                padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #16a34a',
                                                                background: '#dcfce7', color: '#166534', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem'
                                                            }}
                                                        >
                                                            <CheckCircle size={14} /> Mark Paid
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => deleteIndividualAction(student.id, action.id)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Action Popup */}
            {showAddActionPopup && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ background: 'white', padding: '2rem', borderRadius: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>Add New Action</h3>
                            <button onClick={() => setShowAddActionPopup(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Action Title</label>
                            <input 
                                type="text"
                                placeholder="e.g. Fine, Books Fee"
                                value={newActionTitle}
                                onChange={(e) => setNewActionTitle(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Amount (Rs)</label>
                            <input 
                                type="number"
                                placeholder="e.g. 500"
                                value={newActionAmount}
                                onChange={(e) => setNewActionAmount(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                            />
                        </div>

                        <button 
                            onClick={handleAddIndividualAction}
                            disabled={!newActionTitle.trim() || !newActionAmount}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '12px', border: 'none',
                                background: 'var(--primary)', color: 'white', fontWeight: '700', cursor: 'pointer',
                                opacity: (!newActionTitle.trim() || !newActionAmount) ? 0.5 : 1
                            }}
                        >
                            Save Action
                        </button>
                    </div>
                </div>
            )}

            {/* Proof Lightbox Modal */}
            <PaymentProofModal
                isOpen={proofModal.isOpen}
                onClose={() => setProofModal({ isOpen: false, url: '', title: '' })}
                proofUrl={proofModal.url}
                title={proofModal.title}
            />

            {/* Fee Receipt Slip Modal */}
            <FeeReceiptModal
                isOpen={receiptModalOpen}
                onClose={() => setReceiptModalOpen(false)}
                receiptData={receiptData}
                schoolInfo={schoolDetails}
            />
        </div>
    );
};

export default ClassCollection;
