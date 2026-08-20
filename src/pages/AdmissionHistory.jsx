import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, User, Phone, Mail, MapPin, Calendar, School, Search, Filter,
  Download, Printer, Eye, Edit, ChevronDown, ArrowUpRight, ArrowDownRight,
  Sparkles, FileText, CheckCircle2, RefreshCw, BarChart3, TrendingUp,
  Layers, UserPlus, UserCheck, DollarSign, X, ArrowUpDown, Clock,
  CalendarDays, Award, Baby, CheckCircle, Shield
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, PieChart, Pie, Legend
} from 'recharts';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];

export default function AdmissionHistory() {
  const navigate = useNavigate();
  const [schoolId, setSchoolId] = useState(null);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [parents, setParents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters & Search State
  const [timeFilter, setTimeFilter] = useState('this_month'); // 'this_month', 'last_month', 'this_year', 'all_time', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all'); // 'all', 'fresh', 'sibling'
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'name'

  // Modal / Receipt state for past records
  const [selectedStudentRecord, setSelectedStudentRecord] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Load School & Data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const manualSession = localStorage.getItem('manual_session');
        let currentSchoolId = null;
        if (manualSession) {
          const userData = JSON.parse(manualSession);
          currentSchoolId = userData.schoolId;
          setSchoolId(userData.schoolId);
        }

        if (!currentSchoolId) {
          setIsLoading(false);
          return;
        }

        // 1. Fetch Classes
        const classesQ = query(collection(db, `schools/${currentSchoolId}/classes`));
        const classesSnap = await getDocsFast(classesQ);
        const classList = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setClasses(classList);

        // 2. Fetch Parents
        const parentsQ = query(collection(db, `schools/${currentSchoolId}/parents`));
        const parentsSnap = await getDocsFast(parentsQ);
        const parentList = parentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setParents(parentList);

        // 3. Fetch Master Students Collection
        const studentsQ = query(collection(db, `schools/${currentSchoolId}/students`));
        const studentsSnap = await getDocsFast(studentsQ);
        let studentList = studentsSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data
          };
        });

        // Fallback: If master students collection is empty, aggregate across class subcollections
        if (studentList.length === 0 && classList.length > 0) {
          const classStudentPromises = classList.map(async (cls) => {
            try {
              const subQ = query(collection(db, `schools/${currentSchoolId}/classes/${cls.id}/students`));
              const subSnap = await getDocsFast(subQ);
              return subSnap.docs.map(sd => ({
                id: sd.id,
                classId: cls.id,
                className: cls.name,
                ...sd.data()
              }));
            } catch {
              return [];
            }
          });
          const nestedResults = await Promise.all(classStudentPromises);
          studentList = nestedResults.flat();
        }

        setStudents(studentList);
      } catch (err) {
        console.error('Error fetching admission history data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [refreshKey]);

  // Helper: Extract Valid Timestamp
  const getStudentDate = (stu) => {
    if (stu.createdAt) {
      if (typeof stu.createdAt.toDate === 'function') {
        return stu.createdAt.toDate();
      }
      if (stu.createdAt.seconds) {
        return new Date(stu.createdAt.seconds * 1000);
      }
      const parsed = new Date(stu.createdAt);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  };

  // Helper: Determine if a student is a Sibling admission
  const parentMap = useMemo(() => {
    const map = new Map();
    parents.forEach(p => {
      map.set(p.id, p);
      if (p.phone) map.set(p.phone, p);
    });
    return map;
  }, [parents]);

  const studentsWithMetadata = useMemo(() => {
    // Group students by parent identifier to detect siblings
    const parentChildrenCount = new Map();

    students.forEach(s => {
      const pId = s.parentDetails?.parentId || s.parentId;
      const pPhone = s.parentDetails?.phone || s.phone;
      const key = pId || pPhone;
      if (key) {
        parentChildrenCount.set(key, (parentChildrenCount.get(key) || 0) + 1);
      }
    });

    return students.map(stu => {
      const date = getStudentDate(stu);
      const pId = stu.parentDetails?.parentId || stu.parentId;
      const pPhone = stu.parentDetails?.phone || stu.phone;
      const key = pId || pPhone;
      
      const parentObj = pId ? parentMap.get(pId) : (pPhone ? parentMap.get(pPhone) : null);
      const totalLinked = parentObj?.linkedStudents?.length || parentChildrenCount.get(key) || 1;
      
      const isSibling = totalLinked > 1;

      // Resolve Class Name accurately
      const cId = stu.classId || stu.admissionClass;
      const matchedClass = classes.find(c => c.id === cId || c.id === stu.className);
      const resolvedClassName = matchedClass ? matchedClass.name : (stu.className || 'General');

      // Extract Admission Fee
      let admissionFee = 0;
      let tuitionFee = 0;
      if (Array.isArray(stu.feeStructure)) {
        stu.feeStructure.forEach(f => {
          const lower = (f.name || '').toLowerCase();
          if (lower.includes('admission')) admissionFee += Number(f.amount || 0);
          if (lower.includes('tuition')) tuitionFee += Number(f.amount || 0);
        });
      }
      if (Array.isArray(stu.individualActions)) {
        stu.individualActions.forEach(f => {
          const lower = (f.name || '').toLowerCase();
          if (lower.includes('admission')) admissionFee += Number(f.amount || 0);
        });
      }

      return {
        ...stu,
        className: resolvedClassName,
        classId: cId || stu.classId,
        admissionDate: date,
        isSibling,
        admissionFee,
        tuitionFee,
        parentProfile: parentObj
      };
    });
  }, [students, parents, parentMap, classes]);

  // Date Range Filtering
  const filteredByDateStudents = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return studentsWithMetadata.filter(stu => {
      const d = stu.admissionDate;
      if (!d) return false;

      if (timeFilter === 'this_month') {
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      } else if (timeFilter === 'last_month') {
        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
        return d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
      } else if (timeFilter === 'this_year') {
        return d.getFullYear() === currentYear;
      } else if (timeFilter === 'custom') {
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          return d >= start && d <= end;
        }
        return true;
      }
      return true; // 'all_time'
    });
  }, [studentsWithMetadata, timeFilter, customStartDate, customEndDate]);

  // Previous Period comparison (for KPI growth metrics)
  const previousPeriodCount = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (timeFilter === 'this_month') {
      const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
      return studentsWithMetadata.filter(stu => {
        const d = stu.admissionDate;
        return d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
      }).length;
    } else if (timeFilter === 'this_year') {
      return studentsWithMetadata.filter(stu => {
        const d = stu.admissionDate;
        return d.getFullYear() === currentYear - 1;
      }).length;
    }
    return null;
  }, [studentsWithMetadata, timeFilter]);

  // KPI Calculations
  const totalAdmitted = filteredByDateStudents.length;
  const freshIntake = filteredByDateStudents.filter(s => !s.isSibling).length;
  const siblingIntake = filteredByDateStudents.filter(s => s.isSibling).length;

  const totalAdmissionRevenue = useMemo(() => {
    return filteredByDateStudents.reduce((acc, s) => acc + (s.admissionFee || 0), 0);
  }, [filteredByDateStudents]);

  // Top Class
  const topClassInfo = useMemo(() => {
    const classCount = {};
    filteredByDateStudents.forEach(s => {
      const cName = s.className || 'Unassigned';
      classCount[cName] = (classCount[cName] || 0) + 1;
    });
    let topName = 'N/A';
    let topCount = 0;
    Object.entries(classCount).forEach(([name, count]) => {
      if (count > topCount) {
        topCount = count;
        topName = name;
      }
    });
    return { name: topName, count: topCount };
  }, [filteredByDateStudents]);

  // Search & Secondary Filtered List (for Table)
  const displayedStudents = useMemo(() => {
    return filteredByDateStudents.filter(stu => {
      // Search
      const search = searchTerm.toLowerCase().trim();
      const name = (stu.name || `${stu.firstName || ''} ${stu.lastName || ''}`).toLowerCase();
      const rollNo = (stu.rollNo || '').toLowerCase();
      const admNo = (stu.admissionNo || '').toLowerCase();
      const father = (stu.parentDetails?.fatherName || stu.parentProfile?.name || '').toLowerCase();
      const phone = (stu.parentDetails?.phone || stu.parentProfile?.phone || '').toLowerCase();
      const className = (stu.className || '').toLowerCase();

      const matchesSearch = !search || 
        name.includes(search) || 
        rollNo.includes(search) || 
        admNo.includes(search) || 
        father.includes(search) || 
        phone.includes(search) || 
        className.includes(search);

      if (!matchesSearch) return false;

      // Class Filter
      if (selectedClassFilter !== 'all') {
        if (stu.classId !== selectedClassFilter && stu.className !== selectedClassFilter) {
          return false;
        }
      }

      // Type Filter
      if (selectedTypeFilter === 'fresh' && stu.isSibling) return false;
      if (selectedTypeFilter === 'sibling' && !stu.isSibling) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') return b.admissionDate - a.admissionDate;
      if (sortBy === 'oldest') return a.admissionDate - b.admissionDate;
      if (sortBy === 'name') {
        const nameA = (a.name || a.firstName || '').toLowerCase();
        const nameB = (b.name || b.firstName || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }
      return 0;
    });
  }, [filteredByDateStudents, searchTerm, selectedClassFilter, selectedTypeFilter, sortBy]);

  // Chart 1: Class-Wise Intake
  const classChartData = useMemo(() => {
    const map = {};
    classes.forEach(c => {
      map[c.name] = { className: c.name, fresh: 0, sibling: 0, total: 0 };
    });

    filteredByDateStudents.forEach(s => {
      const cName = s.className || 'Other';
      if (!map[cName]) {
        map[cName] = { className: cName, fresh: 0, sibling: 0, total: 0 };
      }
      if (s.isSibling) {
        map[cName].sibling += 1;
      } else {
        map[cName].fresh += 1;
      }
      map[cName].total += 1;
    });

    return Object.values(map).filter(item => item.total > 0);
  }, [filteredByDateStudents, classes]);

  // Chart 2: Timeline Trend Flow
  const timelineChartData = useMemo(() => {
    const dateMap = {};

    filteredByDateStudents.forEach(s => {
      const d = s.admissionDate;
      let label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (timeFilter === 'this_year' || timeFilter === 'all_time') {
        label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }
      if (!dateMap[label]) {
        dateMap[label] = { date: label, count: 0, fresh: 0, sibling: 0, rawDate: d.getTime() };
      }
      dateMap[label].count += 1;
      if (s.isSibling) dateMap[label].sibling += 1;
      else dateMap[label].fresh += 1;
    });

    return Object.values(dateMap).sort((a, b) => a.rawDate - b.rawDate);
  }, [filteredByDateStudents, timeFilter]);

  // Chart 3: Intake Ratio (Donut)
  const intakeRatioData = useMemo(() => {
    return [
      { name: 'Fresh Families', value: freshIntake, color: '#10b981' },
      { name: 'Sibling Admissions', value: siblingIntake, color: '#6366f1' },
    ].filter(item => item.value > 0);
  }, [freshIntake, siblingIntake]);

  // Export to CSV
  const handleExportCSV = () => {
    if (displayedStudents.length === 0) {
      alert('No admission records to export.');
      return;
    }

    const headers = ['Admission Date', 'Admission No', 'Roll No', 'Student Name', 'Class', 'Gender', 'Father Name', 'Phone', 'Type', 'Admission Fee (PKR)', 'Tuition Fee (PKR)'];
    const rows = displayedStudents.map(s => [
      `"${s.admissionDate.toLocaleDateString()} ${s.admissionDate.toLocaleTimeString()}"`,
      `"${s.admissionNo || 'N/A'}"`,
      `"${s.rollNo || 'N/A'}"`,
      `"${s.name || `${s.firstName || ''} ${s.lastName || ''}`}"`,
      `"${s.className || 'N/A'}"`,
      `"${s.gender || 'N/A'}"`,
      `"${s.parentDetails?.fatherName || s.parentProfile?.name || 'N/A'}"`,
      `"${s.parentDetails?.phone || s.parentProfile?.phone || 'N/A'}"`,
      `"${s.isSibling ? 'Sibling Enrolled' : 'Fresh Admission'}"`,
      `"${s.admissionFee || 0}"`,
      `"${s.tuitionFee || 0}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Admissions_Report_${timeFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open Past Receipt Modal
  const handleOpenReceipt = (stu) => {
    setSelectedStudentRecord(stu);
    setReceiptData({
      schoolName: localStorage.getItem("schoolName") || "Our School",
      schoolPhone: localStorage.getItem("schoolPhone") || "+1 234 567 8900",
      schoolEmergencyPhone: localStorage.getItem("schoolEmergencyPhone") || "+1 987 654 3210",
      schoolAddress: localStorage.getItem("schoolAddress") || "123 Education Street, City, Country",
      schoolLogo: localStorage.getItem("schoolLogo") || "",
      date: stu.admissionDate.toLocaleDateString(),
      time: stu.admissionDate.toLocaleTimeString(),
      parentName: stu.parentDetails?.fatherName || stu.parentProfile?.name || "Parent",
      parentPhone: stu.parentDetails?.phone || stu.parentProfile?.phone || "N/A",
      parentEmail: stu.parentDetails?.email || stu.parentProfile?.email || "N/A",
      parentPassword: stu.parentDetails?.password || "********",
      students: [
        {
          name: stu.name || `${stu.firstName || ''} ${stu.lastName || ''}`,
          className: stu.className || 'Class',
          rollNo: stu.rollNo || 'N/A',
          admissionNo: stu.admissionNo || 'N/A',
          feeStructure: stu.feeStructure || [],
          individualActions: stu.individualActions || []
        }
      ]
    });
    setShowReceiptModal(true);
  };

  // Download PDF
  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const elements = document.querySelectorAll(".admission-receipt-history");
      if (!elements || elements.length === 0) return;

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
        });
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeight);
      }

      pdf.save(`Admission_Receipt_${selectedStudentRecord?.name || 'Student'}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  // State for Ledger PDF generation
  const [isGeneratingLedgerPDF, setIsGeneratingLedgerPDF] = useState(false);

  const getBase64ImageFromUrl = async (imageUrl) => {
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn("Could not load logo for PDF:", e);
      return null;
    }
  };

  const handleDownloadLedgerPDF = async () => {
    if (displayedStudents.length === 0) {
      alert("No student records to export.");
      return;
    }

    setIsGeneratingLedgerPDF(true);
    try {
      // Landscape A4 orientation for spacious, clear table presentation
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const schoolName = (localStorage.getItem("schoolName") || "MAI SMS ACADEMY").toUpperCase();
      const schoolLogo = localStorage.getItem("schoolLogo") || "";
      const schoolAddress = localStorage.getItem("schoolAddress") || "Official Educational Campus";
      const schoolPhone = localStorage.getItem("schoolPhone") || "+92 300 1234567";

      // 1. Top Decorative Header Banner
      doc.setFillColor(30, 27, 75); // Dark Indigo #1e1b4b
      doc.rect(0, 0, pageWidth, 36, 'F');

      doc.setFillColor(67, 56, 202); // Vibrant Indigo Accent Bar #4338ca
      doc.rect(0, 36, pageWidth, 2.5, 'F');

      let textStartX = 14;

      // School Logo Embedding
      if (schoolLogo) {
        const base64Img = await getBase64ImageFromUrl(schoolLogo);
        if (base64Img) {
          try {
            doc.addImage(base64Img, 'PNG', 14, 6, 24, 24);
            textStartX = 44;
          } catch (imgErr) {
            console.warn("Image embed failed:", imgErr);
          }
        }
      }

      // School Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(255, 255, 255);
      doc.text(schoolName, textStartX, 14);

      // Report Subtitle
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(165, 180, 252); // Indigo-200
      doc.text("OFFICIAL STUDENT ADMISSIONS & ENROLLMENT LEDGER", textStartX, 22);

      // School Address & Contact info
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(226, 232, 240); // Slate-200
      doc.text(`${schoolAddress}  |  Contact: ${schoolPhone}`, textStartX, 29);

      // Generation Metadata on Top Right
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(199, 210, 254);
      const timeframeLabel = timeFilter === 'this_month' ? 'This Month' : timeFilter === 'last_month' ? 'Last Month' : timeFilter === 'this_year' ? 'This Year' : timeFilter === 'custom' ? `Custom Range (${customStartDate || 'Start'} to ${customEndDate || 'End'})` : 'All Time';
      doc.text(`Timeframe: ${timeframeLabel}`, pageWidth - 14, 13, { align: 'right' });
      doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, pageWidth - 14, 20, { align: 'right' });
      doc.text(`Total Records: ${displayedStudents.length} Students`, pageWidth - 14, 27, { align: 'right' });

      // 2. Executive KPI Summary Box
      let currentY = 43;

      const summaryTableData = [
        [
          { content: `Total Admissions: ${totalAdmitted} Students`, styles: { fontStyle: 'bold', textColor: [67, 56, 202] } },
          { content: `Fresh Families: ${freshIntake} (${totalAdmitted > 0 ? Math.round((freshIntake / totalAdmitted) * 100) : 0}%)`, styles: { fontStyle: 'bold', textColor: [16, 185, 129] } },
          { content: `Sibling Intake: ${siblingIntake} (${totalAdmitted > 0 ? Math.round((siblingIntake / totalAdmitted) * 100) : 0}%)`, styles: { fontStyle: 'bold', textColor: [14, 165, 233] } },
          { content: `Top Class: ${topClassInfo.name} (${topClassInfo.count})`, styles: { fontStyle: 'bold', textColor: [217, 119, 6] } },
          { content: `Admission Revenue: PKR ${totalAdmissionRevenue.toLocaleString()}`, styles: { fontStyle: 'bold', textColor: [124, 58, 237] } },
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        body: summaryTableData,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3.5, halign: 'center' },
        tableLineColor: [203, 213, 225],
        tableLineWidth: 0.2,
      });

      currentY = doc.lastAutoTable.finalY + 4;

      // 3. Main Data Table
      const headers = [
        ['#', 'Date', 'Student Name', 'Roll No', 'Adm No', 'Class', 'Gender', 'Father / Guardian', 'Contact No', 'Intake Type', 'Adm. Fee', 'Tuition Fee']
      ];

      let sumAdmFee = 0;
      let sumTuitionFee = 0;

      const tableRows = displayedStudents.map((s, idx) => {
        sumAdmFee += (s.admissionFee || 0);
        sumTuitionFee += (s.tuitionFee || 0);

        const dateStr = s.admissionDate ? `${s.admissionDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}` : 'N/A';
        const nameStr = s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
        const parentStr = s.parentDetails?.fatherName || s.parentProfile?.name || 'N/A';
        const phoneStr = s.parentDetails?.phone || s.parentProfile?.phone || 'N/A';

        return [
          (idx + 1).toString(),
          dateStr,
          nameStr,
          s.rollNo || 'N/A',
          s.admissionNo || 'N/A',
          s.className || 'N/A',
          s.gender || 'N/A',
          parentStr,
          phoneStr,
          s.isSibling ? 'Sibling' : 'Fresh',
          s.admissionFee ? `Rs ${s.admissionFee.toLocaleString()}` : '-',
          s.tuitionFee ? `Rs ${s.tuitionFee.toLocaleString()}` : '-'
        ];
      });

      // Add Total Summary Footer Row
      tableRows.push([
        { content: 'TOTALS', colSpan: 10, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } },
        { content: `Rs ${sumAdmFee.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [124, 58, 237] } },
        { content: `Rs ${sumTuitionFee.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } }
      ]);

      autoTable(doc, {
        startY: currentY,
        head: headers,
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [67, 56, 202], // Indigo-700
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'left',
          cellPadding: 3.5
        },
        styles: {
          fontSize: 8,
          cellPadding: 2.8,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.1
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { cellWidth: 22 },
          2: { fontStyle: 'bold', cellWidth: 38 },
          3: { cellWidth: 20 },
          4: { cellWidth: 22 },
          5: { fontStyle: 'bold', cellWidth: 24 },
          6: { cellWidth: 16 },
          7: { cellWidth: 35 },
          8: { cellWidth: 26 },
          9: { halign: 'center', cellWidth: 22 },
          10: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
          11: { halign: 'right', cellWidth: 24 }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didDrawPage: (data) => {
          // Bottom Page Footer
          const pageNum = doc.internal.getNumberOfPages();
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184); // Slate-400
          doc.text(
            `Official Student Admission Ledger  •  Principal Administrative Portal  •  Confidential`,
            14,
            pageHeight - 6
          );
          doc.text(
            `Page ${data.pageNumber} of ${doc.internal.pages.length - 1}`,
            pageWidth - 14,
            pageHeight - 6,
            { align: 'right' }
          );
        }
      });

      // Save PDF
      const fileName = `Admissions_Ledger_Report_${timeFilter}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error("Failed to generate Ledger PDF:", error);
      alert("Failed to generate PDF report. Please try again.");
    } finally {
      setIsGeneratingLedgerPDF(false);
    }
  };

  return (
    <div className="w-full px-4 md:px-8 py-6 animate-fade-in-up font-sans">
      
      {/* 1. TOP CONTROL & TIMEFRAME BAR */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-sm mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        {/* Time Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-slate-400 uppercase mr-1 flex items-center gap-1.5">
            <Clock size={14} className="text-indigo-600" /> Timeframe:
          </span>

          {[
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'this_year', label: 'This Year' },
            { id: 'all_time', label: 'All Time' },
            { id: 'custom', label: 'Custom Range' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setTimeFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-200 flex items-center gap-1.5 ${
                timeFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all text-xs font-semibold flex items-center gap-1.5"
            title="Refresh Records"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin text-indigo-600' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs md:text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs md:text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Printer size={15} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Custom Date Picker (if selected) */}
      {timeFilter === 'custom' && (
        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-4 animate-fade-in-up">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-indigo-600" />
            <span className="text-xs font-bold text-indigo-900 uppercase">Select Date Range:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
            />
          </div>
        </div>
      )}

      {/* 2. EXECUTIVE KPI CARDS (MATCHED WITH DASHBOARD THEME) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        
        {/* Total Admissions (Indigo / Purple Gradient) */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
            color: 'white',
            boxShadow: '0 18px 24px -5px rgba(99, 102, 241, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '160px'
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-15%',
            right: '-10%',
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.12)',
            borderRadius: '32px',
            transform: 'rotate(20deg)',
            zIndex: 1
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <Users size={24} color="white" />
            </div>
            {previousPeriodCount !== null && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: '700',
                background: 'rgba(255,255,255,0.2)',
                padding: '3px 8px',
                borderRadius: '8px',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <TrendingUp size={12} /> {previousPeriodCount} prev
              </span>
            )}
          </div>

          <div style={{ position: 'relative', zIndex: 2, marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.25rem', letterSpacing: '0.02em' }}>
              Total Admissions
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                {totalAdmitted}
              </h3>
              <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>students</span>
            </div>
          </div>
        </div>

        {/* Fresh Family Intake (Emerald Green Gradient) */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            color: 'white',
            boxShadow: '0 18px 24px -5px rgba(16, 185, 129, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '160px'
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-15%',
            right: '-10%',
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.12)',
            borderRadius: '32px',
            transform: 'rotate(20deg)',
            zIndex: 1
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <UserPlus size={24} color="white" />
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              background: 'rgba(255,255,255,0.2)',
              padding: '3px 8px',
              borderRadius: '8px',
              color: 'white'
            }}>
              {totalAdmitted > 0 ? Math.round((freshIntake / totalAdmitted) * 100) : 0}% share
            </span>
          </div>

          <div style={{ position: 'relative', zIndex: 2, marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.25rem', letterSpacing: '0.02em' }}>
              Fresh Students
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                {freshIntake}
              </h3>
              <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>new families</span>
            </div>
          </div>
        </div>

        {/* Sibling Admissions (Sky Blue Gradient) */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
            color: 'white',
            boxShadow: '0 18px 24px -5px rgba(14, 165, 233, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '160px'
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-15%',
            right: '-10%',
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.12)',
            borderRadius: '32px',
            transform: 'rotate(20deg)',
            zIndex: 1
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <Baby size={24} color="white" />
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              background: 'rgba(255,255,255,0.2)',
              padding: '3px 8px',
              borderRadius: '8px',
              color: 'white'
            }}>
              {totalAdmitted > 0 ? Math.round((siblingIntake / totalAdmitted) * 100) : 0}% retention
            </span>
          </div>

          <div style={{ position: 'relative', zIndex: 2, marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.25rem', letterSpacing: '0.02em' }}>
              Sibling Intake
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                {siblingIntake}
              </h3>
              <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>siblings</span>
            </div>
          </div>
        </div>

        {/* Top Admitted Class (Amber Gold Gradient) */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
            color: 'white',
            boxShadow: '0 18px 24px -5px rgba(245, 158, 11, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '160px'
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-15%',
            right: '-10%',
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.12)',
            borderRadius: '32px',
            transform: 'rotate(20deg)',
            zIndex: 1
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <Award size={24} color="white" />
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              background: 'rgba(255,255,255,0.2)',
              padding: '3px 8px',
              borderRadius: '8px',
              color: 'white'
            }}>
              {topClassInfo.count} enrolled
            </span>
          </div>

          <div style={{ position: 'relative', zIndex: 2, marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.25rem', letterSpacing: '0.02em' }}>
              Top Admitted Class
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.6rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {topClassInfo.name}
              </h3>
            </div>
          </div>
        </div>

        {/* Admission Revenue (Purple / Violet Gradient) */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
            color: 'white',
            boxShadow: '0 18px 24px -5px rgba(139, 92, 246, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '160px'
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-15%',
            right: '-10%',
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.12)',
            borderRadius: '32px',
            transform: 'rotate(20deg)',
            zIndex: 1
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <DollarSign size={24} color="white" />
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              background: 'rgba(255,255,255,0.2)',
              padding: '3px 8px',
              borderRadius: '8px',
              color: 'white'
            }}>
              Revenue
            </span>
          </div>

          <div style={{ position: 'relative', zIndex: 2, marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.25rem', letterSpacing: '0.02em' }}>
              Admission Fees
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: '700', opacity: 0.9 }}>Rs</span>
              <h3 style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                {totalAdmissionRevenue.toLocaleString()}
              </h3>
            </div>
          </div>
        </div>

      </div>

      {/* 3. VISUAL CHARTS & ANALYTICS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Class-wise Breakdown Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm md:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-indigo-600" /> Class-Wise Admissions Distribution
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Enrollment intake segmented by each class level</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1 text-emerald-600"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Fresh</span>
              <span className="flex items-center gap-1 text-indigo-600"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Sibling</span>
            </div>
          </div>

          <div className="h-72 w-full">
            {classChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="className" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '12px' }}
                    formatter={(val, name) => [val, name === 'fresh' ? 'Fresh Intake' : 'Sibling Intake']}
                  />
                  <Bar dataKey="fresh" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="sibling" stackId="a" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Users size={32} className="text-slate-300 mb-2" />
                No admissions data recorded in this period.
              </div>
            )}
          </div>
        </div>

        {/* Intake Ratio & Breakdown (Donut) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" /> Intake Composition
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Fresh vs Sibling Family Ratio</p>
          </div>

          <div className="h-64 w-full my-auto flex items-center justify-center">
            {intakeRatioData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={intakeRatioData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {intakeRatioData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(val, name) => [`${val} (${Math.round((val / totalAdmitted) * 100)}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">No data available</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
            <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
              <span className="text-[11px] font-bold text-emerald-800 uppercase block">Fresh Students</span>
              <span className="text-base font-extrabold text-emerald-600">{freshIntake}</span>
            </div>
            <div className="bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100">
              <span className="text-[11px] font-bold text-indigo-800 uppercase block">Sibling Enrollees</span>
              <span className="text-base font-extrabold text-indigo-600">{siblingIntake}</span>
            </div>
          </div>
        </div>

      </div>

      {/* 4. SEARCH, FILTER & RECORD LEDGER */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mb-8">
        
        {/* Ledger Header Controls */}
        <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50/50">
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              {displayedStudents.length}
            </div>
            <div>
              <h3 className="text-sm md:text-base font-extrabold text-slate-900">Enrolled Students Ledger</h3>
              <p className="text-[11px] text-slate-400">Showing all records matching your active filters</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 md:flex-none">
              <input
                type="text"
                placeholder="Search by student, roll, parent, phone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-400 outline-none placeholder:text-slate-400"
              />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Class Filter */}
            <select
              value={selectedClassFilter}
              onChange={e => setSelectedClassFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white outline-none text-slate-700"
            >
              <option value="all">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Type Filter */}
            <select
              value={selectedTypeFilter}
              onChange={e => setSelectedTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white outline-none text-slate-700"
            >
              <option value="all">All Family Types</option>
              <option value="fresh">Fresh Intake Only</option>
              <option value="sibling">Sibling Enrolled Only</option>
            </select>

            {/* Sort Order */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white outline-none text-slate-700"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name (A-Z)</option>
            </select>

            {/* Download PDF Report Button */}
            <button
              onClick={handleDownloadLedgerPDF}
              disabled={isGeneratingLedgerPDF || displayedStudents.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-200 disabled:opacity-50 hover:shadow-md cursor-pointer"
              title="Download Custom PDF Report with School Branding & Summary"
            >
              {isGeneratingLedgerPDF ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              <span>{isGeneratingLedgerPDF ? "Generating..." : "Download PDF Report"}</span>
            </button>

          </div>

        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              Loading admission history records...
            </div>
          ) : displayedStudents.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <Users size={32} className="mx-auto mb-2 text-slate-300" />
              No admissions found matching the current criteria.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-100/60 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Parent / Contact</th>
                  <th className="py-3 px-4">Intake Type</th>
                  <th className="py-3 px-4">Admission Date</th>
                  <th className="py-3 px-4 text-right">Fee Package</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedStudents.map((stu, idx) => {
                  const studentName = stu.name || `${stu.firstName || ''} ${stu.lastName || ''}`.trim() || 'Student';
                  const parentName = stu.parentDetails?.fatherName || stu.parentProfile?.name || 'Guardian';
                  const parentPhone = stu.parentDetails?.phone || stu.parentProfile?.phone || 'N/A';

                  return (
                    <tr key={stu.id || idx} className="hover:bg-slate-50/80 transition-all duration-150">
                      
                      {/* Student Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 text-white flex items-center justify-center font-extrabold text-xs shadow-sm overflow-hidden flex-shrink-0">
                            {stu.profilePic || stu.avatar ? (
                              <img src={stu.profilePic || stu.avatar} alt={studentName} className="w-full h-full object-cover" />
                            ) : (
                              studentName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 block text-xs md:text-sm hover:text-indigo-600 transition-colors">
                              {studentName}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                              <span>Roll: <strong className="text-slate-600 font-semibold">{stu.rollNo || 'N/A'}</strong></span>
                              {stu.admissionNo && (
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600">{stu.admissionNo}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Class */}
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs inline-block border border-indigo-100">
                          {stu.className || 'Class'}
                        </span>
                      </td>

                      {/* Parent */}
                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-bold">{parentName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone size={11} /> {parentPhone}
                        </div>
                      </td>

                      {/* Intake Type */}
                      <td className="py-3 px-4">
                        {stu.isSibling ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px]">
                            <Baby size={12} /> Sibling Enrolled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                            <UserCheck size={12} /> Fresh Admission
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4">
                        <span className="text-slate-700 font-semibold block text-xs">
                          {stu.admissionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {stu.admissionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      {/* Fee Structure */}
                      <td className="py-3 px-4 text-right">
                        {stu.admissionFee > 0 ? (
                          <span className="font-extrabold text-violet-700 block text-xs">
                            Rs {stu.admissionFee.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">Adm. Fee</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Standard Intake</span>
                        )}
                        {stu.tuitionFee > 0 && (
                          <span className="text-[10px] text-slate-500 block">
                            Tuition: Rs {stu.tuitionFee.toLocaleString()}/mo
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenReceipt(stu)}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-all"
                            title="View Official Receipt"
                          >
                            <Eye size={15} />
                          </button>
                          {stu.classId && stu.id && (
                            <button
                              onClick={() => navigate(`/student/edit/${stu.classId}/${stu.id}`)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
                              title="Edit Student Profile"
                            >
                              <Edit size={15} />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* 5. OFFICIAL RECEIPT REPRINT MODAL */}
      {showReceiptModal && receiptData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 md:p-8 animate-fade-in">
          
          {/* Controls Bar */}
          <div className="fixed top-5 right-5 flex flex-col gap-2 z-[100]">
            <button
              onClick={() => setShowReceiptModal(false)}
              className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
            >
              <X size={24} />
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-105 font-bold text-xs md:text-sm"
            >
              <Download size={18} />
              <span>{isDownloading ? 'Saving...' : 'Save PDF'}</span>
            </button>
          </div>

          {/* Receipt Canvas */}
          <div className="w-full max-w-[760px] bg-white rounded-3xl shadow-2xl overflow-hidden my-6 border border-slate-200 admission-receipt-history">
            
            {/* Top Wave Decor */}
            <div className="h-4 bg-gradient-to-r from-indigo-500 via-blue-600 to-indigo-700" />

            <div className="p-6 md:p-10">
              
              {/* Header */}
              <div className="text-center border-b-2 border-slate-100 pb-6 mb-6">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  {receiptData.schoolName.toUpperCase()}
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><Phone size={13} className="text-indigo-600" /> {receiptData.schoolPhone}</span>
                  <span className="flex items-center gap-1"><MapPin size={13} className="text-indigo-600" /> {receiptData.schoolAddress}</span>
                </div>
                <div className="mt-3 inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-bold text-xs tracking-widest uppercase">
                  Official Admission Record
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">Admission Timestamp</span>
                  <div className="text-xs font-bold text-slate-800">Date: {receiptData.date}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Time: {receiptData.time}</div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">Parent / Guardian</span>
                  <div className="text-xs font-bold text-slate-800">{receiptData.parentName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Contact: {receiptData.parentPhone}</div>
                </div>
              </div>

              {/* Student Details & Fees */}
              <div className="mb-6">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">Enrolled Student & Assigned Structure</h4>
                {receiptData.students.map((stu, i) => (
                  <div key={i} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">{stu.name.toUpperCase()}</h3>
                        <span className="text-xs font-bold text-indigo-600">{stu.className}</span>
                      </div>
                      <div className="text-right text-xs">
                        <div>Roll No: <strong className="font-mono">{stu.rollNo || 'N/A'}</strong></div>
                        <div>Adm No: <strong className="font-mono">{stu.admissionNo || 'N/A'}</strong></div>
                      </div>
                    </div>

                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-200 text-[10px] font-bold uppercase">
                          <th className="py-1 text-left">Fee Category</th>
                          <th className="py-1 text-right">Amount (PKR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stu.feeStructure.map((f, idx) => (
                          <tr key={idx} className="py-1">
                            <td className="py-1.5 font-medium text-slate-700">{f.name}</td>
                            <td className="py-1.5 text-right font-bold text-slate-900">Rs {Number(f.amount).toLocaleString()}</td>
                          </tr>
                        ))}
                        {stu.individualActions.map((f, idx) => (
                          <tr key={idx} className="py-1">
                            <td className="py-1.5 font-medium text-slate-700">{f.name} (Action)</td>
                            <td className="py-1.5 text-right font-bold text-slate-900">Rs {Number(f.amount).toLocaleString()}</td>
                          </tr>
                        ))}
                        {stu.feeStructure.length === 0 && stu.individualActions.length === 0 && (
                          <tr>
                            <td colSpan="2" className="py-2 text-center text-slate-400 italic">No custom fees recorded</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="text-center pt-4 border-t border-slate-100 text-xs text-slate-400">
                <p className="font-bold text-slate-600">Verified by Principal Portal</p>
                <p className="text-[10px] mt-0.5">Official Student Enrollment Record • Generated for administrative purposes</p>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
