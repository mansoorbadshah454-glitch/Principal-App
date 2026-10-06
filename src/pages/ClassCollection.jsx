import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, CheckCircle, Ban, Search, Filter, MoreVertical, Edit, Plus, Trash2, X,
    Printer, Download, Eye, ExternalLink, Image as ImageIcon, Building2, Loader2,
    CheckSquare, Square
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from '../components/CachedImage';
import { isMonthSettled, MONTH_NAMES, MONTH_SHORT } from '../utils/feePipeline';

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
    const [searchQuery, setSearchQuery] = useState('');
    const [schoolId, setSchoolId] = useState(null);
    const [currentAction, setCurrentAction] = useState(null);
    const [teacherName, setTeacherName] = useState('');
    const [schoolDetails, setSchoolDetails] = useState({ name: '', logo: '' });
    const [bankingDetails, setBankingDetails] = useState([]);
    const [feeSettings, setFeeSettings] = useState({ dueDate: 10, penaltyAmount: 0 });
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [isPrintingChallan, setIsPrintingChallan] = useState(false);
    
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
                    name: data.name || data.schoolName || 'School Name',
                    logo: data.profileImage || data.logo || '',
                    phone: data.phone || data.contactNumber || '',
                    address: data.address || '',
                    email: data.email || ''
                });
            }
        });

        // A3. Banking Info (for Challan deposit details)
        const bankingRef = doc(db, `schools/${schoolId}/settings`, 'banking');
        getDoc(bankingRef).then(snap => {
            if (snap.exists()) {
                setBankingDetails(snap.data()?.accounts || []);
            }
        });

        // A4. Fee Settings (Due Date & Late Penalty)
        const feeSettingsRef = doc(db, `schools/${schoolId}/settings`, 'fees');
        getDoc(feeSettingsRef).then(snap => {
            if (snap.exists()) {
                const fd = snap.data();
                setFeeSettings({
                    dueDate: parseInt(fd.dueDate, 10) || 10,
                    penaltyAmount: Number(fd.penaltyAmount) || 0
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

        // Merge individualActions with any legacy storeCharges
        const baseActions = [...(student.individualActions || [])];
        if (student.storeCharges && student.storeCharges.length > 0) {
            student.storeCharges.forEach(sc => {
                const legacyId = `store_${sc.receiptNo || ''}`;
                if (!baseActions.some(a => a.id === legacyId || a.id === sc.receiptNo || a.receiptNo === sc.receiptNo)) {
                    baseActions.push({
                        id: legacyId,
                        name: sc.title || `Store Purchase (${sc.receiptNo})`,
                        amount: Number(sc.amount) || 0,
                        status: sc.status || 'unpaid',
                        date: sc.date || new Date().toISOString(),
                        type: 'store_inventory',
                        receiptNo: sc.receiptNo
                    });
                }
            });
        }

        const updatedActions = baseActions.map(action => {
            if (action.id === actionId || action.receiptNo === actionId) {
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

        const baseActions = [...(student.individualActions || [])];
        const updatedActions = baseActions.filter(action => action.id !== actionId && action.receiptNo !== actionId);

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
        const matchesTab = activeTab === 'all' || (s.monthlyFeeStatus || 'unpaid') === activeTab;
        if (!matchesTab) return false;

        if (!searchQuery.trim()) return true;
        const term = searchQuery.trim().toLowerCase();
        const nameMatch = (s.name || '').toLowerCase().includes(term);
        const rollMatch = String(s.rollNo || s.roll_no || s.rollNumber || s.roll || '').toLowerCase().includes(term);
        return nameMatch || rollMatch;
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
            doc.text((schoolDetails?.name || 'SCHOOL').toUpperCase(), 50, 22);

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

    // --- Student Selection Handlers for Challan Printing ---
    const toggleStudentSelection = (studentId) => {
        setSelectedStudentIds(prev => 
            prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
        );
    };

    const handleToggleSelectAll = () => {
        if (selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0) {
            setSelectedStudentIds([]);
        } else {
            setSelectedStudentIds(filteredStudents.map(s => s.id));
        }
    };

    // --- Currency Number to Words (Rupees) ---
    const numberToWords = (num) => {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const n = ('000000000' + (num || 0)).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return 'Zero Rupees Only';
        let str = '';
        str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
        str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
        str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
        str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
        str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
        return (str.trim() ? str.trim() + ' Rupees Only' : 'Zero Rupees Only');
    };

    // --- School Logo Resolver with Base64 Caching ---
    const resolveSchoolLogoForPrint = async (sId, fallbackUrl = '') => {
        if (!sId) return fallbackUrl;
        try {
            const cached = localStorage.getItem(`school_logo_base64_${sId}`);
            if (cached && cached.startsWith('data:image/')) return cached;

            let targetUrl = fallbackUrl;
            if (!targetUrl) {
                const pDoc = await getDoc(doc(db, `schools/${sId}/settings`, 'profile'));
                if (pDoc.exists() && (pDoc.data()?.profileImage || pDoc.data()?.logo)) {
                    targetUrl = pDoc.data().profileImage || pDoc.data().logo;
                } else {
                    const rDoc = await getDoc(doc(db, 'schools', sId));
                    if (rDoc.exists()) targetUrl = rDoc.data()?.logo || rDoc.data()?.profileImage || '';
                }
            }
            if (!targetUrl) return '';

            const b64 = await new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const dataURL = canvas.toDataURL('image/png');
                        resolve(dataURL);
                    } catch {
                        resolve(targetUrl);
                    }
                };
                img.onerror = () => resolve(targetUrl);
                img.src = targetUrl;
            });

            if (b64 && b64.startsWith('data:image/')) {
                try { localStorage.setItem(`school_logo_base64_${sId}`, b64); } catch {}
            }
            return b64;
        } catch {
            return fallbackUrl;
        }
    };

    // --- Build 12-Month Session Challan Data (Pakistan Standard: April to March) ---
    const buildStudentSessionChallanData = (student) => {
        const today = new Date();
        const currentMonthIdx = today.getMonth(); // 0-11
        const currentYear = today.getFullYear();
        const dueDay = parseInt(feeSettings?.dueDate, 10) || 10;
        const penaltyAmount = Number(feeSettings?.penaltyAmount) || 0;

        // Pakistan Academic Session: April to March
        const sessionStartYear = currentMonthIdx < 3 ? currentYear - 1 : currentYear;

        // Base Tuition
        let baseTuition = Number(student.tuitionFee || 0);
        if (baseTuition === 0 && Array.isArray(student.feeStructure) && student.feeStructure.length > 0) {
            const t = student.feeStructure.find(f => (f.name || '').toLowerCase().includes('tuition'));
            if (t) baseTuition = Number(t.amount || 0);
            else baseTuition = Number(student.monthlyFee || student.fee || 0);
        }
        if (baseTuition === 0 && student.monthlyFee) baseTuition = Number(student.monthlyFee);
        if (baseTuition === 0) baseTuition = 1800;

        // Concession / Discount
        let discount = 0;
        if (student.feeDiscount) {
            const disc = Number(student.feeDiscount);
            if (disc > 0 && disc <= 100) discount = Math.round((baseTuition * disc) / 100);
            else if (disc > 100) discount = disc;
        }
        const netTuition = Math.max(0, baseTuition - discount);

        // 12 Months cycle (April to March)
        const sessionMonths = [];
        for (let m = 3; m <= 11; m++) {
            sessionMonths.push({ monthIdx: m, year: sessionStartYear, name: MONTH_NAMES[m], short: MONTH_SHORT[m] });
        }
        for (let m = 0; m <= 2; m++) {
            sessionMonths.push({ monthIdx: m, year: sessionStartYear + 1, name: MONTH_NAMES[m], short: MONTH_SHORT[m] });
        }

        let calculatedArrears = 0;
        let arrearsMonthsCount = 0;
        const monthsBreakdown = [];

        sessionMonths.forEach((item) => {
            const isCurrent = (item.monthIdx === currentMonthIdx && item.year === currentYear);
            const isPast = (item.year < currentYear) || (item.year === currentYear && item.monthIdx < currentMonthIdx);
            const isFuture = (item.year > currentYear) || (item.year === currentYear && item.monthIdx > currentMonthIdx);

            let isSettled = false;
            if (isCurrent) {
                isSettled = (student.monthlyFeeStatus === 'paid');
            } else {
                isSettled = isMonthSettled(student, item.monthIdx, item.year);
            }

            let statusText = 'UNPAID';
            let paidVal = 0;
            let balanceVal = netTuition;

            if (isSettled) {
                statusText = 'PAID';
                paidVal = netTuition;
                balanceVal = 0;
            } else if (isFuture) {
                statusText = 'UPCOMING';
                paidVal = 0;
                balanceVal = netTuition;
            } else if (isPast) {
                statusText = 'UNPAID';
                paidVal = 0;
                balanceVal = netTuition;
                calculatedArrears += netTuition;
                arrearsMonthsCount += 1;
            } else if (isCurrent) {
                statusText = 'UNPAID';
                paidVal = 0;
                balanceVal = netTuition;
            }

            monthsBreakdown.push({
                monthLabel: `${item.short.toUpperCase()} ${item.year}`,
                amount: netTuition,
                paid: paidVal,
                balance: balanceVal,
                status: statusText,
                isCurrent,
                isPast,
                isFuture
            });
        });

        if (student.previousMonthsUnpaidCount && Number(student.previousMonthsUnpaidCount) > arrearsMonthsCount) {
            arrearsMonthsCount = Number(student.previousMonthsUnpaidCount);
            calculatedArrears = arrearsMonthsCount * netTuition;
        }

        // Action Fee
        let actionFee = 0;
        let actionName = '';
        if (currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(classId)))) {
            const actStatus = student.customPayments?.[currentAction.name]?.status || 'unpaid';
            if (actStatus !== 'paid') {
                actionFee = Number(currentAction.amount || 0);
                actionName = currentAction.name || 'Special Action / Exam Fee';
            }
        }

        // Store Dues
        let storeDues = 0;
        if (Array.isArray(student.storeCharges)) {
            student.storeCharges.forEach(sc => {
                if (sc.status !== 'paid') storeDues += (Number(sc.amount) || 0);
            });
        }

        const currentMonthTuition = (student.monthlyFeeStatus === 'paid') ? 0 : netTuition;
        const totalPayable = currentMonthTuition + calculatedArrears + actionFee + storeDues;
        const lateFine = penaltyAmount > 0 ? penaltyAmount : 200;
        const totalAfterDue = totalPayable + lateFine;

        const primaryBank = (bankingDetails && bankingDetails.length > 0) ? bankingDetails[0] : null;

        const issueDateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
        const dueDateStr = `${String(dueDay).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
        const challanNo = `CHL-${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}-${student.rollNo || (student.id || '').slice(-4).toUpperCase()}`;

        return {
            netTuition,
            calculatedArrears,
            arrearsMonthsCount,
            actionFee,
            actionName,
            storeDues,
            currentMonthTuition,
            totalPayable,
            totalAfterDue,
            lateFine,
            monthsBreakdown,
            billingMonthLabel: `${MONTH_NAMES[currentMonthIdx]} ${currentYear}`.toUpperCase(),
            issueDateStr,
            dueDateStr,
            dueDay,
            challanNo,
            primaryBank
        };
    };

    // --- Print Dual-Copy 12-Month Challans Engine ---
    const handlePrintChallansForStudents = async (studentsToPrint) => {
        if (!studentsToPrint || studentsToPrint.length === 0) {
            alert('Please select at least one student to print challans.');
            return;
        }

        try {
            setIsPrintingChallan(true);

            const logoBase64 = await resolveSchoolLogoForPrint(schoolId, schoolDetails?.logo || '');

            const escapeHtml = (str) => {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };

            const renderCopy = (student, data, isSchoolCopy) => {
                const leftMonths = data.monthsBreakdown.slice(0, 6);
                const rightMonths = data.monthsBreakdown.slice(6, 12);

                const renderRows = (arr) => arr.map(m => `
                    <tr>
                        <td style="font-weight: 700; color: #1e293b;">${m.monthLabel}</td>
                        <td style="text-align: right; color: #334155;">${m.amount.toLocaleString()}</td>
                        <td style="text-align: right; color: ${m.paid > 0 ? '#166534' : '#64748b'}; font-weight: ${m.paid > 0 ? '700' : '400'};">${m.paid.toLocaleString()}</td>
                        <td style="text-align: right; font-weight: 700; color: ${m.balance > 0 ? '#991b1b' : '#166534'};">${m.balance.toLocaleString()}</td>
                        <td style="text-align: center;">
                            <span class="badge-status ${m.status === 'PAID' ? 'badge-paid' : m.status === 'UNPAID' ? 'badge-unpaid' : 'badge-upcoming'}">
                                ${m.status === 'PAID' ? '✓ PAID' : m.status === 'UNPAID' ? '● UNPAID' : 'UPCOMING'}
                            </span>
                        </td>
                    </tr>
                `).join('');

                const sName = escapeHtml(schoolDetails.name || 'OFFICIAL SCHOOL');
                const stName = escapeHtml(student.name || 'Student');
                const fName = escapeHtml(student.parentDetails?.fatherName || student.fatherName || 'Parent / Guardian');
                const cName = escapeHtml(className || 'Class');
                const roll = escapeHtml(student.rollNo || '-');

                return `
                    <div class="challan-copy">
                        <div class="copy-badge ${isSchoolCopy ? 'school-badge' : 'parent-badge'}">
                            ${isSchoolCopy ? '🏛️ SCHOOL / OFFICE COPY' : '👨‍👩‍👧 STUDENT / PARENT COPY'}
                        </div>

                        <!-- School Header Table -->
                        <table class="header-table">
                            <tr>
                                <td class="header-logo-cell">
                                    ${logoBase64 ? `
                                        <img src="${logoBase64}" alt="Logo" class="logo-img" />
                                    ` : `
                                        <div class="logo-initials-badge">
                                            ${(sName || 'SC').slice(0, 2).toUpperCase()}
                                        </div>
                                    `}
                                </td>
                                <td class="header-school-cell">
                                    <div class="school-name">${sName}</div>
                                    <div class="school-sub">
                                        ${schoolDetails.address ? `📍 ${escapeHtml(schoolDetails.address)}` : ''}
                                        ${schoolDetails.phone ? ` • 📞 ${escapeHtml(schoolDetails.phone)}` : ''}
                                    </div>
                                </td>
                                <td class="header-bank-cell">
                                    ${data.primaryBank ? `
                                        <div class="bank-box">
                                            <div class="bank-title">💳 ${escapeHtml(data.primaryBank.bankName || 'Bank Account')}</div>
                                            <div><strong>Title:</strong> ${escapeHtml(data.primaryBank.accountTitle || sName)}</div>
                                            <div><strong>A/C:</strong> ${escapeHtml(data.primaryBank.accountNumber || data.primaryBank.iban || '-')}</div>
                                        </div>
                                    ` : `
                                        <div class="bank-box">
                                            <div class="bank-title">🏛️ School Fee Counter</div>
                                            <div><strong>Hours:</strong> 8:00 AM - 2:00 PM</div>
                                            <div><strong>Desk:</strong> Accounts Office</div>
                                        </div>
                                    `}
                                </td>
                            </tr>
                        </table>

                        <!-- Student Meta Details Grid -->
                        <div class="meta-grid">
                            <div class="meta-item"><span>Student Name:</span> <strong>${stName}</strong></div>
                            <div class="meta-item"><span>Roll No:</span> <strong>${roll}</strong></div>
                            <div class="meta-item"><span>Class:</span> <strong>${cName}</strong></div>
                            <div class="meta-item"><span>Challan #:</span> <strong style="font-family: monospace;">${data.challanNo}</strong></div>
                            <div class="meta-item"><span>Father Name:</span> <strong>${fName}</strong></div>
                            <div class="meta-item"><span>Issue Date:</span> <strong>${data.issueDateStr}</strong></div>
                            <div class="meta-item"><span>Billing Month:</span> <strong>${data.billingMonthLabel}</strong></div>
                            <div class="meta-item"><span>Due Date:</span> <strong class="due-highlight">${data.dueDateStr}</strong></div>
                        </div>

                        <!-- Current Bill Breakdown Table -->
                        <table class="bill-table">
                            <thead>
                                <tr>
                                    <th style="width: 25px; text-align: center;">#</th>
                                    <th>Fee Particulars / Description</th>
                                    <th style="text-align: right; width: 110px;">Amount (PKR)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="text-align: center;">1</td>
                                    <td>Monthly Tuition Fee (${data.billingMonthLabel})</td>
                                    <td style="text-align: right; font-weight: 700;">Rs ${data.currentMonthTuition.toLocaleString()}/-</td>
                                </tr>
                                ${data.calculatedArrears > 0 ? `
                                <tr style="color: #b91c1c;">
                                    <td style="text-align: center;">2</td>
                                    <td>Previous Accumulated Arrears (${data.arrearsMonthsCount} Month${data.arrearsMonthsCount > 1 ? 's' : ''})</td>
                                    <td style="text-align: right; font-weight: 700;">Rs ${data.calculatedArrears.toLocaleString()}/-</td>
                                </tr>
                                ` : ''}
                                ${data.actionFee > 0 ? `
                                <tr>
                                    <td style="text-align: center;">3</td>
                                    <td>${escapeHtml(data.actionName)}</td>
                                    <td style="text-align: right; font-weight: 700;">Rs ${data.actionFee.toLocaleString()}/-</td>
                                </tr>
                                ` : ''}
                                ${data.storeDues > 0 ? `
                                <tr>
                                    <td style="text-align: center;">4</td>
                                    <td>Store / Bookshop Purchases</td>
                                    <td style="text-align: right; font-weight: 700;">Rs ${data.storeDues.toLocaleString()}/-</td>
                                </tr>
                                ` : ''}
                                <tr class="total-row">
                                    <td colspan="2" style="font-weight: 900; color: #166534; text-transform: uppercase;">
                                        Total Payable by Due Date (${data.dueDateStr})
                                    </td>
                                    <td style="text-align: right; font-weight: 900; font-size: 10px; color: #166534;">
                                        Rs ${data.totalPayable.toLocaleString()}/-
                                    </td>
                                </tr>
                                ${data.lateFine > 0 ? `
                                <tr class="late-row">
                                    <td colspan="2" style="font-size: 7.5px; color: #991b1b; font-weight: 700;">
                                        Payable After Due Date (+Rs ${data.lateFine} Late Surcharge)
                                    </td>
                                    <td style="text-align: right; font-weight: 800; font-size: 8.5px; color: #991b1b;">
                                        Rs ${data.totalAfterDue.toLocaleString()}/-
                                    </td>
                                </tr>
                                ` : ''}
                            </tbody>
                        </table>

                        <!-- 12-Month Academic Session Ledger -->
                        <div class="ledger-section-title">
                            <span>Academic Session 12-Months Ledger (April - March)</span>
                            <span style="font-size: 7px; color: #64748b;">(Status Up-To-Date)</span>
                        </div>
                        <div class="ledger-container">
                            <table class="ledger-table">
                                <thead>
                                    <tr>
                                        <th>Month</th>
                                        <th style="text-align: right;">Fee</th>
                                        <th style="text-align: right;">Paid</th>
                                        <th style="text-align: right;">Bal</th>
                                        <th style="text-align: center;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${renderRows(leftMonths)}
                                </tbody>
                            </table>
                            <table class="ledger-table">
                                <thead>
                                    <tr>
                                        <th>Month</th>
                                        <th style="text-align: right;">Fee</th>
                                        <th style="text-align: right;">Paid</th>
                                        <th style="text-align: right;">Bal</th>
                                        <th style="text-align: center;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${renderRows(rightMonths)}
                                </tbody>
                            </table>
                        </div>

                        <!-- Amount in Words & Notes -->
                        <div class="bottom-bar">
                            <div><strong>In Words:</strong> ${numberToWords(data.totalPayable)}</div>
                            <div><span style="color: #b91c1c; font-weight: 700;">Note:</span> Deposit on or before ${data.dueDateStr}.</div>
                        </div>

                        <!-- Signatures Grid -->
                        <div class="signatures-grid">
                            <div class="sig-col">
                                <div class="sig-line">Parent / Depositor Signature</div>
                            </div>
                            <div style="font-size: 6.8px; color: #94a3b8; text-align: center;">
                                Official Computer Generated Voucher • ${isSchoolCopy ? 'School Record' : 'Student Record'}
                            </div>
                            <div class="sig-col">
                                <div class="sig-line">Authorized Cashier / Stamp</div>
                            </div>
                        </div>
                    </div>
                `;
            };

            const studentPagesHtml = studentsToPrint.map((student) => {
                const data = buildStudentSessionChallanData(student);
                return `
                    <div class="challan-page">
                        ${renderCopy(student, data, true)}
                        <div class="cut-divider">
                            <div class="cut-divider-line"></div>
                            <span>✂ CUT HERE • SEPARATE SCHOOL COPY & PARENT COPY ✂</span>
                            <div class="cut-divider-line"></div>
                        </div>
                        ${renderCopy(student, data, false)}
                    </div>
                `;
            }).join('');

            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Fee Challans - ${escapeHtml(className)}</title>
                    <style>
                        @page {
                            size: A4 portrait;
                            margin: 5mm 6mm;
                        }
                        * {
                            box-sizing: border-box;
                            margin: 0;
                            padding: 0;
                        }
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                            color: #0f172a;
                            background: #ffffff;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .challan-page {
                            page-break-after: always;
                            page-break-inside: avoid;
                            height: 285mm;
                            max-height: 285mm;
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                            box-sizing: border-box;
                            padding: 1mm 0;
                        }
                        .challan-page:last-child {
                            page-break-after: auto;
                        }
                        .challan-copy {
                            border: 1.5px solid #0f172a;
                            border-radius: 5px;
                            padding: 5px 8px;
                            background: #ffffff;
                            display: flex;
                            flex-direction: column;
                            gap: 3px;
                            height: 137mm;
                            max-height: 137mm;
                            overflow: hidden;
                            position: relative;
                            box-sizing: border-box;
                        }
                        .copy-badge {
                            position: absolute;
                            top: 5px;
                            right: 6px;
                            font-size: 8px;
                            font-weight: 900;
                            letter-spacing: 0.6px;
                            padding: 2px 7px;
                            border-radius: 3px;
                            text-transform: uppercase;
                        }
                        .school-badge {
                            background: #f1f5f9;
                            color: #1e3a8a;
                            border: 1px solid #93c5fd;
                        }
                        .parent-badge {
                            background: #f0fdf4;
                            color: #166534;
                            border: 1px solid #86efac;
                        }
                        .header-table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 2px;
                        }
                        .header-logo-cell {
                            width: 44px;
                            vertical-align: middle;
                        }
                        .logo-img {
                            width: 42px;
                            height: 42px;
                            object-fit: contain;
                            border-radius: 4px;
                            display: block;
                        }
                        .logo-initials-badge {
                            width: 40px;
                            height: 40px;
                            background: #0078d4;
                            color: #ffffff;
                            font-weight: 900;
                            font-size: 15px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 4px;
                        }
                        .header-school-cell {
                            padding-left: 6px;
                            vertical-align: middle;
                        }
                        .school-name {
                            font-size: 12px;
                            font-weight: 900;
                            color: #0f172a;
                            text-transform: uppercase;
                            letter-spacing: -0.2px;
                            line-height: 1.15;
                        }
                        .school-sub {
                            font-size: 7.5px;
                            color: #475569;
                            line-height: 1.2;
                            margin-top: 1px;
                        }
                        .header-bank-cell {
                            width: 175px;
                            vertical-align: middle;
                            text-align: right;
                            padding-right: 130px;
                        }
                        .bank-box {
                            background: #f8fafc;
                            border: 1px solid #cbd5e1;
                            border-radius: 4px;
                            padding: 3px 6px;
                            font-size: 7.5px;
                            line-height: 1.2;
                            text-align: left;
                            display: inline-block;
                            max-width: 175px;
                        }
                        .bank-title {
                            font-weight: 800;
                            color: #0f172a;
                            font-size: 8px;
                            border-bottom: 0.5px solid #e2e8f0;
                            padding-bottom: 1px;
                            margin-bottom: 1px;
                        }
                        .meta-grid {
                            display: grid;
                            grid-template-columns: repeat(4, 1fr);
                            background: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 4px;
                            padding: 3px 6px;
                            gap: 2px 6px;
                            font-size: 7.8px;
                            line-height: 1.2;
                        }
                        .meta-item span {
                            color: #64748b;
                            font-weight: 600;
                        }
                        .meta-item strong {
                            color: #0f172a;
                            font-weight: 800;
                        }
                        .due-highlight {
                            color: #b91c1c !important;
                            font-weight: 900 !important;
                        }
                        .bill-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 8px;
                            border: 1px solid #cbd5e1;
                            border-radius: 4px;
                            overflow: hidden;
                        }
                        .bill-table th {
                            background: #f1f5f9;
                            padding: 2.5px 5px;
                            text-align: left;
                            font-weight: 800;
                            color: #334155;
                            border-bottom: 1px solid #cbd5e1;
                        }
                        .bill-table td {
                            padding: 2px 5px;
                            border-bottom: 0.5px solid #f1f5f9;
                        }
                        .total-row td {
                            background: #f0fdf4;
                            border-top: 1px solid #86efac;
                            padding: 3px 5px;
                        }
                        .late-row td {
                            background: #fef2f2;
                            border-top: 0.5px solid #fca5a5;
                            padding: 2px 5px;
                        }
                        .ledger-section-title {
                            font-size: 8px;
                            font-weight: 800;
                            color: #1e293b;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-top: 1px;
                            padding: 0 1px;
                        }
                        .ledger-container {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 4px;
                        }
                        .ledger-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 7.2px;
                            border: 1px solid #cbd5e1;
                            border-radius: 3px;
                        }
                        .ledger-table th {
                            background: #f8fafc;
                            padding: 2px 4px;
                            font-weight: 800;
                            color: #475569;
                            border-bottom: 1px solid #cbd5e1;
                        }
                        .ledger-table td {
                            padding: 1.5px 4px;
                            border-bottom: 0.5px solid #f1f5f9;
                        }
                        .badge-status {
                            display: inline-block;
                            padding: 1px 4px;
                            border-radius: 2px;
                            font-size: 6.5px;
                            font-weight: 800;
                            text-transform: uppercase;
                            letter-spacing: 0.3px;
                        }
                        .badge-paid {
                            background: #dcfce7;
                            color: #15803d;
                            border: 0.5px solid #86efac;
                        }
                        .badge-unpaid {
                            background: #fee2e2;
                            color: #b91c1c;
                            border: 0.5px solid #fca5a5;
                        }
                        .badge-upcoming {
                            background: #f1f5f9;
                            color: #64748b;
                            border: 0.5px solid #cbd5e1;
                        }
                        .bottom-bar {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            background: #f8fafc;
                            border: 1px solid #e2e8f0;
                            padding: 2px 6px;
                            border-radius: 3px;
                            font-size: 7.2px;
                        }
                        .signatures-grid {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-end;
                            padding-top: 6px;
                            margin-top: 1px;
                        }
                        .sig-col {
                            text-align: center;
                            width: 140px;
                        }
                        .sig-line {
                            border-top: 1px dashed #64748b;
                            padding-top: 1px;
                            font-size: 7px;
                            font-weight: 700;
                            color: #334155;
                        }
                        .cut-divider {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            padding: 2.5mm 0;
                            color: #64748b;
                            font-size: 7.5px;
                            font-weight: 700;
                        }
                        .cut-divider-line {
                            flex: 1;
                            border-top: 1px dashed #94a3b8;
                        }
                    </style>
                </head>
                <body>
                    ${studentPagesHtml}
                </body>
                </html>
            `;

            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.style.border = 'none';
            iframe.setAttribute('title', 'Print Preview Frame');
            document.body.appendChild(iframe);

            const iframeDoc = iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(fullHtml);
            iframeDoc.close();

            const triggerPrint = () => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (err) {
                    console.error("Print error:", err);
                } finally {
                    setIsPrintingChallan(false);
                    setTimeout(() => {
                        if (document.body.contains(iframe)) document.body.removeChild(iframe);
                    }, 2000);
                }
            };

            const images = iframeDoc.getElementsByTagName('img');
            let loadedImages = 0;
            const totalImages = images.length;

            if (totalImages === 0) {
                setTimeout(triggerPrint, 150);
            } else {
                let printed = false;
                const handleImageLoaded = () => {
                    loadedImages++;
                    if (loadedImages >= totalImages && !printed) {
                        printed = true;
                        setTimeout(triggerPrint, 150);
                    }
                };

                for (let i = 0; i < totalImages; i++) {
                    if (images[i].complete) {
                        loadedImages++;
                    } else {
                        images[i].addEventListener('load', handleImageLoaded);
                        images[i].addEventListener('error', handleImageLoaded);
                    }
                }

                if (loadedImages >= totalImages && !printed) {
                    printed = true;
                    setTimeout(triggerPrint, 150);
                } else {
                    setTimeout(() => {
                        if (!printed) {
                            printed = true;
                            triggerPrint();
                        }
                    }, 2000);
                }
            }
        } catch (err) {
            console.error("Challan generation error:", err);
            setIsPrintingChallan(false);
            alert("Failed to prepare fee challans.");
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

            {/* Search Bar & Filter Controls */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Search Student Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '0.6rem 1rem',
                    gap: '0.65rem',
                    width: '100%',
                    maxWidth: '380px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <Search size={18} color="#64748b" />
                    <input
                        type="text"
                        placeholder="Search student by name or roll no..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            width: '100%',
                            fontSize: '0.9rem',
                            color: 'var(--text-main)',
                            background: 'transparent'
                        }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            style={{
                                background: '#f1f5f9',
                                border: 'none',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#64748b',
                                padding: 0
                            }}
                            title="Clear search"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                {/* Filter Tabs & Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        onClick={() => setActiveTab('all')}
                        style={{
                            padding: '0.6rem 1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                            background: activeTab === 'all' ? 'var(--text-main)' : 'white',
                            color: activeTab === 'all' ? 'white' : 'var(--text-secondary)',
                            cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem'
                        }}
                    >
                        All Students ({students.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('paid')}
                        style={{
                            padding: '0.6rem 1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                            background: activeTab === 'paid' ? '#dcfce7' : 'white',
                            color: activeTab === 'paid' ? '#166534' : 'var(--text-secondary)',
                            cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem'
                        }}
                    >
                        Monthly Paid ({students.filter(s => s.monthlyFeeStatus === 'paid').length})
                    </button>
                    <button
                        onClick={() => setActiveTab('unpaid')}
                        style={{
                            padding: '0.6rem 1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                            background: activeTab === 'unpaid' ? '#fee2e2' : 'white',
                            color: activeTab === 'unpaid' ? '#991b1b' : 'var(--text-secondary)',
                            cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem'
                        }}
                    >
                        Monthly Unpaid ({students.filter(s => (s.monthlyFeeStatus || 'unpaid') === 'unpaid').length})
                    </button>

                    <button
                        onClick={generatePDF}
                        style={{
                            padding: '0.6rem 1.25rem', borderRadius: '10px', border: 'none',
                            background: '#475569',
                            color: 'white',
                            cursor: 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            boxShadow: '0 2px 4px rgba(71, 85, 105, 0.2)',
                            fontSize: '0.9rem'
                        }}
                    >
                        <Filter size={16} /> Download Report
                    </button>

                    {/* Multi-Select Toggle */}
                    <button
                        onClick={handleToggleSelectAll}
                        style={{
                            padding: '0.6rem 0.95rem',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: selectedStudentIds.length > 0 ? '#f0f9ff' : '#ffffff',
                            color: '#1e293b',
                            cursor: 'pointer',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'all 0.15s ease'
                        }}
                        title={selectedStudentIds.length === filteredStudents.length ? 'Deselect All Students' : 'Select All Students'}
                    >
                        {selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0 ? (
                            <CheckSquare size={16} color="#0078d4" />
                        ) : (
                            <Square size={16} color="#94a3b8" />
                        )}
                        <span>{selectedStudentIds.length > 0 ? `Selected (${selectedStudentIds.length})` : 'Select All'}</span>
                    </button>

                    {/* Print Selected Challans Button */}
                    {selectedStudentIds.length > 0 && (
                        <button
                            onClick={() => handlePrintChallansForStudents(filteredStudents.filter(s => selectedStudentIds.includes(s.id)))}
                            disabled={isPrintingChallan}
                            style={{
                                padding: '0.6rem 1.15rem',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                color: 'white',
                                cursor: isPrintingChallan ? 'not-allowed' : 'pointer',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                boxShadow: '0 4px 8px -1px rgba(22, 163, 74, 0.3)',
                                fontSize: '0.88rem'
                            }}
                            title="Print dual-copy challans for checked students only"
                        >
                            {isPrintingChallan ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                            <span>Print Selected ({selectedStudentIds.length})</span>
                        </button>
                    )}

                    {/* Print All Class Challans Button */}
                    <button
                        onClick={() => handlePrintChallansForStudents(filteredStudents)}
                        disabled={isPrintingChallan || filteredStudents.length === 0}
                        style={{
                            padding: '0.6rem 1.25rem',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #0078d4 0%, #0284c7 100%)',
                            color: 'white',
                            cursor: (isPrintingChallan || filteredStudents.length === 0) ? 'not-allowed' : 'pointer',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 10px -1px rgba(0, 120, 212, 0.35)',
                            fontSize: '0.88rem'
                        }}
                        title="Print dual-copy fee challans for all students in this class"
                    >
                        {isPrintingChallan ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                        <span>Print Class Challans ({filteredStudents.length})</span>
                    </button>
                </div>
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
                                {/* Checkbox & 3-Dot Menu Button */}
                                <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedStudentIds.includes(student.id)}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            toggleStudentSelection(student.id);
                                        }}
                                        style={{
                                            width: '18px',
                                            height: '18px',
                                            cursor: 'pointer',
                                            accentColor: '#0078d4',
                                            borderRadius: '4px'
                                        }}
                                        title="Select student for challan printing"
                                    />
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
                                            padding: '0.5rem', minWidth: '185px', zIndex: 10, border: '1px solid #e2e8f0'
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
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMenuStudentId(null);
                                                    handlePrintChallansForStudents([student]);
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                                                    padding: '0.5rem', border: 'none', background: 'transparent',
                                                    textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
                                                    color: 'var(--text-main)', borderRadius: '8px', fontWeight: '500'
                                                }}
                                                className="hover:bg-slate-100"
                                            >
                                                <Printer size={14} color="#0078d4" /> Print Fee Challan
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>Monthly Fee</span>
                                            {/* Previous Month / Arrears Status Indicator */}
                                            {student.previousMonthsUnpaidCount && student.previousMonthsUnpaidCount > 0 ? (
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '800',
                                                    color: '#b91c1c',
                                                    background: '#fee2e2',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #fecaca'
                                                }} title="Previous months unpaid arrears">
                                                    ⚠️ Prev Pending: {student.previousMonthsUnpaidCount} Mos
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '700',
                                                    color: '#15803d',
                                                    background: '#f0fdf4',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #bbf7d0'
                                                }} title="Previous month fee fully cleared">
                                                    ✓ Prev Month: PAID
                                                </span>
                                            )}
                                        </div>
                                        {monthlyStatus === 'paid' && student.monthlyFeeDate && (
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
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

                                            {/* Print 12-Month Challan Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintChallansForStudents([student]);
                                                }}
                                                disabled={isPrintingChallan}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                    padding: '0.35rem 0.65rem', borderRadius: '6px',
                                                    background: '#eff6ff', color: '#0078d4', fontWeight: '700',
                                                    fontSize: '0.75rem', border: '1px solid #bfdbfe', cursor: 'pointer'
                                                }}
                                                title="Print Dual-Copy 12-Month Challan"
                                            >
                                                <Printer size={12} /> Challan
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
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintChallansForStudents([student]);
                                                }}
                                                disabled={isPrintingChallan}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                    padding: '0.35rem 0.75rem', borderRadius: '6px',
                                                    background: '#eff6ff', color: '#0078d4', fontWeight: '700',
                                                    fontSize: '0.8rem', border: '1px solid #bfdbfe', cursor: 'pointer',
                                                    boxShadow: '0 1px 2px rgba(0, 120, 212, 0.08)'
                                                }}
                                                title="Print Dual-Copy 12-Month Challan"
                                            >
                                                <Printer size={12} /> Challan
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

                                {/* 3. Individual Actions & Store Ledger Charges */}
                                {(() => {
                                    const studentActions = (() => {
                                        const list = [...(student.individualActions || [])];
                                        if (student.storeCharges && student.storeCharges.length > 0) {
                                            student.storeCharges.forEach(sc => {
                                                const legacyId = `store_${sc.receiptNo || ''}`;
                                                if (!list.some(a => a.id === legacyId || a.id === sc.receiptNo || a.receiptNo === sc.receiptNo)) {
                                                    list.push({
                                                        id: legacyId,
                                                        name: sc.title || `Store: Books & Uniform (${sc.receiptNo || 'POS'})`,
                                                        amount: Number(sc.amount) || 0,
                                                        status: sc.status || 'unpaid',
                                                        date: sc.date || new Date().toISOString(),
                                                        type: 'store_inventory',
                                                        receiptNo: sc.receiptNo
                                                    });
                                                }
                                            });
                                        }
                                        return list;
                                    })();

                                    if (studentActions.length === 0) return null;

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {studentActions.map(action => {
                                                const isStore = action.type === 'store_inventory' || action.id?.startsWith('store_');
                                                return (
                                                    <div
                                                        key={action.id}
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            background: isStore ? '#f5f3ff' : '#f8fafc',
                                                            padding: '0.75rem',
                                                            borderRadius: '8px',
                                                            border: isStore ? '1px solid #ddd6fe' : '1px solid #e2e8f0'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                {isStore && <span style={{ fontSize: '0.75rem' }}>🛍️</span>}
                                                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: isStore ? '#6d28d9' : '#ec4899' }}>
                                                                    {action.name}
                                                                </span>
                                                            </div>
                                                            <span style={{ fontSize: '0.7rem', color: isStore ? '#7c3aed' : 'var(--text-secondary)', fontWeight: '600' }}>
                                                                Rs {action.amount} {action.status === 'unpaid' ? '• Pending' : '• Paid'}
                                                            </span>
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
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
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
