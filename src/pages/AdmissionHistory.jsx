import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, User, Phone, Mail, MapPin, Calendar, School, Search, Filter,
  Download, Printer, Eye, Edit, ChevronDown, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight,
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

// Module-level in-memory cache to ensure ZERO duplicate Firestore DB reads across view toggles
let memoryHistoryCache = {
  schoolId: null,
  classes: null,
  parents: null,
  students: null,
  timestamp: 0
};

export default function AdmissionHistory() {
  const navigate = useNavigate();
  const [schoolId, setSchoolId] = useState(null);
  const [students, setStudents] = useState(() => memoryHistoryCache.students || []);
  const [classes, setClasses] = useState(() => memoryHistoryCache.classes || []);
  const [parents, setParents] = useState(() => memoryHistoryCache.parents || []);
  const [isLoading, setIsLoading] = useState(() => !memoryHistoryCache.students);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters & Search State
  const [timeFilter, setTimeFilter] = useState('this_month'); // 'this_month', 'last_month', 'this_year', 'all_time', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all'); // 'all', 'fresh', 'sibling'
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'name'

  // Pagination State for Super-Fast Table Rendering
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25); // 25 records per page

  // Reset pagination when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [timeFilter, customStartDate, customEndDate, searchTerm, selectedClassFilter, selectedTypeFilter, sortBy]);

  // Modal / Receipt state for past records
  const [selectedStudentRecord, setSelectedStudentRecord] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [modalPos, setModalPos] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Load School & Data (Fast Offline-First with In-Memory Cache)
  useEffect(() => {
    let isMounted = true;

    const fetchData = async (forceRefresh = false) => {
      try {
        const manualSession = localStorage.getItem('manual_session');
        let currentSchoolId = null;
        if (manualSession) {
          const userData = JSON.parse(manualSession);
          currentSchoolId = userData.schoolId;
          if (isMounted) setSchoolId(userData.schoolId);
        }

        if (!currentSchoolId) {
          if (isMounted) setIsLoading(false);
          return;
        }

        // Check if we have active in-memory cache for this school and no force refresh requested
        if (!forceRefresh && memoryHistoryCache.schoolId === currentSchoolId && memoryHistoryCache.students) {
          if (isMounted) {
            setClasses(memoryHistoryCache.classes);
            setParents(memoryHistoryCache.parents);
            setStudents(memoryHistoryCache.students);
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) setIsLoading(true);

        // 1. Fetch Classes
        const classesQ = query(collection(db, `schools/${currentSchoolId}/classes`));
        const classesSnap = await getDocsFast(classesQ);
        const classList = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (isMounted) setClasses(classList);

        // 2. Fetch Parents
        const parentsQ = query(collection(db, `schools/${currentSchoolId}/parents`));
        const parentsSnap = await getDocsFast(parentsQ);
        const parentList = parentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (isMounted) setParents(parentList);

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

        // Save to memory cache for zero DB reads on subsequent filter clicks/tab switches
        memoryHistoryCache = {
          schoolId: currentSchoolId,
          classes: classList,
          parents: parentList,
          students: studentList,
          timestamp: Date.now()
        };

        if (isMounted) setStudents(studentList);
      } catch (err) {
        console.error('Error fetching admission history data:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchData(refreshKey > 0);

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  // Helper: Extract Valid Timestamp (Instant parse)
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

  // Helper: O(1) Fast Class Lookup Map
  const classMap = useMemo(() => {
    const map = new Map();
    classes.forEach(c => {
      if (c.id) map.set(c.id, c.name);
      if (c.name) map.set(c.name, c.name);
    });
    return map;
  }, [classes]);

  // Helper: O(1) Fast Parent Lookup Map
  const parentMap = useMemo(() => {
    const map = new Map();
    parents.forEach(p => {
      if (p.id) map.set(p.id, p);
      if (p.phone) map.set(p.phone, p);
    });
    return map;
  }, [parents]);

  // Fast pre-calculated students with O(1) lookups
  const studentsWithMetadata = useMemo(() => {
    // Group students by parent identifier to detect siblings in O(N)
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
      const totalLinked = parentObj?.linkedStudents?.length || (key ? parentChildrenCount.get(key) : 1) || 1;
      const isSibling = totalLinked > 1;

      // O(1) Fast Class Resolution
      const cId = stu.classId || stu.admissionClass;
      const resolvedClassName = (cId && classMap.get(cId)) || stu.className || 'General';

      // Extract Admission & Tuition Fee
      let admissionFee = 0;
      let tuitionFee = 0;
      if (Array.isArray(stu.feeStructure)) {
        for (let i = 0; i < stu.feeStructure.length; i++) {
          const f = stu.feeStructure[i];
          const lower = (f.name || '').toLowerCase();
          if (lower.includes('admission')) admissionFee += Number(f.amount || 0);
          if (lower.includes('tuition')) tuitionFee += Number(f.amount || 0);
        }
      }
      if (Array.isArray(stu.individualActions)) {
        for (let i = 0; i < stu.individualActions.length; i++) {
          const f = stu.individualActions[i];
          const lower = (f.name || '').toLowerCase();
          if (lower.includes('admission')) admissionFee += Number(f.amount || 0);
        }
      }

      return {
        ...stu,
        className: resolvedClassName,
        classId: cId || stu.classId,
        admissionDate: date,
        admissionTimestamp: date.getTime(),
        admissionYear: date.getFullYear(),
        admissionMonth: date.getMonth(),
        isSibling,
        admissionFee,
        tuitionFee,
        parentProfile: parentObj
      };
    });
  }, [students, parentMap, classMap]);

  // Instant Date Range Filtering (<1ms)
  const filteredByDateStudents = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (timeFilter === 'this_month') {
      return studentsWithMetadata.filter(stu => stu.admissionYear === currentYear && stu.admissionMonth === currentMonth);
    } else if (timeFilter === 'last_month') {
      const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
      const targetYear = lastMonthDate.getFullYear();
      const targetMonth = lastMonthDate.getMonth();
      return studentsWithMetadata.filter(stu => stu.admissionYear === targetYear && stu.admissionMonth === targetMonth);
    } else if (timeFilter === 'this_year') {
      return studentsWithMetadata.filter(stu => stu.admissionYear === currentYear);
    } else if (timeFilter === 'custom') {
      if (customStartDate && customEndDate) {
        const start = new Date(customStartDate).setHours(0, 0, 0, 0);
        const end = new Date(customEndDate).setHours(23, 59, 59, 999);
        return studentsWithMetadata.filter(stu => stu.admissionTimestamp >= start && stu.admissionTimestamp <= end);
      }
      return studentsWithMetadata;
    }
    return studentsWithMetadata; // 'all_time'
  }, [studentsWithMetadata, timeFilter, customStartDate, customEndDate]);

  // Previous Period comparison (for KPI growth metrics)
  const previousPeriodCount = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (timeFilter === 'this_month') {
      const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
      const targetYear = lastMonthDate.getFullYear();
      const targetMonth = lastMonthDate.getMonth();
      return studentsWithMetadata.filter(stu => stu.admissionYear === targetYear && stu.admissionMonth === targetMonth).length;
    } else if (timeFilter === 'this_year') {
      const prevYear = currentYear - 1;
      return studentsWithMetadata.filter(stu => stu.admissionYear === prevYear).length;
    }
    return null;
  }, [studentsWithMetadata, timeFilter]);

  // KPI Calculations (Instant)
  const totalAdmitted = filteredByDateStudents.length;
  const freshIntake = useMemo(() => filteredByDateStudents.filter(s => !s.isSibling).length, [filteredByDateStudents]);
  const siblingIntake = useMemo(() => filteredByDateStudents.filter(s => s.isSibling).length, [filteredByDateStudents]);

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

  // Search & Secondary Filtered List (for Table & Full Exports)
  const displayedStudents = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return filteredByDateStudents.filter(stu => {
      // Search
      if (search) {
        const name = (stu.name || `${stu.firstName || ''} ${stu.lastName || ''}`).toLowerCase();
        const rollNo = (stu.rollNo || '').toLowerCase();
        const admNo = (stu.admissionNo || '').toLowerCase();
        const father = (stu.parentDetails?.fatherName || stu.parentProfile?.name || '').toLowerCase();
        const phone = (stu.parentDetails?.phone || stu.parentProfile?.phone || '').toLowerCase();
        const className = (stu.className || '').toLowerCase();

        const matchesSearch = 
          name.includes(search) || 
          rollNo.includes(search) || 
          admNo.includes(search) || 
          father.includes(search) || 
          phone.includes(search) || 
          className.includes(search);

        if (!matchesSearch) return false;
      }

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
      if (sortBy === 'newest') return b.admissionTimestamp - a.admissionTimestamp;
      if (sortBy === 'oldest') return a.admissionTimestamp - b.admissionTimestamp;
      if (sortBy === 'name') {
        const nameA = (a.name || a.firstName || '').toLowerCase();
        const nameB = (b.name || b.firstName || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }
      return 0;
    });
  }, [filteredByDateStudents, searchTerm, selectedClassFilter, selectedTypeFilter, sortBy]);

  // Paginated Students (Instant slice for DOM rendering)
  const totalPages = Math.max(1, Math.ceil(displayedStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return displayedStudents.slice(startIndex, startIndex + pageSize);
  }, [displayedStudents, currentPage, pageSize]);

  // Chart 1: Class-Wise Intake (Optimized)
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

  // Chart 2: Intake Ratio (Donut)
  const intakeRatioData = useMemo(() => {
    return [
      { name: 'Fresh Families', value: freshIntake, color: '#10b981' },
      { name: 'Sibling Admissions', value: siblingIntake, color: '#6366f1' },
    ].filter(item => item.value > 0);
  }, [freshIntake, siblingIntake]);

  // Export to CSV (Exports ALL filtered records)
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
  const handleOpenReceipt = (stu, e) => {
    if (e && e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const popupWidth = Math.min(520, window.innerWidth - 48);
      const popupHeight = Math.min(600, window.innerHeight - 48);

      let right = (window.innerWidth - rect.left) + 16;
      if (right < 24) right = 24;
      if (window.innerWidth - right - popupWidth < 24) {
        right = window.innerWidth - popupWidth - 24;
      }

      let top = (rect.top + (rect.height / 2)) - (popupHeight / 2);
      if (top < 24) top = 24;
      if (top + popupHeight > window.innerHeight - 24) {
        top = Math.max(24, window.innerHeight - popupHeight - 24);
      }

      setModalPos({ top, right, width: popupWidth, maxHeight: popupHeight });
    } else {
      setModalPos(null);
    }

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

  // Download Single Receipt PDF
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

  const fetchSafeLogoBase64 = async (imageUrl) => {
    if (!imageUrl || typeof imageUrl !== 'string') return '';
    const cleanUrl = imageUrl.trim();
    if (cleanUrl.startsWith('data:image/')) return cleanUrl;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(cleanUrl, { mode: 'cors', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const blob = await res.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {}

    try {
      const pUrl = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl.replace(/^https?:\/\//, ''))}&output=png`;
      const res = await fetch(pUrl);
      if (res.ok) {
        const blob = await res.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {}

    return cleanUrl;
  };

  const resolveSchoolLogoForPrint = async (sId = schoolId) => {
    const activeSchoolId = sId || (localStorage.getItem("manual_session") ? JSON.parse(localStorage.getItem("manual_session"))?.schoolId : null);

    let rawLogo = "";
    if (activeSchoolId) {
      rawLogo = localStorage.getItem(`school_logo_base64_${activeSchoolId}`) || "";
    }
    if (!rawLogo) {
      rawLogo = localStorage.getItem("schoolLogo") || "";
    }
    if (!rawLogo) {
      try {
        const sess = JSON.parse(localStorage.getItem("manual_session") || "{}");
        rawLogo = sess.profileImage || sess.logo || sess.schoolLogo || "";
      } catch (e) {}
    }

    if (!rawLogo && activeSchoolId) {
      try {
        const profileRef = doc(db, `schools/${activeSchoolId}/settings`, "profile");
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const pData = profileSnap.data();
          rawLogo = pData.profileImage || pData.logo || pData.schoolLogo || pData.logoUrl || "";
        }
        if (!rawLogo) {
          const rootRef = doc(db, "schools", activeSchoolId);
          const rootSnap = await getDoc(rootRef);
          if (rootSnap.exists()) {
            const rData = rootSnap.data();
            rawLogo = rData.profileImage || rData.logo || rData.schoolLogo || rData.logoUrl || "";
          }
        }
      } catch (err) {}
    }

    let logoBase64 = rawLogo;
    if (rawLogo && typeof rawLogo === "string" && !rawLogo.startsWith("data:image/")) {
      const b64 = await fetchSafeLogoBase64(rawLogo);
      if (b64 && b64.startsWith("data:image/")) {
        logoBase64 = b64;
        if (activeSchoolId) {
          try {
            localStorage.setItem(`school_logo_base64_${activeSchoolId}`, b64);
          } catch (e) {}
        }
      }
    }

    return logoBase64;
  };

  const handlePrintAdmissionsReport = async () => {
    if (displayedStudents.length === 0) {
      alert("No student admission records to print.");
      return;
    }

    const schoolName = (localStorage.getItem("schoolName") || "MAI SMS ACADEMY").toUpperCase();
    const logoBase64 = await resolveSchoolLogoForPrint(schoolId);
    const schoolAddress = localStorage.getItem("schoolAddress") || "";
    const schoolPhone = localStorage.getItem("schoolPhone") || "";

    const oldFrame = document.getElementById("admissions-report-print-frame");
    if (oldFrame) oldFrame.remove();

    const printFrame = document.createElement("iframe");
    printFrame.id = "admissions-report-print-frame";
    printFrame.style.position = "fixed";
    printFrame.style.top = "-10000px";
    printFrame.style.left = "-10000px";
    printFrame.style.width = "297mm";
    printFrame.style.height = "210mm";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admissions_Report_${new Date().toISOString().split('T')[0]}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 8mm 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            width: 100% !important;
            font-size: 11px;
          }
          .report-container {
            width: 100%;
          }
          .header-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2.5px solid #1e293b;
            padding-bottom: 8px;
            margin-bottom: 10px;
          }
          .kpi-strip {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 12px;
          }
          .kpi-card {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 6px 10px;
            text-align: center;
          }
          table.report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-bottom: 16px;
          }
          table.report-table th, table.report-table td {
            border: 1px solid #cbd5e1;
            padding: 5px 6px;
          }
          table.report-table th {
            background: #f1f5f9;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
            font-size: 9px;
          }
          .signature-strip {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 25px;
            padding: 0 30px;
          }
        </style>
      </head>
      <body>
        <div class="report-container">
          <div class="header-banner">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${logoBase64 ? `
                <div style="width: 50px; height: 50px; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #ffffff;">
                  <img src="${logoBase64}" style="width: 100%; height: 100%; object-fit: contain;" alt="Logo" />
                </div>
              ` : ''}
              <div>
                <div style="font-size: 17px; font-weight: 900; color: #1e1b4b; text-transform: uppercase;">${schoolName}</div>
                <div style="font-size: 10px; color: #475569; font-weight: 600;">
                  ${schoolAddress ? `${schoolAddress} • ` : ''}${schoolPhone ? `Tel: ${schoolPhone}` : ''}
                </div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="display: inline-block; background: #4f46e5; color: #ffffff; font-weight: 800; font-size: 11px; padding: 3px 12px; border-radius: 4px; text-transform: uppercase;">
                Student Admissions Register & Report
              </div>
              <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 3px;">
                Printed On: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} • Filter: ${timeFilter.replace('_', ' ').toUpperCase()}
              </div>
            </div>
          </div>

          <div class="kpi-strip">
            <div class="kpi-card">
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Total Admissions</div>
              <div style="font-size: 15px; font-weight: 900; color: #4338ca; margin-top: 2px;">${displayedStudents.length}</div>
            </div>
            <div class="kpi-card">
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Fresh Intake</div>
              <div style="font-size: 15px; font-weight: 900; color: #059669; margin-top: 2px;">${displayedStudents.filter(s => !s.isSibling).length}</div>
            </div>
            <div class="kpi-card">
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Sibling Intake</div>
              <div style="font-size: 15px; font-weight: 900; color: #d97706; margin-top: 2px;">${displayedStudents.filter(s => s.isSibling).length}</div>
            </div>
            <div class="kpi-card">
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Total Adm. Fee Volume</div>
              <div style="font-size: 15px; font-weight: 900; color: #0284c7; margin-top: 2px;">Rs ${displayedStudents.reduce((sum, s) => sum + (Number(s.admissionFee) || 0), 0).toLocaleString()}</div>
            </div>
          </div>

          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th style="width: 75px;">Date</th>
                <th>Student Full Name</th>
                <th style="width: 65px; text-align: center;">Roll No</th>
                <th style="width: 85px; text-align: center;">Adm No</th>
                <th style="width: 90px;">Class</th>
                <th>Father / Guardian Name</th>
                <th style="width: 95px;">Contact</th>
                <th style="width: 80px; text-align: center;">Intake Type</th>
                <th style="width: 90px; text-align: right;">Adm Fee</th>
              </tr>
            </thead>
            <tbody>
              ${displayedStudents.map((stu, i) => {
                const sName = stu.name || `${stu.firstName || ''} ${stu.lastName || ''}`.trim() || 'Student';
                const pName = stu.parentDetails?.fatherName || stu.parentProfile?.name || 'Guardian';
                const pPhone = stu.parentDetails?.phone || stu.parentProfile?.phone || 'N/A';
                const dateStr = stu.admissionDate ? stu.admissionDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                return `
                  <tr>
                    <td style="text-align: center; color: #64748b;">${i + 1}</td>
                    <td>${dateStr}</td>
                    <td style="font-weight: 700; color: #0f172a;">${sName}</td>
                    <td style="text-align: center; font-family: monospace;">${stu.rollNo || '-'}</td>
                    <td style="text-align: center; font-family: monospace;">${stu.admissionNo || '-'}</td>
                    <td>${stu.className || '-'}</td>
                    <td>${pName}</td>
                    <td>${pPhone}</td>
                    <td style="text-align: center; font-weight: 700; color: ${stu.isSibling ? '#4338ca' : '#059669'};">
                      ${stu.isSibling ? 'Sibling' : 'Fresh'}
                    </td>
                    <td style="text-align: right; font-weight: 700;">
                      ${stu.admissionFee > 0 ? `Rs ${Number(stu.admissionFee).toLocaleString()}` : '-'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="signature-strip">
            <div style="text-align: center; width: 170px;">
              <div style="border-top: 1.5px solid #0f172a; padding-top: 4px; font-weight: 700; font-size: 10px;">Admission Officer</div>
            </div>
            <div style="text-align: center; width: 170px;">
              <div style="border-top: 1.5px solid #0f172a; padding-top: 4px; font-weight: 700; font-size: 10px;">Accounts Officer</div>
            </div>
            <div style="text-align: center; width: 190px;">
              <div style="border-top: 1.5px solid #0f172a; padding-top: 4px; font-weight: 700; font-size: 10px;">Principal Signature & Seal</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    frameDoc.close();

    const checkImagesAndPrint = () => {
      const imgs = frameDoc.images;
      let loaded = 0;
      const finish = () => {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch (err) {
          console.error("Print report error:", err);
        } finally {
          setTimeout(() => printFrame.remove(), 2500);
        }
      };

      if (!imgs || imgs.length === 0) {
        finish();
        return;
      }

      for (let i = 0; i < imgs.length; i++) {
        if (imgs[i].complete && imgs[i].naturalWidth !== 0) {
          loaded++;
        } else {
          imgs[i].onload = () => {
            loaded++;
            if (loaded >= imgs.length) finish();
          };
          imgs[i].onerror = () => {
            loaded++;
            if (loaded >= imgs.length) finish();
          };
        }
      }

      if (loaded >= imgs.length) {
        setTimeout(finish, 100);
      } else {
        setTimeout(finish, 2200);
      }
    };

    setTimeout(checkImagesAndPrint, 150);
  };

  const handlePrintStudentAdmissionForm = async (stu) => {
    if (!stu) return;

    const schoolName = (localStorage.getItem("schoolName") || "MAI SMS ACADEMY").toUpperCase();
    const logoBase64 = await resolveSchoolLogoForPrint(schoolId);
    const schoolAddress = localStorage.getItem("schoolAddress") || "";
    const schoolPhone = localStorage.getItem("schoolPhone") || "";
    const schoolEmergency = localStorage.getItem("schoolEmergencyPhone") || "";

    const studentName = stu.name || `${stu.firstName || ''} ${stu.lastName || ''}`.trim() || 'Student';
    const parentName = stu.parentDetails?.fatherName || stu.parentProfile?.name || 'Guardian';
    const parentPhone = stu.parentDetails?.phone || stu.parentProfile?.phone || 'N/A';
    const parentEmail = stu.parentDetails?.email || stu.parentProfile?.email || 'N/A';
    const parentAddress = stu.parentDetails?.address || stu.parentProfile?.address || stu.address || 'N/A';
    const parentCnic = stu.parentDetails?.cnic || stu.parentProfile?.cnic || 'N/A';
    const parentOccupation = stu.parentDetails?.occupation || stu.parentProfile?.occupation || 'N/A';
    const studentPhoto = stu.profilePic || stu.avatar || "";

    const oldFrame = document.getElementById("student-admission-form-frame");
    if (oldFrame) oldFrame.remove();

    const printFrame = document.createElement("iframe");
    printFrame.id = "student-admission-form-frame";
    printFrame.style.position = "fixed";
    printFrame.style.top = "-10000px";
    printFrame.style.left = "-10000px";
    printFrame.style.width = "210mm";
    printFrame.style.height = "297mm";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admission_Form_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            width: 100% !important;
            font-size: 11px;
            line-height: 1.35;
          }
          .form-container {
            width: 100%;
            height: 284mm;
            border: 2px solid #1e293b;
            padding: 10px 14px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #1e293b;
            padding-bottom: 8px;
            margin-bottom: 6px;
          }
          .section-title {
            background: #f1f5f9;
            color: #0f172a;
            font-weight: 800;
            font-size: 10.5px;
            text-transform: uppercase;
            padding: 3px 8px;
            border-left: 4px solid #4f46e5;
            margin-top: 5px;
            margin-bottom: 5px;
            letter-spacing: 0.5px;
            display: flex;
            justify-content: space-between;
          }
          .field-row {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            font-size: 10.5px;
          }
          .field-label {
            font-weight: 700;
            color: #334155;
            white-space: nowrap;
          }
          .field-val {
            font-weight: 700;
            color: #0f172a;
            padding: 0 4px;
            border-bottom: 1px solid #64748b;
            margin: 0 8px 0 4px;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-top: 3px;
            margin-bottom: 4px;
          }
          table.data-table th, table.data-table td {
            border: 1px solid #cbd5e1;
            padding: 4px 6px;
            text-align: left;
          }
          table.data-table th {
            background: #f8fafc;
            font-weight: 700;
            color: #334155;
          }
          .office-box {
            border: 1.5px solid #1e293b;
            background: #f8fafc;
            padding: 6px 10px;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="form-container">
          <div>
            <table class="header-table">
              <tr>
                <td style="width: 75px; vertical-align: middle; text-align: center;">
                  ${logoBase64 ? `
                    <div style="width: 65px; height: 65px; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 0 auto; background: #ffffff;">
                      <img src="${logoBase64}" style="width: 100%; height: 100%; object-fit: contain;" alt="Logo" />
                    </div>
                  ` : `
                    <div style="width: 65px; height: 65px; border: 1.5px solid #cbd5e1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; color: #4f46e5; background: #eef2ff; margin: 0 auto;">
                      ${schoolName.substring(0, 4)}
                    </div>
                  `}
                </td>
                <td style="vertical-align: middle; padding-left: 12px; text-align: left;">
                  <div style="font-size: 18px; font-weight: 900; color: #1e1b4b; text-transform: uppercase;">${schoolName}</div>
                  <div style="font-size: 10px; font-weight: 600; color: #475569; margin-top: 2px;">
                    ${schoolAddress ? `${schoolAddress} • ` : ''}${schoolPhone ? `Tel: ${schoolPhone}` : ''}${schoolEmergency ? ` • Mob: ${schoolEmergency}` : ''}
                  </div>
                  <div style="display: inline-block; background: #4f46e5; color: #ffffff; font-weight: 800; font-size: 11px; padding: 2px 10px; border-radius: 4px; margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase;">
                    Official Student Admission & Enrollment Dossier
                  </div>
                </td>
                <td style="width: 95px; vertical-align: top; text-align: right;">
                  <div style="width: 90px; height: 105px; border: 1.5px solid #64748b; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #ffffff;">
                    ${studentPhoto ? `<img src="${studentPhoto}" style="width: 100%; height: 100%; object-fit: cover;" alt="Photo" />` : `<span style="font-size: 8px; color: #64748b; font-weight: 700; text-align: center; padding: 4px;">STUDENT PHOTOGRAPH</span>`}
                  </div>
                </td>
              </tr>
            </table>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 10.5px; font-weight: 700;">
              <div>Admission / Reg. No: <strong style="color: #4338ca; font-size: 12px; border-bottom: 1.5px solid #4338ca; padding: 0 4px;">${stu.admissionNo || stu.id?.substring(0, 10) || 'ENROLLED'}</strong></div>
              <div>Roll Number: <strong style="border-bottom: 1.5px solid #0f172a; padding: 0 6px;">${stu.rollNo || 'Assigned'}</strong></div>
              <div>Admission Date: <strong style="border-bottom: 1.5px solid #0f172a; padding: 0 4px;">${stu.admissionDate ? stu.admissionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString()}</strong></div>
            </div>

            <!-- SECTION 1: CANDIDATE PARTICULARS -->
            <div class="section-title">
              <span>1. Student Particulars</span>
              <span style="font-size: 9px; font-weight: 700; color: #059669;">Verified Record</span>
            </div>

            <div class="field-row">
              <span class="field-label">Student Full Name:</span>
              <span class="field-val" style="flex: 3; font-size: 12px; text-transform: uppercase;">${studentName}</span>
              <span class="field-label">Gender:</span>
              <span class="field-val" style="width: 90px;">${stu.gender ? (stu.gender.charAt(0).toUpperCase() + stu.gender.slice(1)) : 'Male'}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Enrolled Class:</span>
              <span class="field-val" style="flex: 1.5; color: #4338ca; font-weight: 900;">${stu.className || 'Class'}</span>
              <span class="field-label">Date of Birth:</span>
              <span class="field-val" style="flex: 1.2;">${stu.dob || 'On Record'}</span>
              <span class="field-label">B-Form / CNIC:</span>
              <span class="field-val" style="flex: 1.8;">${stu.cnic || stu.bForm || 'Verified'}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Intake Category:</span>
              <span class="field-val" style="flex: 1.5;">${stu.isSibling ? 'Sibling Enrolled' : 'Fresh Admission'}</span>
              <span class="field-label">Previous School:</span>
              <span class="field-val" style="flex: 2.5;">${stu.previousSchool || 'Direct / New Student'}</span>
            </div>

            <!-- SECTION 2: PARENT / GUARDIAN INFORMATION -->
            <div class="section-title">
              <span>2. Parent / Guardian Information</span>
            </div>

            <div class="field-row">
              <span class="field-label">Father / Guardian Name:</span>
              <span class="field-val" style="flex: 2; text-transform: uppercase;">${parentName}</span>
              <span class="field-label">Father CNIC:</span>
              <span class="field-val" style="flex: 1.5;">${parentCnic}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Occupation / Profession:</span>
              <span class="field-val" style="flex: 1.5;">${parentOccupation}</span>
              <span class="field-label">Primary Mobile:</span>
              <span class="field-val" style="flex: 1.5;">${parentPhone}</span>
              <span class="field-label">Email:</span>
              <span class="field-val" style="flex: 1.5;">${parentEmail}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Residential Address:</span>
              <span class="field-val" style="flex: 3;">${parentAddress}</span>
            </div>

            <!-- SECTION 3: FEE STRUCTURE -->
            <div class="section-title">
              <span>3. Assigned Fee Package & Intake Charges</span>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th style="width: 120px; text-align: center;">Frequency</th>
                  <th style="width: 120px; text-align: right;">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                ${stu.admissionFee > 0 ? `
                  <tr>
                    <td style="font-weight: 700;">Admission / Registration Fee</td>
                    <td style="text-align: center; color: #64748b;">One Time</td>
                    <td style="text-align: right; font-weight: 800; color: #4338ca;">Rs ${Number(stu.admissionFee).toLocaleString()}</td>
                  </tr>
                ` : ''}
                ${stu.tuitionFee > 0 ? `
                  <tr>
                    <td style="font-weight: 700;">Tuition Fee</td>
                    <td style="text-align: center; color: #64748b;">Monthly Recurring</td>
                    <td style="text-align: right; font-weight: 800;">Rs ${Number(stu.tuitionFee).toLocaleString()}</td>
                  </tr>
                ` : ''}
                ${(stu.feeStructure || []).filter(f => f.name !== 'Tuition fee' && f.name !== 'Admission fee').map(f => `
                  <tr>
                    <td>${f.name}</td>
                    <td style="text-align: center; color: #64748b;">Assigned Structure</td>
                    <td style="text-align: right; font-weight: 700;">Rs ${Number(f.amount).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <!-- SECTION 4: UNDERTAKING / DECLARATION -->
            <div class="section-title">
              <span>4. Institutional Undertaking & Agreement</span>
            </div>
            <div style="font-size: 9px; color: #334155; line-height: 1.4; text-align: justify; margin: 3px 0 6px;">
              The undersigned parent/guardian solemnly affirms that this student has been admitted in accordance with official institutional admission policies. We abide by all school regulations, academic integrity guidelines, attendance mandates, and timely fee deposits.
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding: 0 10px;">
              <div style="text-align: center; width: 170px;">
                <div style="border-top: 1.5px solid #0f172a; padding-top: 3px; font-weight: 700; font-size: 9.5px;">Parent / Guardian Signature</div>
              </div>
              <div style="text-align: center; width: 140px;">
                <div style="border-top: 1.5px solid #0f172a; padding-top: 3px; font-weight: 700; font-size: 9.5px;">Enrollment Date</div>
              </div>
              <div style="text-align: center; width: 170px;">
                <div style="border-top: 1.5px solid #0f172a; padding-top: 3px; font-weight: 700; font-size: 9.5px;">Student Signature</div>
              </div>
            </div>
          </div>

          <!-- SECTION 5: FOR OFFICIAL USE ONLY -->
          <div class="office-box">
            <div style="font-weight: 900; font-size: 10px; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 4px; display: flex; justify-content: space-between;">
              <span>Official Institutional Approval & Sanction</span>
              <span style="color: #059669; font-weight: 900;">Status: ADMITTED & ENROLLED</span>
            </div>
            <div style="display: flex; gap: 15px; font-size: 10px; margin-bottom: 6px;">
              <div style="flex: 1;">Allotted Class: <strong>${stu.className || 'Class'}</strong></div>
              <div style="flex: 1;">Roll Number: <strong>${stu.rollNo || '-'}</strong></div>
              <div style="flex: 1;">Admission ID: <strong>${stu.admissionNo || '-'}</strong></div>
              <div style="flex: 1;">Intake Mode: <strong>${stu.isSibling ? 'Sibling' : 'Fresh'}</strong></div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; padding: 12px 10px 2px;">
              <div style="text-align: center; width: 150px;">
                <div style="border-top: 1.2px solid #0f172a; padding-top: 2px; font-size: 9.5px; font-weight: 700;">Admission Incharge</div>
              </div>
              <div style="text-align: center; width: 150px;">
                <div style="border-top: 1.2px solid #0f172a; padding-top: 2px; font-size: 9.5px; font-weight: 700;">Accounts Office</div>
              </div>
              <div style="text-align: center; width: 170px;">
                <div style="border-top: 1.2px solid #0f172a; padding-top: 2px; font-size: 9.5px; font-weight: 700;">Principal Stamp & Signature</div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    frameDoc.close();

    const checkImagesAndPrint = () => {
      const imgs = frameDoc.images;
      let loaded = 0;
      const finish = () => {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch (err) {
          console.error("Print student form error:", err);
        } finally {
          setTimeout(() => printFrame.remove(), 2500);
        }
      };

      if (!imgs || imgs.length === 0) {
        finish();
        return;
      }

      for (let i = 0; i < imgs.length; i++) {
        if (imgs[i].complete && imgs[i].naturalWidth !== 0) {
          loaded++;
        } else {
          imgs[i].onload = () => {
            loaded++;
            if (loaded >= imgs.length) finish();
          };
          imgs[i].onerror = () => {
            loaded++;
            if (loaded >= imgs.length) finish();
          };
        }
      }

      if (loaded >= imgs.length) {
        setTimeout(finish, 100);
      } else {
        setTimeout(finish, 2200);
      }
    };

    setTimeout(checkImagesAndPrint, 150);
  };

  const handlePrintSingleReceipt = (stu) => {
    const el = document.querySelector(".admission-receipt-history");
    if (!el) return;

    const oldFrame = document.getElementById("admission-receipt-history-frame");
    if (oldFrame) oldFrame.remove();

    const printFrame = document.createElement("iframe");
    printFrame.id = "admission-receipt-history-frame";
    printFrame.style.position = "fixed";
    printFrame.style.top = "-10000px";
    printFrame.style.left = "-10000px";
    printFrame.style.width = "210mm";
    printFrame.style.height = "297mm";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admission_Receipt_${stu?.name || 'Student'}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            width: 100% !important;
          }
          .receipt-wrap {
            max-width: 600px;
            margin: 0 auto;
            border: 1.5px solid #cbd5e1;
            border-radius: 12px;
            padding: 20px;
            background: #ffffff;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 6px 8px;
            border-bottom: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="receipt-wrap">
          ${el.innerHTML}
        </div>
      </body>
      </html>
    `);
    frameDoc.close();

    const triggerPrint = () => {
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch (err) {
        console.error("Print receipt error:", err);
      } finally {
        setTimeout(() => printFrame.remove(), 2500);
      }
    };

    setTimeout(triggerPrint, 350);
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
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const schoolName = (localStorage.getItem("schoolName") || "MAI SMS ACADEMY").toUpperCase();
      const schoolLogo = localStorage.getItem("schoolLogo") || "";
      const schoolAddress = localStorage.getItem("schoolAddress") || "Official Educational Campus";
      const schoolPhone = localStorage.getItem("schoolPhone") || "+92 300 1234567";

      // 1. Top Decorative Header Banner
      doc.setFillColor(30, 27, 75);
      doc.rect(0, 0, pageWidth, 36, 'F');

      doc.setFillColor(67, 56, 202);
      doc.rect(0, 36, pageWidth, 2.5, 'F');

      let textStartX = 14;

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
      doc.setTextColor(165, 180, 252);
      doc.text("OFFICIAL STUDENT ADMISSIONS & ENROLLMENT LEDGER", textStartX, 22);

      // Contact info
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(226, 232, 240);
      doc.text(`${schoolAddress}  |  Contact: ${schoolPhone}`, textStartX, 29);

      // Generation Metadata
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

      // 3. Main Data Table (Exports ALL matching displayedStudents)
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
          fillColor: [67, 56, 202],
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
          const pageNum = doc.internal.getNumberOfPages();
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
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
    <div className="w-full px-6 md:px-10 pb-10 animate-fade-in-up font-sans">
      
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
              className={`px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
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
            onClick={() => {
              memoryHistoryCache = { schoolId: null, classes: null, parents: null, students: null, timestamp: 0 };
              setRefreshKey(k => k + 1);
            }}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh Records from Server"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin text-indigo-600' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs md:text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintAdmissionsReport}
            className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs md:text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
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
                    cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const fresh = payload.find(p => p.dataKey === 'fresh')?.value || 0;
                        const sibling = payload.find(p => p.dataKey === 'sibling')?.value || 0;
                        const total = fresh + sibling;

                        return (
                          <div className="bg-[#0b1329] text-white p-3.5 rounded-2xl shadow-2xl border border-slate-700/80 min-w-[210px] text-xs">
                            <div className="font-extrabold text-sm text-white mb-2 pb-1.5 border-b border-slate-700/60 flex items-center justify-between">
                              <span>{label}</span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Class Intake</span>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-2 font-medium text-slate-200">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#10b981] inline-block shadow-xs shadow-emerald-500/50" />
                                  Fresh Intake:
                                </span>
                                <span className="font-extrabold text-white text-sm">{fresh}</span>
                              </div>

                              <div className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-2 font-medium text-slate-200">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#6366f1] inline-block shadow-xs shadow-indigo-500/50" />
                                  Sibling Intake:
                                </span>
                                <span className="font-extrabold text-white text-sm">{sibling}</span>
                              </div>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-dashed border-slate-700/80 flex items-center justify-between">
                              <span className="font-bold text-[11px] text-amber-400 uppercase tracking-wider">Total Enrolled:</span>
                              <span className="font-black text-sm text-amber-400">{total}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="fresh" stackId="a" fill="#10b981" isAnimationActive={false} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="sibling" stackId="a" fill="#6366f1" isAnimationActive={false} radius={[6, 6, 0, 0]} />
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
                    isAnimationActive={false}
                  >
                    {intakeRatioData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        const percentage = totalAdmitted > 0 ? Math.round((data.value / totalAdmitted) * 100) : 0;
                        return (
                          <div className="bg-[#0b1329] text-white p-3 rounded-2xl shadow-2xl border border-slate-700/80 min-w-[170px] text-xs">
                            <div className="flex items-center gap-2 font-bold text-white mb-1.5 pb-1 border-b border-slate-700/60">
                              <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: data.payload.color }} />
                              <span>{data.name}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-300 py-0.5">
                              <span>Intake Count:</span>
                              <span className="font-extrabold text-white text-sm">{data.value}</span>
                            </div>
                            <div className="flex items-center justify-between text-amber-400 font-bold mt-1 pt-1 border-t border-dashed border-slate-700/80">
                              <span>Share Ratio:</span>
                              <span className="font-extrabold text-sm">{percentage}%</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
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
                {paginatedStudents.map((stu, idx) => {
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
                            onClick={(e) => handleOpenReceipt(stu, e)}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                            title="View Official Receipt"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => handlePrintStudentAdmissionForm(stu)}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                            title="Print Official Admission Form"
                          >
                            <FileText size={15} />
                          </button>
                          {stu.classId && stu.id && (
                            <button
                              onClick={() => navigate(`/student/edit/${stu.classId}/${stu.id}`)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer"
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

        {/* Ledger Pagination & Record Counter Footer */}
        {!isLoading && displayedStudents.length > 0 && (
          <div className="px-4 py-3 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            
            {/* Left: Range text */}
            <div className="flex items-center gap-3">
              <span>
                Showing <strong className="text-slate-800 font-semibold">{((currentPage - 1) * pageSize) + 1}</strong> to{' '}
                <strong className="text-slate-800 font-semibold">
                  {Math.min(currentPage * pageSize, displayedStudents.length)}
                </strong>{' '}
                of <strong className="text-slate-800 font-semibold">{displayedStudents.length}</strong> admissions
              </span>

              {displayedStudents.length > 25 && (
                <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-3">
                  <span className="text-[11px] text-slate-400">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              )}
            </div>

            {/* Right: Page navigation buttons */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs flex items-center justify-center"
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs flex items-center justify-center"
                  title="Next Page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

          </div>
        )}

      </div>

      {/* 5. OFFICIAL RECEIPT REPRINT POPOVER MODAL (Positioned right adjacent to Eye button) */}
      {showReceiptModal && receiptData && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in"
          onClick={() => {
            setShowReceiptModal(false);
            setModalPos(null);
          }}
        >
          {/* Receipt Popover Box */}
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 z-[60] flex flex-col"
            style={{
              position: 'fixed',
              top: modalPos ? `${modalPos.top}px` : '50%',
              right: modalPos ? `${modalPos.right}px` : 'auto',
              left: modalPos ? 'auto' : '50%',
              transform: modalPos ? 'none' : 'translate(-50%, -50%)',
              width: modalPos ? `${modalPos.width}px` : 'min(520px, calc(100vw - 48px))',
              maxHeight: modalPos ? `${modalPos.maxHeight}px` : 'min(600px, calc(100vh - 48px))',
              height: 'auto',
              animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Popover Action Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 px-4 py-3 text-white flex items-center justify-between flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-indigo-200" />
                <span className="font-bold text-xs tracking-wide">Admission Record Receipt</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintSingleReceipt(selectedStudentRecord)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1.5 font-bold text-xs transition-all cursor-pointer shadow-sm"
                  title="Direct Print Official Slip"
                >
                  <Printer size={13} />
                  <span>Print Slip</span>
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={isDownloading}
                  className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center gap-1.5 font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
                  title="Save Receipt as PDF"
                >
                  <Download size={13} />
                  <span>{isDownloading ? 'Saving...' : 'PDF'}</span>
                </button>
                <button
                  onClick={() => {
                    setShowReceiptModal(false);
                    setModalPos(null);
                  }}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-all cursor-pointer"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Receipt Body Canvas for download/view */}
            <div className="overflow-y-auto p-4 md:p-6 custom-scrollbar flex-1 bg-slate-50/40">
              <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm admission-receipt-history">
                
                {/* Header */}
                <div className="text-center border-b border-slate-100 pb-4 mb-4">
                  <h2 className="text-base font-black text-slate-900 tracking-tight">
                    {receiptData.schoolName.toUpperCase()}
                  </h2>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-semibold text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><Phone size={11} className="text-indigo-600" /> {receiptData.schoolPhone}</span>
                    <span className="flex items-center gap-1"><MapPin size={11} className="text-indigo-600" /> {receiptData.schoolAddress}</span>
                  </div>
                  <div className="mt-2 inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] tracking-wider uppercase">
                    Official Admission Record
                  </div>
                </div>

                {/* Meta Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Admission Timestamp</span>
                    <div className="text-xs font-bold text-slate-800">Date: {receiptData.date}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Time: {receiptData.time}</div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Parent / Guardian</span>
                    <div className="text-xs font-bold text-slate-800 truncate">{receiptData.parentName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{receiptData.parentPhone}</div>
                  </div>
                </div>

                {/* Student Details & Fees */}
                <div className="mb-4">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Enrolled Student & Assigned Structure</h4>
                  {receiptData.students.map((stu, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-2 border-b border-slate-200 pb-1.5">
                        <div>
                          <h3 className="text-xs font-extrabold text-slate-900">{stu.name.toUpperCase()}</h3>
                          <span className="text-[11px] font-bold text-indigo-600">{stu.className}</span>
                        </div>
                        <div className="text-right text-[11px]">
                          <div>Roll: <strong className="font-mono">{stu.rollNo || 'N/A'}</strong></div>
                          <div>Adm: <strong className="font-mono">{stu.admissionNo || 'N/A'}</strong></div>
                        </div>
                      </div>

                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-200 text-[9px] font-bold uppercase">
                            <th className="py-1 text-left">Fee Category</th>
                            <th className="py-1 text-right">Amount (PKR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stu.feeStructure.map((f, idx) => (
                            <tr key={idx}>
                              <td className="py-1 font-medium text-slate-700">{f.name}</td>
                              <td className="py-1 text-right font-bold text-slate-900">Rs {Number(f.amount).toLocaleString()}</td>
                            </tr>
                          ))}
                          {stu.individualActions.map((f, idx) => (
                            <tr key={idx}>
                              <td className="py-1 font-medium text-slate-700">{f.name} (Action)</td>
                              <td className="py-1 text-right font-bold text-slate-900">Rs {Number(f.amount).toLocaleString()}</td>
                            </tr>
                          ))}
                          {stu.feeStructure.length === 0 && stu.individualActions.length === 0 && (
                            <tr>
                              <td colSpan="2" className="py-2 text-center text-slate-400 italic text-[10px]">No custom fees recorded</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="text-center pt-2.5 border-t border-slate-100 text-[10px] text-slate-400">
                  <p className="font-bold text-slate-600">Verified by Principal Portal</p>
                  <p className="text-[9px] mt-0.5">Official Student Enrollment Record • Generated for administrative purposes</p>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
