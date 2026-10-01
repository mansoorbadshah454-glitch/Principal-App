import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./Admission.css"; // Import the custom CSS
import {
  Users,
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Calendar,
  School,
  Trash2,
  Plus,
  Save,
  Loader2,
  Camera,
  ChevronRight,
  ChevronLeft,
  X,
  Printer,
  Download,
  History,
  UserPlus,
  Wifi,
  WifiOff,
  RefreshCw,
  Wallet,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Check,
  GraduationCap,
} from "lucide-react";
import { db, storage } from "../firebase";
import AdmissionHistory from "./AdmissionHistory";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { getDocsFast } from "../utils/cacheUtils";
import { getFunctions, httpsCallable } from "firebase/functions";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const ACTION_CATEGORIES = [
  "Admission fee",
  "Registration fee",
  "Security",
  "Uniform",
  "Books",
  "Sports",
  "Tour charges",
  "Club membership",
  "Fine fee",
  "Promotions fee",
  "Annual fund",
];
const RECURRING_CATEGORIES = [
  "Tuition fee",
  "Transport fee",
  "Online services fee",
  "Library",
  "Hostel fee",
  "Stationary charges",
  "Concession",
  "Miscellaneous",
];
const ALL_CATEGORIES = [...RECURRING_CATEGORIES, ...ACTION_CATEGORIES].sort();

const Admission = () => {
  const [activeView, setActiveView] = useState("new_admission"); // "new_admission" | "history"

  const [parentDetails, setParentDetails] = useState({
    fatherName: "",
    occupation: "",
    phone: "",
    emergencyPhone: "",
    email: "",
    address: "",
    password: "", // New field for parent login
  });

  // Receipt State
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (showReceipt) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showReceipt]);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const elements = document.querySelectorAll(".admission-receipt");
      if (!elements || elements.length === 0) return;

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];

        // Temporarily override styles for clean canvas capture
        const originalFilter = el.style.filter;
        const originalBoxShadow = el.style.boxShadow;
        el.style.filter = "none";
        el.style.boxShadow = "none";

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
        });
        const imgData = canvas.toDataURL("image/jpeg", 1.0);

        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        if (i > 0) {
          pdf.addPage();
        }

        pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeight);

        // Restore styles
        el.style.filter = originalFilter;
        el.style.boxShadow = originalBoxShadow;
      }

      pdf.save("admission_receipts.pdf");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Parent Search & Link Logic
  const [searchPhone, setSearchPhone] = useState("");
  const [existingParent, setExistingParent] = useState(null);
  const [isSearchingParent, setIsSearchingParent] = useState(false);

  // Existing Sibling Linking Logic
  const [showLinkSibling, setShowLinkSibling] = useState(false);
  const [siblingClassId, setSiblingClassId] = useState("");
  const [availableSiblings, setAvailableSiblings] = useState([]);
  const [selectedSiblingId, setSelectedSiblingId] = useState("");
  const [linkedSiblings, setLinkedSiblings] = useState([]); // Students already in school to link to this parent

  const [studentCardTabs, setStudentCardTabs] = useState({});

  const setStudentTab = (index, tab) => {
    setStudentCardTabs((prev) => ({
      ...prev,
      [index]: tab,
    }));
  };

  const [students, setStudents] = useState([
    {
      firstName: "",
      lastName: "",
      dob: "",
      gender: "select",
      admissionClass: "", // This will now store the Class ID
      previousSchool: "",
      rollNo: "",
      admissionNo: "", // New Field
      feeStructure: [],
      individualActions: [],
      newFeeCategory: RECURRING_CATEGORIES[0],
      newFeeAmount: "",
      newFeeMode: "recurring", // "recurring" | "action"
      markPaidAtAdmission: false,
      feePaymentMode: "Cash",
      profilePic: null,
    },
  ]);

  const [availableClasses, setAvailableClasses] = useState([]);
  const [schoolId, setSchoolId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [schoolProfile, setSchoolProfile] = useState({
    name: localStorage.getItem("schoolName") || "",
    phone: localStorage.getItem("schoolPhone") || "",
    emergencyContact: localStorage.getItem("schoolEmergencyPhone") || "",
    landline: "",
    address: localStorage.getItem("schoolAddress") || "",
    profileImage: localStorage.getItem("schoolLogo") || "",
    email: "",
  });

  // Offline Resilience & Auto-Sync Engine States
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOfflineAdmissions, setPendingOfflineAdmissions] = useState(() => {
    try {
      const manualSession = localStorage.getItem("manual_session");
      const currentSchoolId = manualSession ? JSON.parse(manualSession)?.schoolId : null;
      if (!currentSchoolId) return [];
      const saved = localStorage.getItem(`offline_admissions_queue_${currentSchoolId}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const savePendingAdmissionQueue = (queue, targetSchoolId = schoolId) => {
    try {
      setPendingOfflineAdmissions(queue);
      const sId = targetSchoolId || (localStorage.getItem("manual_session") ? JSON.parse(localStorage.getItem("manual_session"))?.schoolId : null);
      if (sId) {
        localStorage.setItem(`offline_admissions_queue_${sId}`, JSON.stringify(queue));
      }
    } catch (e) {
      console.error("Error saving offline admissions queue:", e);
    }
  };

  const triggerAutoSyncAdmissions = async () => {
    const activeSchoolId = schoolId || (localStorage.getItem("manual_session") ? JSON.parse(localStorage.getItem("manual_session"))?.schoolId : null);
    if (!navigator.onLine || isSyncing || !activeSchoolId) return;

    let currentQueue = [];
    try {
      const saved = localStorage.getItem(`offline_admissions_queue_${activeSchoolId}`);
      currentQueue = saved ? JSON.parse(saved) : [];
    } catch (e) {
      currentQueue = [];
    }

    if (currentQueue.length === 0) return;

    setIsSyncing(true);
    const remainingQueue = [...currentQueue];

    for (const adm of currentQueue) {
      try {
        let finalParentId = adm.parentId;

        // If parent was created offline, provision Firebase Auth account
        if (adm.parentIsOffline && adm.parentEmail && adm.parentPassword) {
          try {
            const functions = getFunctions();
            const createSchoolUserFn = httpsCallable(functions, "createSchoolUser");
            const result = await createSchoolUserFn({
              email: adm.parentEmail.trim(),
              password: adm.parentPassword,
              name: adm.parentName.trim(),
              role: "parent",
              schoolId: activeSchoolId,
              phone: adm.parentPhone.trim(),
              emergencyPhone: adm.parentEmergencyPhone || "",
              address: adm.parentAddress || "",
              occupation: adm.parentOccupation || "",
              linkedStudents: [],
            });
            if (result?.data?.uid) {
              finalParentId = result.data.uid;
            }
          } catch (authErr) {
            console.warn("Auth account creation fallback on sync:", authErr);
          }
        }

        // Upload any pending Base64 profile pictures to Firebase Storage
        for (const st of adm.students || []) {
          let profilePicUrl = st.profilePic;
          if (profilePicUrl && profilePicUrl.startsWith('data:image')) {
            try {
              const storagePath = `schools/${activeSchoolId}/students/${st.studentId}/profile.jpg`;
              const imageRef = ref(storage, storagePath);
              await uploadString(imageRef, profilePicUrl, 'data_url');
              profilePicUrl = await getDownloadURL(imageRef);

              const stRef = doc(db, `schools/${activeSchoolId}/classes/${st.classId}/students`, st.studentId);
              const masterStRef = doc(db, `schools/${activeSchoolId}/students`, st.studentId);
              await setDoc(stRef, { profilePic: profilePicUrl, avatar: profilePicUrl }, { merge: true });
              await setDoc(masterStRef, { profilePic: profilePicUrl, avatar: profilePicUrl }, { merge: true });
            } catch (imgErr) {
              console.warn("Storage upload fallback during sync:", imgErr);
            }
          }
        }

        // Link students to Parent doc
        if (finalParentId && adm.newStudentLinks && adm.newStudentLinks.length > 0) {
          try {
            const parentRef = doc(db, `schools/${activeSchoolId}/parents`, finalParentId);
            await setDoc(parentRef, {
              name: adm.parentName,
              phone: adm.parentPhone,
              email: adm.parentEmail || '',
              emergencyPhone: adm.parentEmergencyPhone || '',
              address: adm.parentAddress || '',
              occupation: adm.parentOccupation || '',
              role: 'parent',
              schoolId: activeSchoolId,
              linkedStudents: arrayUnion(...adm.newStudentLinks)
            }, { merge: true });
          } catch (pErr) {
            console.warn("Parent link update buffered:", pErr);
          }
        }

        const index = remainingQueue.findIndex(item => item.queueId === adm.queueId);
        if (index !== -1) {
          remainingQueue.splice(index, 1);
        }
      } catch (syncErr) {
        console.error("Failed to sync offline admission item:", adm.queueId, syncErr);
        if (!navigator.onLine) break;
      }
    }

    savePendingAdmissionQueue(remainingQueue, activeSchoolId);
    setIsSyncing(false);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerAutoSyncAdmissions();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      triggerAutoSyncAdmissions();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [schoolId]);

  useEffect(() => {
    const fetchSchoolAndClasses = async () => {
      const manualSession = localStorage.getItem("manual_session");
      if (manualSession) {
        const userData = JSON.parse(manualSession);
        setSchoolId(userData.schoolId);

        try {
          // 1. Fetch School Settings & Profile (Direct from Settings Page Firestore document)
          let fetchedSchool = {
            name: "",
            phone: "",
            emergencyContact: "",
            landline: "",
            address: "",
            profileImage: "",
            email: "",
          };

          try {
            const profileRef = doc(db, `schools/${userData.schoolId}/settings`, "profile");
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              const pData = profileSnap.data();
              fetchedSchool = {
                name: pData.name || "",
                phone: pData.phone || "",
                emergencyContact: pData.emergencyContact || "",
                landline: pData.landline || "",
                address: pData.address || "",
                profileImage: pData.profileImage || pData.logo || "",
                email: pData.email || "",
              };
            }

            // Fallback to root schools/{schoolId}
            const rootRef = doc(db, "schools", userData.schoolId);
            const rootSnap = await getDoc(rootRef);
            if (rootSnap.exists()) {
              const rData = rootSnap.data();
              if (!fetchedSchool.name) fetchedSchool.name = rData.name || rData.schoolName || "";
              if (!fetchedSchool.phone) fetchedSchool.phone = rData.phone || rData.schoolPhone || "";
              if (!fetchedSchool.emergencyContact) fetchedSchool.emergencyContact = rData.emergencyContact || rData.emergencyPhone || "";
              if (!fetchedSchool.address) fetchedSchool.address = rData.address || rData.schoolAddress || "";
              if (!fetchedSchool.profileImage) fetchedSchool.profileImage = rData.profileImage || rData.logo || rData.schoolLogo || "";
              if (!fetchedSchool.email) fetchedSchool.email = rData.email || "";
            }
          } catch (err) {
            console.warn("Could not fetch school profile doc in Admission:", err);
          }

          if (!fetchedSchool.name) fetchedSchool.name = localStorage.getItem("schoolName") || "School";
          if (!fetchedSchool.phone) fetchedSchool.phone = localStorage.getItem("schoolPhone") || "";
          if (!fetchedSchool.emergencyContact) fetchedSchool.emergencyContact = localStorage.getItem("schoolEmergencyPhone") || "";
          if (!fetchedSchool.address) fetchedSchool.address = localStorage.getItem("schoolAddress") || "";
          if (!fetchedSchool.profileImage) fetchedSchool.profileImage = localStorage.getItem("schoolLogo") || "";

          setSchoolProfile(fetchedSchool);
          if (fetchedSchool.name) localStorage.setItem("schoolName", fetchedSchool.name);
          if (fetchedSchool.phone) localStorage.setItem("schoolPhone", fetchedSchool.phone);
          if (fetchedSchool.emergencyContact) localStorage.setItem("schoolEmergencyPhone", fetchedSchool.emergencyContact);
          if (fetchedSchool.address) localStorage.setItem("schoolAddress", fetchedSchool.address);
          if (fetchedSchool.profileImage) localStorage.setItem("schoolLogo", fetchedSchool.profileImage);

          // 2. Fetch Classes
          const q = query(
            collection(db, `schools/${userData.schoolId}/classes`),
          );
          const querySnapshot = await getDocsFast(q);
          const classesList = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          // Simple sort or use the enhanced sort info if available
          // We'll trust the alphabetical/display order for now or sort by name
          classesList.sort((a, b) => {
            const getClassOrder = (name) => {
              const lower = name.toLowerCase();
              if (lower.includes("nursery")) return -2;
              if (lower.includes("prep")) return -1;
              return parseInt(name.replace(/\D/g, "")) || 0;
            };
            return getClassOrder(a.name) - getClassOrder(b.name);
          });

          setAvailableClasses(classesList);
        } catch (error) {
          console.error("Error fetching school and classes:", error);
        }
      }
    };

    fetchSchoolAndClasses();
  }, []);

  const handleParentChange = (e) => {
    const { name, value } = e.target;
    setParentDetails((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleStudentChange = (index, e) => {
    const { name, value } = e.target;
    const newStudents = [...students];
    newStudents[index] = {
      ...newStudents[index],
      [name]: value,
    };
    setStudents(newStudents);
  };

  const handleImageUpload = (index, e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newStudents = [...students];
        newStudents[index] = {
          ...newStudents[index],
          profilePic: reader.result, // Store base64 string
        };
        setStudents(newStudents);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Parent Search Logic ---
  const handleSearchParent = async () => {
    if (!searchPhone || !schoolId) return;
    setIsSearchingParent(true);
    try {
      const q = query(
        collection(db, `schools/${schoolId}/parents`),
        where("phone", "==", searchPhone),
        limit(1),
      );
      const snap = await getDocsFast(q);
      if (!snap.empty) {
        const pData = snap.docs[0].data();
        setExistingParent({ id: snap.docs[0].id, ...pData });
        setParentDetails({
          fatherName: pData.name,
          occupation: pData.occupation || "", // Assuming occupation might not be in basic parent schema sometimes
          phone: pData.phone,
          email: pData.email || "",
          address: pData.address || "",
          username: "", // Clear credentials as we won't create new ones
          password: "",
        });
        alert(`Parent Found: ${pData.name}`);
      } else {
        setExistingParent(null);
        alert("No existing parent account found with this number.");
      }
    } catch (err) {
      console.error("Error searching parent:", err);
      alert("Error searching parent.");
    } finally {
      setIsSearchingParent(false);
    }
  };

  const handleResetParent = () => {
    setExistingParent(null);
    setParentDetails({
      fatherName: "",
      occupation: "",
      phone: "",
      emergencyPhone: "",
      email: "",
      address: "",
      password: "",
    });
    setSearchPhone("");
  };

  // --- Sibling Linking Logic ---
  useEffect(() => {
    if (!schoolId || !siblingClassId) {
      setAvailableSiblings([]);
      return;
    }
    const fetchSiblings = async () => {
      try {
        const q = query(
          collection(
            db,
            `schools/${schoolId}/classes/${siblingClassId}/students`,
          ),
        );
        const snap = await getDocsFast(q);
        // Filter out students who are already linked locally
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAvailableSiblings(list);
      } catch (err) {
        console.error(err);
      }
    };
    fetchSiblings();
  }, [schoolId, siblingClassId]);

  const addSiblingLink = () => {
    if (!selectedSiblingId || !siblingClassId) return;
    const cls = availableClasses.find((c) => c.id === siblingClassId);
    const stu = availableSiblings.find((s) => s.id === selectedSiblingId);
    if (cls && stu) {
      if (!linkedSiblings.some((l) => l.studentId === stu.id)) {
        setLinkedSiblings([
          ...linkedSiblings,
          {
            studentId: stu.id,
            studentName: stu.name || `${stu.firstName} ${stu.lastName}`,
            classId: cls.id,
            className: cls.name,
          },
        ]);
      }
    }
    setSelectedSiblingId("");
  };

  const removeSiblingLink = (sid) => {
    setLinkedSiblings(linkedSiblings.filter((l) => l.studentId !== sid));
  };

  const addStudent = () => {
    setStudents([
      ...students,
      {
        firstName: "",
        lastName: "",
        dob: "",
        gender: "select",
        admissionClass: "",
        previousSchool: "",
        rollNo: "",
        admissionNo: "",
        feeStructure: [],
        individualActions: [],
        newFeeCategory: RECURRING_CATEGORIES[0],
        newFeeAmount: "",
        newFeeMode: "recurring",
        markPaidAtAdmission: false,
        feePaymentMode: "Cash",
        profilePic: null,
      },
    ]);
  };

  const handleAddFee = (index) => {
    const updatedStudents = [...students];
    const student = updatedStudents[index];
    if (!student.newFeeCategory || !student.newFeeAmount || Number(student.newFeeAmount) <= 0) return;

    const isAction = student.newFeeMode === "action" || ACTION_CATEGORIES.includes(student.newFeeCategory);
    const newItem = {
      id: (isAction ? "action_" : "fee_") + Date.now().toString() + "_" + Math.random().toString(36).substring(2, 6),
      name: student.newFeeCategory,
      amount: Number(student.newFeeAmount),
      ...(isAction ? { status: "unpaid" } : {}),
    };

    if (isAction) {
      student.individualActions = [...(student.individualActions || []), newItem];
    } else {
      student.feeStructure = [...(student.feeStructure || []), newItem];
    }

    student.newFeeAmount = ""; // Reset input
    setStudents(updatedStudents);
  };

  const handleToggleActionStatus = (studentIndex, actionId) => {
    const updatedStudents = [...students];
    const student = updatedStudents[studentIndex];
    student.individualActions = (student.individualActions || []).map((item) => {
      if (item.id === actionId) {
        return {
          ...item,
          status: item.status === "paid" ? "unpaid" : "paid",
        };
      }
      return item;
    });
    setStudents(updatedStudents);
  };

  const handleRemoveFee = (studentIndex, feeId, isAction) => {
    const updatedStudents = [...students];
    const student = updatedStudents[studentIndex];

    if (isAction) {
      student.individualActions = (student.individualActions || []).filter(
        (item) => item.id !== feeId,
      );
    } else {
      student.feeStructure = (student.feeStructure || []).filter(
        (item) => item.id !== feeId,
      );
    }

    setStudents(updatedStudents);
  };

  const removeStudent = (index) => {
    if (students.length > 1) {
      const newStudents = students.filter((_, i) => i !== index);
      setStudents(newStudents);
    }
  };

  const [parentInputStep, setParentInputStep] = useState(1);

  const handleParentNext = () => {
    // We allow going to next step even if empty, so user can Search in Step 2 to auto-fill
    setParentInputStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!existingParent && (!parentDetails.email || !parentDetails.password)) {
      alert(
        "Please complete Account Setup (Login Email and Password) before submitting.",
      );
      setParentInputStep(2);
      return;
    }

    // Manual Validation since hidden inputs don't trigger HTML5 required
    if (!parentDetails.fatherName || !parentDetails.phone) {
      alert(
        "Please fill in Parent Details (Father Name, Phone) before submitting.",
      );
      setParentInputStep(1);
      return;
    }

    const activeSchoolId = schoolId || (localStorage.getItem("manual_session") ? JSON.parse(localStorage.getItem("manual_session"))?.schoolId : null);
    if (!activeSchoolId) {
      alert("School ID missing. Please relogin.");
      return;
    }

    setIsLoading(true);

    try {
      const queueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      let finalParentId = existingParent ? existingParent.id : null;
      let parentIsOffline = false;

      // STEP 1: Handle Parent Account
      if (!finalParentId) {
        if (navigator.onLine) {
          try {
            const functions = getFunctions();
            const createSchoolUserFn = httpsCallable(functions, "createSchoolUser");

            const result = await createSchoolUserFn({
              email: parentDetails.email ? parentDetails.email.trim() : "",
              password: parentDetails.password,
              name: parentDetails.fatherName.trim(),
              role: "parent",
              schoolId: activeSchoolId,
              phone: parentDetails.phone.trim(),
              emergencyPhone: parentDetails.emergencyPhone
                ? parentDetails.emergencyPhone.trim()
                : "",
              address: parentDetails.address,
              occupation: parentDetails.occupation,
              linkedStudents: [],
            });

            finalParentId = result.data.uid;
          } catch (authError) {
            console.warn("Cloud function createSchoolUser offline fallback:", authError);
          }
        }

        // Fallback for offline parent creation: generate local ID and write to IndexedDB
        if (!finalParentId) {
          parentIsOffline = true;
          const parentDocRef = doc(collection(db, `schools/${activeSchoolId}/parents`));
          finalParentId = parentDocRef.id;

          const offlineParentPayload = {
            name: parentDetails.fatherName.trim(),
            role: "parent",
            schoolId: activeSchoolId,
            phone: parentDetails.phone.trim(),
            emergencyPhone: parentDetails.emergencyPhone ? parentDetails.emergencyPhone.trim() : "",
            email: parentDetails.email ? parentDetails.email.trim() : "",
            address: parentDetails.address || "",
            occupation: parentDetails.occupation || "",
            temporaryPassword: parentDetails.password || "",
            offlineCreated: true,
            linkedStudents: [],
            createdAt: serverTimestamp()
          };

          try {
            await setDoc(parentDocRef, offlineParentPayload, { merge: true });
          } catch (err) {
            console.warn("Buffered offline parent doc write:", err);
          }
        }
      }

      // STEP 2: Process New Students
      const newStudentLinks = [];
      const queuedStudents = [];

      const admissionPromises = students.map(async (student) => {
        if (!student.admissionClass) return;

        const selectedClass = availableClasses.find(
          (c) => c.id === student.admissionClass,
        );
        const className = selectedClass ? selectedClass.name : "Unknown";

        const studentRef = doc(
          collection(
            db,
            `schools/${activeSchoolId}/classes/${student.admissionClass}/students`,
          ),
        );
        const studentId = studentRef.id;

        // Upload Profile Pic if online, else store base64 string
        let profilePicUrl = student.profilePic || null;
        if (student.profilePic && navigator.onLine) {
          try {
            const storagePath = `schools/${activeSchoolId}/students/${studentId}/profile.jpg`;
            const imageRef = ref(storage, storagePath);
            await uploadString(imageRef, student.profilePic, 'data_url');
            profilePicUrl = await getDownloadURL(imageRef);
          } catch (err) {
            console.error("Error uploading profile pic:", err);
          }
        }

        // Compute Financial SSOT attributes
        const tuitionItem = (student.feeStructure || []).find((f) =>
          (f.name || "").toLowerCase().includes("tuition")
        );
        const transportItem = (student.feeStructure || []).find((f) =>
          (f.name || "").toLowerCase().includes("transport")
        );
        const recurringTotal = (student.feeStructure || []).reduce(
          (sum, f) => sum + (Number(f.amount) || 0),
          0
        );
        const actionsTotal = (student.individualActions || []).reduce(
          (sum, a) => sum + (Number(a.amount) || 0),
          0
        );
        const derivedTuition = tuitionItem
          ? Number(tuitionItem.amount || 0)
          : Math.max(
              0,
              recurringTotal - (transportItem ? Number(transportItem.amount || 0) : 0)
            );
        const derivedTransport = transportItem ? Number(transportItem.amount || 0) : 0;

        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const isPaidNow = Boolean(student.markPaidAtAdmission);

        const processedActions = (student.individualActions || []).map((a) => ({
          ...a,
          status: isPaidNow ? "paid" : (a.status || "unpaid"),
          ...(isPaidNow ? { paidAt: now.toISOString(), paidMonthKey: currentMonthKey } : {}),
        }));

        const receiptNo = `ADM-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;

        const monthlyFeeHist = isPaidNow
          ? {
              [currentMonthKey]: {
                status: "paid",
                paidAmount: recurringTotal + actionsTotal,
                expectedAmount: recurringTotal + actionsTotal,
                paidAt: now.toISOString(),
                paymentMode: student.feePaymentMode || "Cash",
                receiptNo: receiptNo,
                settledVia: "admission_counter",
              },
            }
          : {};

        // Prepare Student Data Object
        const studentData = {
          name: `${student.firstName} ${student.lastName}`,
          firstName: student.firstName,
          lastName: student.lastName,
          dob: student.dob,
          gender: student.gender,
          previousSchool: student.previousSchool,
          profilePic: profilePicUrl,
          avatar: profilePicUrl,
          parentDetails: { ...parentDetails, parentId: finalParentId },
          rollNo:
            student.rollNo || `TPP-${Math.floor(1000 + Math.random() * 9000)}`,
          admissionNo: student.admissionNo || "",
          feeStructure: student.feeStructure || [],
          individualActions: processedActions,
          tuitionFee: derivedTuition,
          transportFee: derivedTransport,
          monthlyFee: recurringTotal,
          fee: recurringTotal,
          baseFee: recurringTotal,
          monthlyFeeStatus: isPaidNow ? "paid" : "unpaid",
          ...(isPaidNow
            ? {
                monthlyFeeDate: now.toISOString(),
                paidMonths: [currentMonthKey],
                lastPaymentMode: student.feePaymentMode || "Cash",
                lastPaymentAt: now.toISOString(),
                monthlyFeeHistory: monthlyFeeHist,
              }
            : {}),
          status: "present",
          avgScore: 0,
          homework: 0,
          classId: student.admissionClass,
          className: className,
          createdAt: serverTimestamp(),
        };

        try {
          // 1. Save to Class Sub-collection
          await setDoc(studentRef, studentData);

          // 2. Save to Master Students Collection
          const masterStudentRef = doc(db, `schools/${activeSchoolId}/students`, studentId);
          await setDoc(masterStudentRef, studentData);

          // 3. Update Class Count
          const classRef = doc(
            db,
            `schools/${activeSchoolId}/classes`,
            student.admissionClass,
          );
          await updateDoc(classRef, {
            students: increment(1),
          });

          // 4. Record Fee Transaction for SSOT Ledger & Financial Integrity
          if (isPaidNow && (recurringTotal + actionsTotal) > 0) {
            const items = [
              ...(student.feeStructure || []).map((f) => ({
                name: f.name || "Tuition Fee",
                amount: Number(f.amount || 0),
                type: "recurring",
              })),
              ...(student.individualActions || []).map((a) => ({
                name: a.name || "Admission Fee",
                amount: Number(a.amount || 0),
                type: "action",
              })),
            ];
            const paidCategories = items.map((i) => i.name);
            const totalPaid = recurringTotal + actionsTotal;

            const txDocRef = doc(db, `schools/${activeSchoolId}/feeTransactions`, receiptNo);
            const txPayload = {
              id: receiptNo,
              receiptNo: receiptNo,
              studentId: studentId,
              studentName: `${student.firstName} ${student.lastName}`.trim(),
              rollNo: student.rollNo || "",
              admissionNo: student.admissionNo || "",
              classId: student.admissionClass,
              className: className,
              fatherName: parentDetails.fatherName || "",
              fatherPhone: parentDetails.phone || "",
              items: items,
              paidCategories: paidCategories,
              baseFee: derivedTuition,
              transportFee: derivedTransport,
              actionsFee: actionsTotal,
              fineAmount: 0,
              discount: 0,
              totalPaid: totalPaid,
              remainingBalance: 0,
              paymentMode: student.feePaymentMode || "Cash",
              remarks: "Initial Payment at Admission",
              dueDate: null,
              targetMonthKey: currentMonthKey,
              targetMonthIdx: now.getMonth(),
              targetMonthName: now.toLocaleDateString("en-US", { month: "long" }),
              targetYear: now.getFullYear(),
              dateString: now.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
              timeString: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
              timestamp: serverTimestamp(),
              dateIso: now.toISOString().split("T")[0],
              collectedBy: "Admission Desk",
              source: "admission",
              transactionType: "admission_collection",
            };

            await setDoc(txDocRef, txPayload, { merge: true });
          }
        } catch (stErr) {
          console.warn("Buffered offline student write:", stErr);
        }

        newStudentLinks.push({
          studentId: studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          classId: student.admissionClass,
          className: className,
        });

        queuedStudents.push({
          studentId,
          classId: student.admissionClass,
          className,
          profilePic: student.profilePic
        });
      });

      await Promise.all(admissionPromises);

      // STEP 3: Link Students (New + Sibling) to Parent Account
      const allLinks = [...newStudentLinks, ...linkedSiblings];

      if (allLinks.length > 0) {
        try {
          const parentRef = doc(db, `schools/${activeSchoolId}/parents`, finalParentId);
          await updateDoc(parentRef, {
            linkedStudents: arrayUnion(...allLinks),
          });
        } catch (pErr) {
          console.warn("Parent link update buffered:", pErr);
        }
      }

      // STEP 4: Persistent Offline Queue Item (Zero Loss Guarantee)
      const queuedAdmission = {
        queueId,
        parentId: finalParentId,
        parentIsOffline,
        parentName: parentDetails.fatherName,
        parentPhone: parentDetails.phone,
        parentEmail: parentDetails.email,
        parentPassword: parentDetails.password,
        parentEmergencyPhone: parentDetails.emergencyPhone,
        parentAddress: parentDetails.address,
        parentOccupation: parentDetails.occupation,
        students: queuedStudents,
        newStudentLinks: allLinks,
        dateIso: new Date().toISOString()
      };

      const updatedAdmissionQueue = [...pendingOfflineAdmissions, queuedAdmission];
      savePendingAdmissionQueue(updatedAdmissionQueue, activeSchoolId);

      if (navigator.onLine && !parentIsOffline) {
        const cleaned = updatedAdmissionQueue.filter(item => item.queueId !== queueId);
        savePendingAdmissionQueue(cleaned, activeSchoolId);
      }

      // Set Receipt Data before clearing form
      setReceiptData({
        schoolName: schoolProfile.name || localStorage.getItem("schoolName") || "Our School",
        schoolPhone: schoolProfile.phone || localStorage.getItem("schoolPhone") || "",
        schoolEmergencyPhone:
          schoolProfile.emergencyContact ||
          schoolProfile.landline ||
          localStorage.getItem("schoolEmergencyPhone") ||
          "",
        schoolAddress:
          schoolProfile.address ||
          localStorage.getItem("schoolAddress") ||
          "",
        schoolLogo: schoolProfile.profileImage || localStorage.getItem("schoolLogo") || "",
        schoolEmail: schoolProfile.email || "",
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        parentName: parentDetails.fatherName || "Parent / Guardian",
        parentPhone: parentDetails.phone || "N/A",
        parentEmail: parentDetails.email || "N/A",
        parentPassword: parentDetails.password || "N/A",
        students: students.map((s) => {
          const cls = availableClasses.find((c) => c.id === s.admissionClass);
          const recTotal = (s.feeStructure || []).reduce(
            (sum, f) => sum + (Number(f.amount) || 0),
            0
          );
          const actTotal = (s.individualActions || []).reduce(
            (sum, a) => sum + (Number(a.amount) || 0),
            0
          );
          return {
            name: `${s.firstName || "Student"} ${s.lastName || ""}`.trim() || "New Student",
            className: cls ? cls.name : "Class Not Assigned",
            rollNo: s.rollNo || "Provisional",
            admissionNo: s.admissionNo || "New Admission",
            feeStructure: s.feeStructure || [],
            individualActions: s.individualActions || [],
            isPaidAtAdmission: Boolean(s.markPaidAtAdmission),
            paymentMode: s.feePaymentMode || "Cash",
            monthlyTotal: recTotal,
            oneTimeTotal: actTotal,
            grandTotal: recTotal + actTotal,
          };
        }),
      });
      setShowReceipt(true);

      // Reset Form
      setParentDetails({
        fatherName: "",
        occupation: "",
        phone: "",
        emergencyPhone: "",
        email: "",
        address: "",
        password: "",
      });
      setStudents([
        {
          firstName: "",
          lastName: "",
          dob: "",
          gender: "select",
          admissionClass: "",
          previousSchool: "",
          rollNo: "",
          admissionNo: "",
          feeStructure: [],
          individualActions: [],
          newFeeCategory: RECURRING_CATEGORIES[0],
          newFeeAmount: "",
          newFeeMode: "recurring",
          markPaidAtAdmission: false,
          feePaymentMode: "Cash",
          profilePic: null,
        },
      ]);
      setStudentCardTabs({});
      setExistingParent(null);
      setSearchPhone("");
      setLinkedSiblings([]);
    } catch (error) {
      console.error("Error submitting admission:", error);
      alert("Admission recorded into offline storage. Printable slip generated.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewReceipt = async (targetIndex = null) => {
    let currentSchool = { ...schoolProfile };

    // Dynamic live fetch if school profile is not fully loaded
    const activeSchoolId = schoolId || (localStorage.getItem("manual_session") ? JSON.parse(localStorage.getItem("manual_session"))?.schoolId : null);
    if (activeSchoolId && (!currentSchool.name || !currentSchool.profileImage)) {
      try {
        const profileRef = doc(db, `schools/${activeSchoolId}/settings`, "profile");
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const pData = profileSnap.data();
          currentSchool = {
            name: pData.name || currentSchool.name,
            phone: pData.phone || currentSchool.phone,
            emergencyContact: pData.emergencyContact || currentSchool.emergencyContact,
            landline: pData.landline || currentSchool.landline,
            address: pData.address || currentSchool.address,
            profileImage: pData.profileImage || pData.logo || currentSchool.profileImage,
            email: pData.email || currentSchool.email,
          };
        }
        const rootRef = doc(db, "schools", activeSchoolId);
        const rootSnap = await getDoc(rootRef);
        if (rootSnap.exists()) {
          const rData = rootSnap.data();
          if (!currentSchool.name) currentSchool.name = rData.name || rData.schoolName || "";
          if (!currentSchool.phone) currentSchool.phone = rData.phone || rData.schoolPhone || "";
          if (!currentSchool.emergencyContact) currentSchool.emergencyContact = rData.emergencyContact || rData.emergencyPhone || "";
          if (!currentSchool.address) currentSchool.address = rData.address || rData.schoolAddress || "";
          if (!currentSchool.profileImage) currentSchool.profileImage = rData.profileImage || rData.logo || rData.schoolLogo || "";
          if (!currentSchool.email) currentSchool.email = rData.email || "";
        }
        setSchoolProfile(currentSchool);
      } catch (err) {
        console.warn("Live fetch error during receipt preview:", err);
      }
    }

    const targetStudents =
      targetIndex !== null && students[targetIndex]
        ? [students[targetIndex]]
        : students;

    setReceiptData({
      schoolName: currentSchool.name || localStorage.getItem("schoolName") || "Our School",
      schoolPhone: currentSchool.phone || localStorage.getItem("schoolPhone") || "",
      schoolEmergencyPhone:
        currentSchool.emergencyContact ||
        currentSchool.landline ||
        localStorage.getItem("schoolEmergencyPhone") ||
        "",
      schoolAddress:
        currentSchool.address ||
        localStorage.getItem("schoolAddress") ||
        "",
      schoolLogo: currentSchool.profileImage || localStorage.getItem("schoolLogo") || "",
      schoolEmail: currentSchool.email || "",
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      parentName: parentDetails.fatherName || "Parent / Guardian",
      parentPhone: parentDetails.phone || "N/A",
      parentEmail: parentDetails.email || "N/A",
      parentPassword: parentDetails.password || "N/A",
      isProvisional: true,
      students: targetStudents.map((s) => {
        const cls = availableClasses.find((c) => c.id === s.admissionClass);
        const recTotal = (s.feeStructure || []).reduce(
          (sum, f) => sum + (Number(f.amount) || 0),
          0
        );
        const actTotal = (s.individualActions || []).reduce(
          (sum, a) => sum + (Number(a.amount) || 0),
          0
        );
        return {
          name: `${s.firstName || "Student"} ${s.lastName || ""}`.trim() || "New Student",
          className: cls ? cls.name : "Class Not Assigned",
          rollNo: s.rollNo || "Provisional",
          admissionNo: s.admissionNo || "New Admission",
          feeStructure: s.feeStructure || [],
          individualActions: s.individualActions || [],
          isPaidAtAdmission: Boolean(s.markPaidAtAdmission),
          paymentMode: s.feePaymentMode || "Cash",
          monthlyTotal: recTotal,
          oneTimeTotal: actTotal,
          grandTotal: recTotal + actTotal,
        };
      }),
    });
    setShowReceipt(true);
  };

  const testReceipt = () => {
    setReceiptData({
      schoolName:
        localStorage.getItem("schoolName") || "Excel International Academy",
      schoolPhone: localStorage.getItem("schoolPhone") || "+1 234 567 8900",
      schoolEmergencyPhone:
        localStorage.getItem("schoolEmergencyPhone") || "+1 987 654 3210",
      schoolAddress:
        localStorage.getItem("schoolAddress") ||
        "123 Education Street, City, Country",
      schoolLogo:
        localStorage.getItem("schoolLogo") ||
        "https://placehold.co/400x400/3b82f6/ffffff?text=School+Logo&font=montserrat",
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      parentName: "John Doe",
      parentPhone: "+1 234 567 8900",
      parentEmail: "johndoe@example.com",
      parentPassword: "SecurePassword123!",
      students: [
        {
          name: "ALEX DOE",
          className: "Class 5",
          rollNo: "TPP-4592",
          admissionNo: "ADM-2026-001",
          feeStructure: [
            { id: "1", name: "Tuition Fee", amount: 5000 },
            { id: "2", name: "Transport Fee", amount: 2000 },
          ],
          individualActions: [
            { id: "3", name: "Admission Fee", amount: 10000 },
            { id: "4", name: "Uniform", amount: 3500 },
          ],
        },
        {
          name: "SARAH DOE",
          className: "Class 3",
          rollNo: "TPP-4593",
          admissionNo: "ADM-2026-002",
          feeStructure: [
            { id: "1", name: "Tuition Fee", amount: 4500 },
            { id: "2", name: "Transport Fee", amount: 2000 },
          ],
          individualActions: [
            { id: "3", name: "Admission Fee", amount: 10000 },
          ],
        },
        {
          name: "MICHAEL DOE",
          className: "Class 1",
          rollNo: "TPP-4594",
          admissionNo: "ADM-2026-003",
          feeStructure: [
            { id: "1", name: "Tuition Fee", amount: 4000 },
            { id: "2", name: "Transport Fee", amount: 2000 },
          ],
          individualActions: [
            { id: "3", name: "Admission Fee", amount: 10000 },
            { id: "5", name: "Books Set", amount: 2500 },
          ],
        },
        {
          name: "EMMA DOE",
          className: "Prep",
          rollNo: "TPP-4595",
          admissionNo: "ADM-2026-004",
          feeStructure: [{ id: "1", name: "Tuition Fee", amount: 3500 }],
          individualActions: [
            { id: "3", name: "Admission Fee", amount: 10000 },
          ],
        },
      ],
    });
    setShowReceipt(true);
  };

  return (
    <div className="admission-page">
      <div className="header-wrapper">
        <div className="header-decor">
          <School size={160} />
        </div>
        <header className="page-header" style={{ width: "100%", maxWidth: "100%", padding: "0 2.5rem" }}>
          <div>
            <h1 className="page-title">
              {activeView === "new_admission"
                ? "New Admission"
                : "Admissions History & Analytics"}
            </h1>
            <p className="page-subtitle">
              {activeView === "new_admission"
                ? "Enroll one or more students for the academic year"
                : "Comprehensive admissions tracking, sibling intake & class breakdown"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            {/* Dynamic Live Connection / Offline Auto-Sync Pill */}
            {!isOnline ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.825rem',
                color: '#c2410c',
                fontWeight: '700',
                background: '#fff7ed',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #fed7aa'
              }}>
                <WifiOff size={15} color="#ea580c" />
                <span>Offline {pendingOfflineAdmissions.length > 0 ? `(${pendingOfflineAdmissions.length} Saved)` : 'Ready'}</span>
              </div>
            ) : isSyncing ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.825rem',
                color: '#ca8a04',
                fontWeight: '700',
                background: '#fefce8',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #fef08a'
              }}>
                <Loader2 size={15} className="animate-spin" color="#ca8a04" />
                <span>Syncing ({pendingOfflineAdmissions.length})</span>
              </div>
            ) : pendingOfflineAdmissions.length > 0 ? (
              <button onClick={triggerAutoSyncAdmissions} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.825rem',
                color: '#2563eb',
                fontWeight: '700',
                background: '#eff6ff',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #bfdbfe',
                cursor: 'pointer'
              }}>
                <RefreshCw size={15} color="#2563eb" />
                <span>Sync Now ({pendingOfflineAdmissions.length})</span>
              </button>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.825rem',
                color: '#059669',
                fontWeight: '700',
                background: '#ecfdf5',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #a7f3d0'
              }}>
                <Wifi size={15} color="#059669" />
                <span>Cloud Connected</span>
              </div>
            )}

            {activeView === "new_admission" ? (
              <button
                className="submit-btn"
                onClick={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Save size={20} />
                )}
                <span>{isLoading ? "Processing..." : "Complete Admission"}</span>
              </button>
            ) : (
              <button
                className="submit-btn"
                onClick={() => setActiveView("new_admission")}
              >
                <UserPlus size={20} />
                <span>Enroll New Student</span>
              </button>
            )}
          </div>
        </header>

        {/* Top Navigation Tabs */}
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            margin: "1.75rem 0 0",
            padding: "0 2.5rem",
            display: "flex",
            gap: "0.75rem",
            position: "relative",
            zIndex: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveView("new_admission")}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "14px",
              fontWeight: "800",
              fontSize: "0.95rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
              border:
                activeView === "new_admission"
                  ? "3px solid #ffffff"
                  : "2px solid rgba(255, 255, 255, 0.3)",
              background:
                activeView === "new_admission"
                  ? "#ffffff"
                  : "rgba(255, 255, 255, 0.15)",
              color: activeView === "new_admission" ? "#4338ca" : "#ffffff",
              boxShadow:
                activeView === "new_admission"
                  ? "0 6px 16px rgba(0,0,0,0.15)"
                  : "none",
            }}
          >
            <UserPlus size={18} />
            <span>New Admission Form</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("history")}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "14px",
              fontWeight: "800",
              fontSize: "0.95rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
              border:
                activeView === "history"
                  ? "3px solid #ffffff"
                  : "2px solid rgba(255, 255, 255, 0.3)",
              background:
                activeView === "history"
                  ? "#ffffff"
                  : "rgba(255, 255, 255, 0.15)",
              color: activeView === "history" ? "#4338ca" : "#ffffff",
              boxShadow:
                activeView === "history"
                  ? "0 6px 16px rgba(0,0,0,0.15)"
                  : "none",
            }}
          >
            <History size={18} />
            <span>Admissions History</span>
          </button>
        </div>
      </div>

      {activeView === "history" ? (
        <AdmissionHistory />
      ) : (
        <div className="admission-container">
        <form onSubmit={handleSubmit}>
          {/* Parent Details Section */}
          <section
            className="form-section"
            style={{
              background: "#f0f9ff",
              border: "2px solid #bae6fd",
              boxShadow: "8px 8px 0px #bae6fd",
            }}
          >
            <div className="bg-decor-icon">
              <Users size={200} />
            </div>

            <div
              className="section-header"
              style={{ justifyContent: "space-between", paddingRight: "1rem" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <div className="section-icon-box">
                  <Users size={24} />
                </div>
                <h2 className="section-title-text">
                  {parentInputStep === 1
                    ? "Parent / Guardian Details"
                    : "Account Setup & Linking"}
                </h2>
              </div>
              {parentInputStep === 1 ? (
                <button
                  type="button"
                  onClick={handleParentNext}
                  className="submit-btn"
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.9rem",
                    gap: "0.5rem",
                  }}
                >
                  Next <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setParentInputStep(1)}
                  className="submit-btn"
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.9rem",
                    gap: "0.5rem",
                    background: "#64748b",
                  }}
                >
                  <ChevronLeft size={18} /> Back
                </button>
              )}
            </div>

            {parentInputStep === 1 && (
              <>
                <div className="form-grid">
                  <div className="input-group">
                    <label className="input-label">Father's Name</label>
                    <div className="input-wrapper">
                      <input
                        type="text"
                        name="fatherName"
                        value={parentDetails.fatherName}
                        onChange={handleParentChange}
                        className="modern-input"
                        placeholder="Enter father's name"
                        required
                      />
                      <User className="input-icon" size={20} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Parent's Occupation</label>
                    <div className="input-wrapper">
                      <input
                        type="text"
                        name="occupation"
                        value={parentDetails.occupation}
                        onChange={handleParentChange}
                        className="modern-input"
                        placeholder="Enter occupation"
                        required
                      />
                      <Briefcase className="input-icon" size={20} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Primary Phone</label>
                    <div className="input-wrapper">
                      <input
                        type="tel"
                        name="phone"
                        value={parentDetails.phone}
                        onChange={handleParentChange}
                        className="modern-input"
                        placeholder="Enter primary contact"
                        required
                      />
                      <Phone className="input-icon" size={20} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label">
                      Emergency Phone (Optional)
                    </label>
                    <div className="input-wrapper">
                      <input
                        type="tel"
                        name="emergencyPhone"
                        value={parentDetails.emergencyPhone}
                        onChange={handleParentChange}
                        className="modern-input"
                        placeholder="Emergency contact"
                      />
                      <Phone className="input-icon" size={20} />
                    </div>
                  </div>

                  <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                    <label className="input-label">Residential Address</label>
                    <div className="input-wrapper">
                      <textarea
                        name="address"
                        value={parentDetails.address}
                        onChange={handleParentChange}
                        className="modern-input modern-textarea"
                        placeholder="Enter full address"
                        required
                      />
                      <MapPin
                        className="input-icon"
                        size={20}
                        style={{ top: "1.5rem", transform: "none" }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {parentInputStep === 2 && (
              <>
                <div
                  className="parent-search-box"
                  style={{
                    margin: "0 1.5rem 2rem",
                    background: "#f8fafc",
                    padding: "1rem",
                    borderRadius: "12px",
                    border: existingParent
                      ? "2px solid #10b981"
                      : "1px solid #e2e8f0",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "600",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Check for Existing Parent Account
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="text"
                      placeholder="Enter Phone Number..."
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                      }}
                      disabled={existingParent !== null}
                    />
                    {existingParent ? (
                      <button
                        type="button"
                        onClick={handleResetParent}
                        style={{
                          padding: "0 1.5rem",
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "600",
                        }}
                      >
                        Reset
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSearchParent}
                        style={{
                          padding: "0 1.5rem",
                          background: "var(--primary)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "600",
                        }}
                      >
                        {isSearchingParent ? "Searching..." : "Search"}
                      </button>
                    )}
                  </div>
                  {existingParent && (
                    <div
                      style={{
                        marginTop: "1rem",
                        color: "#047857",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          background: "#10b981",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontSize: "12px",
                        }}
                      >
                        ✓
                      </div>
                      Existing Account Found: {existingParent.name} (Linked
                      Students:{" "}
                      {existingParent.linkedStudents
                        ? existingParent.linkedStudents.length
                        : 0}
                      )
                    </div>
                  )}
                  {!existingParent &&
                    searchPhone.length > 5 &&
                    !isSearchingParent && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        No account pulled yet. Fill below to create a new one.
                      </div>
                    )}
                </div>

                {!existingParent && (
                  <>
                    <div className="form-grid" style={{ marginTop: "1.5rem" }}>
                      <div className="input-group">
                        <label className="input-label">Login Email</label>
                        <div className="input-wrapper">
                          <input
                            type="email"
                            name="email"
                            value={parentDetails.email}
                            onChange={handleParentChange}
                            className="modern-input"
                            placeholder="e.g. parent@example.com"
                            required={!existingParent}
                          />
                        </div>
                      </div>
                      <div className="input-group">
                        <label className="input-label">Create Password</label>
                        <div className="input-wrapper">
                          <input
                            type="text"
                            name="password"
                            value={parentDetails.password}
                            onChange={handleParentChange}
                            className="modern-input"
                            placeholder="Set secure password"
                            required={!existingParent}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Link Sibling Widget */}
                <div
                  style={{
                    marginTop: "2rem",
                    background: "#eff6ff",
                    padding: "1rem",
                    borderRadius: "16px",
                    border: "1px dashed #6366f1",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                    onClick={() => setShowLinkSibling(!showLinkSibling)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
                        }}
                      >
                        <Plus size={16} color="var(--primary)" />
                      </div>
                      <label
                        className="input-label"
                        style={{
                          marginBottom: 0,
                          cursor: "pointer",
                          color: "var(--primary)",
                          fontSize: "1rem",
                        }}
                      >
                        Link Existing Siblings (Optional)
                      </label>
                    </div>
                    <span
                      style={{ color: "var(--primary)", fontWeight: "bold" }}
                    >
                      {showLinkSibling ? "▲" : "▼"}
                    </span>
                  </div>

                  {showLinkSibling && (
                    <div
                      className="animate-fade-in-up"
                      style={{
                        marginTop: "1.5rem",
                        paddingTop: "1.5rem",
                        borderTop: "1px solid rgba(99, 102, 241, 0.1)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-secondary)",
                          marginBottom: "1rem",
                          lineHeight: "1.5",
                        }}
                      >
                        If this family already has other children in our school,
                        find and add them here. This ensures all children appear
                        under the same parent account.
                      </p>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr auto",
                          gap: "1rem",
                          marginBottom: "1rem",
                        }}
                      >
                        <select
                          value={siblingClassId}
                          onChange={(e) => setSiblingClassId(e.target.value)}
                          style={{
                            padding: "0.75rem",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            outline: "none",
                          }}
                        >
                          <option value="">Select Sibling's Class</option>
                          {availableClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={selectedSiblingId}
                          onChange={(e) => setSelectedSiblingId(e.target.value)}
                          disabled={!siblingClassId}
                          style={{
                            padding: "0.75rem",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            outline: "none",
                            opacity: siblingClassId ? 1 : 0.6,
                          }}
                        >
                          <option value="">Select Student</option>
                          {availableSiblings.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.rollNo})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={addSiblingLink}
                          disabled={!selectedSiblingId}
                          style={{
                            background: "var(--primary)",
                            color: "white",
                            border: "none",
                            padding: "0 1.5rem",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontWeight: "600",
                            opacity: selectedSiblingId ? 1 : 0.6,
                          }}
                        >
                          Link
                        </button>
                      </div>

                      {linkedSiblings.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.75rem",
                          }}
                        >
                          {linkedSiblings.map((sib) => (
                            <div
                              key={sib.studentId}
                              style={{
                                background: "white",
                                border: "1px solid #e2e8f0",
                                padding: "0.5rem 1rem",
                                borderRadius: "24px",
                                fontSize: "0.9rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                color: "var(--text-main)",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: "600",
                                  color: "var(--primary)",
                                }}
                              >
                                {sib.studentName}
                              </span>
                              <span
                                style={{
                                  color: "var(--text-secondary)",
                                  fontSize: "0.85em",
                                }}
                              >
                                {sib.className}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSiblingLink(sib.studentId)}
                                style={{
                                  background: "#fee2e2",
                                  border: "none",
                                  borderRadius: "50%",
                                  width: "20px",
                                  height: "20px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  color: "#ef4444",
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Dynamic Students Section */}
          <div style={{ paddingBottom: "3rem" }}>
            <div className="section-header" style={{ marginBottom: "1rem" }}>
              <div
                className="section-icon-box"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(59, 130, 246, 0.1))",
                  color: "var(--secondary)",
                }}
              >
                <School size={24} />
              </div>
              <h2 className="section-title-text">Student Details</h2>
            </div>

            <AnimatePresence>
              {students.map((student, index) => {
                const monthlyTotal = (student.feeStructure || []).reduce(
                  (sum, f) => sum + (Number(f.amount) || 0),
                  0
                );
                const actionsTotal = (student.individualActions || []).reduce(
                  (sum, a) => sum + (Number(a.amount) || 0),
                  0
                );
                const grandTotal = monthlyTotal + actionsTotal;
                const hasFees =
                  (student.feeStructure || []).length > 0 ||
                  (student.individualActions || []).length > 0;
                const isFeeTab = studentCardTabs[index] === "fee";

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.3 }}
                    className="slide-card-wrapper"
                  >
                    <AnimatePresence mode="wait">
                      {!isFeeTab ? (
                        <motion.div
                          key="info-card"
                          initial={{ x: -30, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: -30, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="student-card"
                          style={{
                            background: "#3b82f6",
                            border: "2px solid #1e40af",
                            boxShadow: "8px 8px 0px #1e40af",
                            color: "white",
                            marginBottom: 0,
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          {/* Background Decor Watermark */}
                          <div className="card-bg-decor-watermark">
                            <GraduationCap size={200} />
                          </div>

                          <div
                            className="student-header"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.2)", position: "relative", zIndex: 1 }}
                          >
                            <h3
                              className="section-title-text"
                              style={{
                                fontSize: "1.1rem",
                                display: "flex",
                                alignItems: "center",
                                color: "white",
                              }}
                            >
                              <span
                                className="student-number-badge"
                                style={{
                                  background: "rgba(255,255,255,0.2)",
                                  color: "white",
                                }}
                              >
                                {index + 1}
                              </span>
                              Student Information
                            </h3>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setStudentTab(index, "fee")}
                                className={`fee-flip-btn ${
                                  hasFees ? "has-fees" : ""
                                }`}
                                title="Setup / View Fees for this student"
                              >
                              <Wallet size={16} />
                              <span>
                                {hasFees
                                  ? `Fees: ₨ ${monthlyTotal.toLocaleString()}/mo ${
                                      actionsTotal > 0
                                        ? `+ ₨ ${actionsTotal.toLocaleString()} 1-Time`
                                        : ""
                                    } ✓`
                                  : "Setup Fees & Finance ↻"}
                              </span>
                            </button>

                            {students.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeStudent(index)}
                                className="remove-btn"
                                title="Remove Student"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="form-grid">
                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              First Name
                            </label>
                            <div className="input-wrapper">
                              <input
                                type="text"
                                name="firstName"
                                value={student.firstName}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input"
                                required
                              />
                            </div>
                          </div>

                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Last Name
                            </label>
                            <div className="input-wrapper">
                              <input
                                type="text"
                                name="lastName"
                                value={student.lastName}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input"
                                required
                              />
                            </div>
                          </div>

                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Admission No
                            </label>
                            <div className="input-wrapper">
                              <input
                                type="text"
                                name="admissionNo"
                                value={student.admissionNo}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input"
                                placeholder="e.g. ADM-001"
                              />
                            </div>
                          </div>

                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Roll Number
                            </label>
                            <div className="input-wrapper">
                              <input
                                type="text"
                                name="rollNo"
                                value={student.rollNo}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input"
                                placeholder="e.g. 101"
                                required
                              />
                            </div>
                          </div>

                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Date of Birth
                            </label>
                            <div className="input-wrapper">
                              <input
                                type="date"
                                name="dob"
                                value={student.dob}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input"
                                required
                              />
                              <Calendar
                                className="input-icon"
                                size={20}
                                style={{ color: "white" }}
                              />
                            </div>
                          </div>

                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Gender
                            </label>
                            <div className="input-wrapper">
                              <select
                                name="gender"
                                value={student.gender}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input modern-select"
                              >
                                <option value="select" disabled>
                                  Select Gender
                                </option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>

                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Admission Class
                            </label>
                            <div className="input-wrapper">
                              <select
                                name="admissionClass"
                                value={student.admissionClass}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input modern-select"
                                required
                              >
                                <option value="" disabled>
                                  Select Class
                                </option>
                                {availableClasses.length > 0 ? (
                                  availableClasses.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                      {cls.name}
                                    </option>
                                  ))
                                ) : (
                                  <option value="" disabled>
                                    Loading classes...
                                  </option>
                                )}
                              </select>
                            </div>
                          </div>

                          <div className="input-group">
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Previous School
                            </label>
                            <div className="input-wrapper">
                              <input
                                type="text"
                                name="previousSchool"
                                value={student.previousSchool}
                                onChange={(e) => handleStudentChange(index, e)}
                                className="modern-input"
                                placeholder="Optional"
                              />
                            </div>
                          </div>

                          <div
                            className="input-group"
                            style={{ gridColumn: "1 / -1" }}
                          >
                            <label
                              className="input-label"
                              style={{ color: "rgba(255,255,255,0.8)" }}
                            >
                              Student Photo
                            </label>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "1.5rem",
                                marginTop: "0.5rem",
                              }}
                            >
                              <div
                                style={{
                                  width: "80px",
                                  height: "80px",
                                  borderRadius: "50%",
                                  background: "rgba(255,255,255,0.1)",
                                  border: "2px dashed rgba(255,255,255,0.3)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  overflow: "hidden",
                                  position: "relative",
                                }}
                              >
                                {student.profilePic ? (
                                  <img
                                    src={student.profilePic}
                                    alt="Preview"
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <Camera
                                    size={32}
                                    color="rgba(255,255,255,0.5)"
                                  />
                                )}
                              </div>
                              <div>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleImageUpload(index, e)}
                                  id={`photo-upload-${index}`}
                                  style={{ display: "none" }}
                                />
                                <label
                                  htmlFor={`photo-upload-${index}`}
                                  style={{
                                    display: "inline-block",
                                    padding: "0.6rem 1.2rem",
                                    background: "white",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    fontSize: "0.9rem",
                                    fontWeight: "600",
                                    color: "var(--text-main)",
                                    transition: "all 0.2s",
                                  }}
                                >
                                  Upload Photo
                                </label>
                                <p
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "rgba(255,255,255,0.7)",
                                    marginTop: "0.25rem",
                                  }}
                                >
                                  JPG, PNG up to 2MB
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      /* ================= FINANCE SIDE: Windows 7 / Aero Clean Professional Desktop UI ================= */
                      <motion.div
                        key="finance-card"
                        initial={{ x: 25, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 25, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        className="finance-back-card"
                        style={{
                          background: "#ffffff",
                          border: "1.5px solid #cbd5e1",
                          borderRadius: "18px",
                          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)",
                          color: "#0f172a",
                          marginBottom: 0,
                          position: "relative",
                          overflow: "hidden",
                          padding: 0,
                        }}
                      >
                        {/* Windows 7 / Aero Header Title Bar */}
                        <div
                          style={{
                            background: "linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%)",
                            borderBottom: "1.5px solid #cbd5e1",
                            padding: "1.1rem 1.5rem",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "9px",
                                background: "linear-gradient(135deg, #0078d4 0%, #005a9e 100%)",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: "0 2px 6px rgba(0, 120, 212, 0.3)",
                              }}
                            >
                              <Wallet size={18} />
                            </div>
                            <div>
                              <h3
                                style={{
                                  fontSize: "1.05rem",
                                  fontWeight: "800",
                                  margin: 0,
                                  color: "#0f172a",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                }}
                              >
                                <span>Fee & Payment Structure Setup</span>
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    padding: "2px 7px",
                                    borderRadius: "999px",
                                    background: "#e0f2fe",
                                    color: "#0369a1",
                                    border: "1px solid #bae6fd",
                                    fontWeight: "800",
                                  }}
                                >
                                  Student #{index + 1}
                                </span>
                              </h3>
                              <p
                                style={{
                                  margin: "0.15rem 0 0",
                                  fontSize: "0.78rem",
                                  color: "#64748b",
                                  fontWeight: "600",
                                }}
                              >
                                {student.firstName || student.lastName
                                  ? `${student.firstName} ${student.lastName}`
                                  : `New Enrolment`}{" "}
                                • Live Real-time SSOT Sync with Parent App
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setStudentTab(index, "info")}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              padding: "0.45rem 0.9rem",
                              borderRadius: "8px",
                              border: "1.5px solid #cbd5e1",
                              background: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)",
                              color: "#334155",
                              fontSize: "0.8rem",
                              fontWeight: "700",
                              cursor: "pointer",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#e2e8f0";
                              e.currentTarget.style.color = "#0f172a";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)";
                              e.currentTarget.style.color = "#334155";
                            }}
                          >
                            <ArrowLeft size={14} />
                            <span>← Back to Student Info</span>
                          </button>
                        </div>

                        {/* Card Body Container */}
                        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                          
                          {/* Segmented Mode Selector: Recurring vs One-Time */}
                          <div
                            style={{
                              display: "flex",
                              background: "#f1f5f9",
                              padding: "4px",
                              borderRadius: "12px",
                              border: "1.5px solid #cbd5e1",
                              gap: "4px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...students];
                                updated[index].newFeeMode = "recurring";
                                updated[index].newFeeCategory = RECURRING_CATEGORIES[0];
                                setStudents(updated);
                              }}
                              style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.45rem",
                                padding: "0.6rem 1rem",
                                borderRadius: "8px",
                                border: student.newFeeMode !== "action" ? "1.5px solid #93c5fd" : "1.5px solid transparent",
                                background: student.newFeeMode !== "action" ? "#ffffff" : "transparent",
                                color: student.newFeeMode !== "action" ? "#0078d4" : "#64748b",
                                fontWeight: "800",
                                fontSize: "0.85rem",
                                cursor: "pointer",
                                boxShadow: student.newFeeMode !== "action" ? "0 2px 5px rgba(0, 120, 212, 0.15)" : "none",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <RotateCcw size={15} />
                              <span>🔄 Permanent / Monthly Recurring</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...students];
                                updated[index].newFeeMode = "action";
                                updated[index].newFeeCategory = ACTION_CATEGORIES[0];
                                setStudents(updated);
                              }}
                              style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.45rem",
                                padding: "0.6rem 1rem",
                                borderRadius: "8px",
                                border: student.newFeeMode === "action" ? "1.5px solid #fcd34d" : "1.5px solid transparent",
                                background: student.newFeeMode === "action" ? "#ffffff" : "transparent",
                                color: student.newFeeMode === "action" ? "#b45309" : "#64748b",
                                fontWeight: "800",
                                fontSize: "0.85rem",
                                cursor: "pointer",
                                boxShadow: student.newFeeMode === "action" ? "0 2px 5px rgba(245, 158, 11, 0.15)" : "none",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <Sparkles size={15} />
                              <span>⚡ 1-Time / Admission Action Charge</span>
                            </button>
                          </div>

                          {/* Add Fee Inputs Card Deck */}
                          <div
                            style={{
                              background: "#f8fafc",
                              padding: "1.1rem",
                              borderRadius: "14px",
                              border: "1.5px solid #e2e8f0",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.85rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "0.85rem",
                                alignItems: "flex-end",
                                flexWrap: "wrap",
                              }}
                            >
                              {/* Category Dropdown */}
                              <div style={{ flex: 1.5, minWidth: "220px" }}>
                                <label
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: "800",
                                    color: "#475569",
                                    display: "block",
                                    marginBottom: "0.35rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  {student.newFeeMode === "action"
                                    ? "⚡ 1-Time Charge Category"
                                    : "🔄 Monthly Fee Head"}
                                </label>
                                <select
                                  value={student.newFeeCategory}
                                  onChange={(e) => {
                                    const updated = [...students];
                                    updated[index].newFeeCategory = e.target.value;
                                    setStudents(updated);
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "0.6rem 0.85rem",
                                    borderRadius: "8px",
                                    border: "1.5px solid #cbd5e1",
                                    background: "#ffffff",
                                    color: "#0f172a",
                                    fontSize: "0.88rem",
                                    fontWeight: "700",
                                    outline: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  {student.newFeeMode === "action" ? (
                                    <>
                                      {ACTION_CATEGORIES.map((cat) => (
                                        <option key={cat} value={cat}>
                                          {cat}
                                        </option>
                                      ))}
                                    </>
                                  ) : (
                                    <>
                                      {RECURRING_CATEGORIES.map((cat) => (
                                        <option key={cat} value={cat}>
                                          {cat}
                                        </option>
                                      ))}
                                    </>
                                  )}
                                </select>
                              </div>

                              {/* Amount Input */}
                              <div style={{ flex: 1, minWidth: "160px" }}>
                                <label
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: "800",
                                    color: "#475569",
                                    display: "block",
                                    marginBottom: "0.35rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  Amount (PKR)
                                </label>
                                <div style={{ position: "relative" }}>
                                  <span
                                    style={{
                                      position: "absolute",
                                      left: "10px",
                                      top: "50%",
                                      transform: "translateY(-50%)",
                                      fontSize: "0.82rem",
                                      fontWeight: "800",
                                      color: "#64748b",
                                    }}
                                  >
                                    Rs
                                  </span>
                                  <input
                                    type="number"
                                    value={student.newFeeAmount}
                                    onChange={(e) => {
                                      const updated = [...students];
                                      updated[index].newFeeAmount = e.target.value;
                                      setStudents(updated);
                                    }}
                                    placeholder="e.g. 3500"
                                    style={{
                                      width: "100%",
                                      padding: "0.6rem 0.85rem 0.6rem 2.2rem",
                                      borderRadius: "8px",
                                      border: "1.5px solid #cbd5e1",
                                      background: "#ffffff",
                                      color: "#0f172a",
                                      fontSize: "0.9rem",
                                      fontWeight: "800",
                                      outline: "none",
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Add Fee Button */}
                              <div>
                                <button
                                  type="button"
                                  onClick={() => handleAddFee(index)}
                                  disabled={!student.newFeeAmount || Number(student.newFeeAmount) <= 0}
                                  style={{
                                    padding: "0.62rem 1.35rem",
                                    borderRadius: "8px",
                                    border: "none",
                                    background:
                                      student.newFeeAmount && Number(student.newFeeAmount) > 0
                                        ? "linear-gradient(180deg, #0078d4 0%, #005a9e 100%)"
                                        : "#e2e8f0",
                                    color:
                                      student.newFeeAmount && Number(student.newFeeAmount) > 0
                                        ? "#ffffff"
                                        : "#94a3b8",
                                    fontWeight: "800",
                                    fontSize: "0.85rem",
                                    cursor:
                                      student.newFeeAmount && Number(student.newFeeAmount) > 0
                                        ? "pointer"
                                        : "not-allowed",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    boxShadow:
                                      student.newFeeAmount && Number(student.newFeeAmount) > 0
                                        ? "0 2px 6px rgba(0, 120, 212, 0.3)"
                                        : "none",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  <Plus size={15} />
                                  <span>+ Add Fee Head</span>
                                </button>
                              </div>
                            </div>

                            {/* Quick Amount Suggestion Chips */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                flexWrap: "wrap",
                                paddingTop: "0.2rem",
                                borderTop: "1px dashed #e2e8f0",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  color: "#64748b",
                                  fontWeight: "800",
                                  marginRight: "4px",
                                }}
                              >
                                Quick Presets:
                              </span>
                              {[500, 1000, 1500, 2000, 2500, 3000, 4000, 5000].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => {
                                    const updated = [...students];
                                    updated[index].newFeeAmount = String(amt);
                                    setStudents(updated);
                                  }}
                                  style={{
                                    padding: "0.2rem 0.55rem",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    color: "#334155",
                                    fontSize: "0.73rem",
                                    fontWeight: "800",
                                    cursor: "pointer",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                                    transition: "all 0.12s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = "#0078d4";
                                    e.currentTarget.style.color = "#0078d4";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = "#cbd5e1";
                                    e.currentTarget.style.color = "#334155";
                                  }}
                                >
                                  +Rs {amt.toLocaleString()}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Active Fee Structure Ledger Display */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            
                            {/* Column 1: Monthly Recurring Fees */}
                            <div
                              style={{
                                background: "#f8fafc",
                                borderRadius: "12px",
                                border: "1.5px solid #e2e8f0",
                                padding: "0.85rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.6rem",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  paddingBottom: "0.4rem",
                                  borderBottom: "1px solid #e2e8f0",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.78rem",
                                    fontWeight: "800",
                                    color: "#0369a1",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                  }}
                                >
                                  <RotateCcw size={13} /> Monthly Recurring ({student.feeStructure?.length || 0})
                                </span>
                                <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#0369a1" }}>
                                  Rs {monthlyTotal.toLocaleString()}/mo
                                </span>
                              </div>

                              {(!student.feeStructure || student.feeStructure.length === 0) ? (
                                <div
                                  style={{
                                    padding: "1.5rem 1rem",
                                    textAlign: "center",
                                    color: "#94a3b8",
                                    fontSize: "0.8rem",
                                    background: "#ffffff",
                                    borderRadius: "8px",
                                    border: "1px dashed #cbd5e1",
                                  }}
                                >
                                  No monthly recurring fees added yet.
                                </div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                  {student.feeStructure.map((fee) => (
                                    <div
                                      key={fee.id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "0.5rem 0.75rem",
                                        background: "#ffffff",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: "8px",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                                      }}
                                    >
                                      <div>
                                        <strong style={{ color: "#0f172a", fontSize: "0.84rem", display: "block" }}>
                                          {fee.name}
                                        </strong>
                                        <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Monthly Fixed</span>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                        <span style={{ fontWeight: "800", color: "#0369a1", fontSize: "0.88rem" }}>
                                          Rs {Number(fee.amount).toLocaleString()}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveFee(index, fee.id, false)}
                                          style={{
                                            background: "#fee2e2",
                                            border: "1px solid #fecaca",
                                            borderRadius: "5px",
                                            color: "#dc2626",
                                            cursor: "pointer",
                                            padding: "3px 6px",
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                          title="Remove Fee Head"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Column 2: 1-Time Admission Action Charges */}
                            <div
                              style={{
                                background: "#fdf8f6",
                                borderRadius: "12px",
                                border: "1.5px solid #fed7aa",
                                padding: "0.85rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.6rem",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  paddingBottom: "0.4rem",
                                  borderBottom: "1px solid #fed7aa",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.78rem",
                                    fontWeight: "800",
                                    color: "#9a3412",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                  }}
                                >
                                  <Sparkles size={13} /> 1-Time Admission Charges ({student.individualActions?.length || 0})
                                </span>
                                <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#9a3412" }}>
                                  Rs {actionsTotal.toLocaleString()}
                                </span>
                              </div>

                              {(!student.individualActions || student.individualActions.length === 0) ? (
                                <div
                                  style={{
                                    padding: "1.5rem 1rem",
                                    textAlign: "center",
                                    color: "#94a3b8",
                                    fontSize: "0.8rem",
                                    background: "#ffffff",
                                    borderRadius: "8px",
                                    border: "1px dashed #fed7aa",
                                  }}
                                >
                                  No 1-time charges added (e.g. Admission fee, Security, Uniform).
                                </div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                  {student.individualActions.map((act) => (
                                    <div
                                      key={act.id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "0.5rem 0.75rem",
                                        background: "#ffffff",
                                        border: "1px solid #fed7aa",
                                        borderRadius: "8px",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                                      }}
                                    >
                                      <div>
                                        <strong style={{ color: "#0f172a", fontSize: "0.84rem", display: "block" }}>
                                          {act.name}
                                        </strong>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleActionStatus(index, act.id)}
                                          style={{
                                            fontSize: "0.68rem",
                                            fontWeight: "800",
                                            padding: "1px 6px",
                                            borderRadius: "4px",
                                            border: act.status === "paid" ? "1px solid #86efac" : "1px solid #cbd5e1",
                                            background: act.status === "paid" ? "#dcfce7" : "#f1f5f9",
                                            color: act.status === "paid" ? "#15803d" : "#64748b",
                                            cursor: "pointer",
                                            marginTop: "2px",
                                          }}
                                          title="Toggle Paid/Unpaid"
                                        >
                                          {act.status === "paid" ? "✓ Paid" : "● Unpaid"}
                                        </button>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                        <span style={{ fontWeight: "800", color: "#9a3412", fontSize: "0.88rem" }}>
                                          Rs {Number(act.amount).toLocaleString()}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveFee(index, act.id, true)}
                                          style={{
                                            background: "#fee2e2",
                                            border: "1px solid #fecaca",
                                            borderRadius: "5px",
                                            color: "#dc2626",
                                            cursor: "pointer",
                                            padding: "3px 6px",
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                          title="Remove Charge"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* On-The-Spot Admission Payment Handler (Cashier Drawer) */}
                          <div
                            style={{
                              background: student.markPaidAtAdmission
                                ? "linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)"
                                : "#f8fafc",
                              border: student.markPaidAtAdmission
                                ? "1.5px solid #86efac"
                                : "1.5px solid #cbd5e1",
                              borderRadius: "14px",
                              padding: "0.9rem 1.15rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.6rem",
                              transition: "all 0.2s ease",
                              boxShadow: student.markPaidAtAdmission
                                ? "0 4px 12px rgba(16, 185, 129, 0.12)"
                                : "none",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: "0.6rem",
                              }}
                            >
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.6rem",
                                  cursor: "pointer",
                                  fontWeight: "800",
                                  fontSize: "0.88rem",
                                  color: student.markPaidAtAdmission ? "#14532d" : "#334155",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={student.markPaidAtAdmission}
                                  onChange={(e) => {
                                    const updated = [...students];
                                    updated[index].markPaidAtAdmission = e.target.checked;
                                    setStudents(updated);
                                  }}
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    accentColor: "#16a34a",
                                    cursor: "pointer",
                                  }}
                                />
                                <span>💵 Receive Payment at Admission Desk (Generate Official Slip & Log to Finances)</span>
                              </label>

                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                {student.markPaidAtAdmission && (
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: "800",
                                      background: "#15803d",
                                      color: "#ffffff",
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      boxShadow: "0 1px 3px rgba(21, 128, 61, 0.3)",
                                    }}
                                  >
                                    ✓ RECEIPT ACTIVE
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handlePreviewReceipt(index)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    padding: "0.38rem 0.85rem",
                                    borderRadius: "8px",
                                    border: "1.5px solid #0284c7",
                                    background: "linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)",
                                    color: "#ffffff",
                                    fontSize: "0.78rem",
                                    fontWeight: "800",
                                    cursor: "pointer",
                                    boxShadow: "0 2px 5px rgba(2, 132, 199, 0.25)",
                                    transition: "all 0.15s ease",
                                  }}
                                  title="Print or Download Deposit Slip / Cashier Copy"
                                >
                                  <Download size={14} />
                                  <span>Print / PDF Slip</span>
                                </button>
                              </div>
                            </div>

                            {student.markPaidAtAdmission && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  paddingTop: "0.4rem",
                                  borderTop: "1px solid rgba(22, 163, 74, 0.2)",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.78rem",
                                    color: "#166534",
                                    fontWeight: "800",
                                  }}
                                >
                                  Collection Channel:
                                </span>
                                {[
                                  { label: "💵 Cash", val: "Cash" },
                                  { label: "📱 Online Portal", val: "Online" },
                                  { label: "🟢 EasyPaisa / JazzCash", val: "EasyPaisa" },
                                  { label: "🏦 Bank Transfer", val: "Bank" },
                                  { label: "💳 POS Card", val: "Card" },
                                ].map((mode) => (
                                  <button
                                    key={mode.val}
                                    type="button"
                                    onClick={() => {
                                      const updated = [...students];
                                      updated[index].feePaymentMode = mode.val;
                                      setStudents(updated);
                                    }}
                                    style={{
                                      padding: "0.25rem 0.65rem",
                                      borderRadius: "6px",
                                      border:
                                        (student.feePaymentMode || "Cash") === mode.val
                                          ? "1.5px solid #15803d"
                                          : "1px solid #cbd5e1",
                                      background:
                                        (student.feePaymentMode || "Cash") === mode.val
                                          ? "#16a34a"
                                          : "#ffffff",
                                      color:
                                        (student.feePaymentMode || "Cash") === mode.val
                                          ? "#ffffff"
                                          : "#334155",
                                      fontSize: "0.75rem",
                                      fontWeight: "800",
                                      cursor: "pointer",
                                      boxShadow:
                                        (student.feePaymentMode || "Cash") === mode.val
                                          ? "0 2px 5px rgba(22, 163, 74, 0.25)"
                                          : "none",
                                      transition: "all 0.12s ease",
                                    }}
                                  >
                                    {mode.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Windows 7 / Aero Bottom Financial Status Bar */}
                        <div
                          style={{
                            background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
                            borderTop: "1.5px solid #cbd5e1",
                            padding: "0.9rem 1.5rem",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "1rem",
                            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
                            <div>
                              <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: "800", textTransform: "uppercase", display: "block" }}>
                                Monthly Recurring
                              </span>
                              <strong style={{ fontSize: "1.05rem", color: "#0369a1", fontWeight: "900" }}>
                                Rs {monthlyTotal.toLocaleString()}
                              </strong>
                            </div>

                            <div style={{ width: "1px", height: "26px", background: "#cbd5e1" }} />

                            <div>
                              <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: "800", textTransform: "uppercase", display: "block" }}>
                                1-Time Admission Dues
                              </span>
                              <strong style={{ fontSize: "1.05rem", color: "#9a3412", fontWeight: "900" }}>
                                Rs {actionsTotal.toLocaleString()}
                              </strong>
                            </div>

                            <div style={{ width: "1px", height: "26px", background: "#cbd5e1" }} />

                            <div style={{ background: "#ffffff", padding: "4px 12px", borderRadius: "8px", border: "1.5px solid #86efac", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                              <span style={{ fontSize: "0.68rem", color: "#166534", fontWeight: "800", textTransform: "uppercase", display: "block" }}>
                                Total at Admission
                              </span>
                              <strong style={{ fontSize: "1.2rem", color: "#15803d", fontWeight: "900" }}>
                                Rs {(monthlyTotal + actionsTotal).toLocaleString()}
                              </strong>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setStudentTab(index, "info")}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              padding: "0.65rem 1.4rem",
                              borderRadius: "10px",
                              border: "1px solid #16a34a",
                              background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
                              color: "#ffffff",
                              fontSize: "0.88rem",
                              fontWeight: "800",
                              cursor: "pointer",
                              boxShadow: "0 2px 8px rgba(22, 163, 74, 0.3)",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-1px)";
                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(22, 163, 74, 0.4)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "none";
                              e.currentTarget.style.boxShadow = "0 2px 8px rgba(22, 163, 74, 0.3)";
                            }}
                          >
                            <Check size={16} />
                            <span>✓ Done & Return to Student Info</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
              })}
            </AnimatePresence>

            <button
              type="button"
              onClick={addStudent}
              className="add-sibling-btn"
            >
              <Plus size={24} />
              Add Another Sibling
            </button>
          </div>
        </form>
      </div>
      )}

      {/* Receipt Modal - Clean Centered Dialog Overlay via createPortal */}
      {showReceipt && receiptData && typeof document !== "undefined" && createPortal(
        <div
          className="receipt-modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Inter', sans-serif",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(6px)",
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowReceipt(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "860px",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.5)",
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              position: "relative",
            }}
          >
            {/* Integrated Top Action Toolbar */}
            <div
              className="no-print"
              style={{
                padding: "0.85rem 1.25rem",
                background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
                borderBottom: "1.5px solid #cbd5e1",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "8px",
                    background: "#0284c7",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 4px rgba(2, 132, 199, 0.3)",
                  }}
                >
                  <Printer size={18} />
                </div>
                <div>
                  <span style={{ fontSize: "0.92rem", fontWeight: "900", color: "#0f172a", display: "block", lineHeight: "1.2" }}>
                    Admission Deposit Slip & Voucher
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: "600" }}>
                    Official Cashier Counter Stamp & Student Record
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.45rem 1.1rem",
                    borderRadius: "8px",
                    border: "1px solid #16a34a",
                    background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: "800",
                    cursor: "pointer",
                    boxShadow: "0 2px 5px rgba(22, 163, 74, 0.25)",
                    transition: "all 0.12s ease",
                  }}
                  title="Direct Print Slip"
                >
                  <Printer size={15} />
                  <span>Print Slip</span>
                </button>

                <button
                  type="button"
                  onClick={isDownloading ? undefined : handleDownloadPDF}
                  disabled={isDownloading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.45rem 1.1rem",
                    borderRadius: "8px",
                    border: "1px solid #0284c7",
                    background: "linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)",
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: "800",
                    cursor: isDownloading ? "not-allowed" : "pointer",
                    opacity: isDownloading ? 0.7 : 1,
                    boxShadow: "0 2px 5px rgba(2, 132, 199, 0.25)",
                    transition: "all 0.12s ease",
                  }}
                  title="Download as PDF Document"
                >
                  {isDownloading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Download size={15} />
                  )}
                  <span>{isDownloading ? "Generating..." : "Save PDF"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowReceipt(false)}
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                  title="Close Preview"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#fee2e2";
                    e.currentTarget.style.color = "#dc2626";
                    e.currentTarget.style.borderColor = "#fca5a5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#ffffff";
                    e.currentTarget.style.color = "#475569";
                    e.currentTarget.style.borderColor = "#cbd5e1";
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Receipt Body */}
            <div
              style={{
                overflowY: "auto",
                padding: "1.25rem",
                background: "#f1f5f9",
                flex: 1,
              }}
            >
              <div
                id="admission-receipt-container"
                style={{
                  width: "100%",
                  maxWidth: "800px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                  margin: "0 auto",
                }}
              >
                {receiptData.students.map((stu, index) => (
                  <div
                    key={index}
                    className="admission-receipt animate-fade-in-up"
                    style={{
                      background: "#ffffff",
                      color: "#1e293b",
                      width: "100%",
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      boxShadow: "0 4px 15px rgba(0,0,0,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      pageBreakAfter: "always",
                    }}
                  >
                    {/* Top Accent Strip */}
                    <div
                      style={{
                        height: "6px",
                        background: "linear-gradient(90deg, #0284c7 0%, #3b82f6 50%, #10b981 100%)",
                      }}
                    />

                    <div
                      style={{
                        padding: "1.25rem 1.6rem",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {/* School Header Banner */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                          marginBottom: "0.75rem",
                          borderBottom: "2px solid #e2e8f0",
                          paddingBottom: "0.75rem",
                        }}
                      >
                        {receiptData.schoolLogo ? (
                          <div
                            style={{
                              width: "64px",
                              height: "64px",
                              borderRadius: "10px",
                              border: "1.5px solid #e2e8f0",
                              padding: "2px",
                              background: "#ffffff",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                            }}
                          >
                            <img
                              src={receiptData.schoolLogo}
                              alt="School Logo"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                borderRadius: "6px",
                              }}
                            />
                          </div>
                        ) : null}

                        <div style={{ flex: 1, textAlign: receiptData.schoolLogo ? "left" : "center" }}>
                          <h2
                            style={{
                              fontSize: "1.55rem",
                              fontWeight: "900",
                              margin: "0 0 0.3rem",
                              color: "#0f172a",
                              letterSpacing: "-0.5px",
                              lineHeight: "1.2",
                            }}
                          >
                            {(receiptData.schoolName || "Our School").toUpperCase()}
                          </h2>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              justifyContent: receiptData.schoolLogo ? "flex-start" : "center",
                              gap: "1.2rem",
                              margin: "0.25rem 0",
                              fontSize: "0.82rem",
                              color: "#475569",
                              fontWeight: "600",
                            }}
                          >
                            {receiptData.schoolPhone && (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                <Phone size={13} color="#0284c7" />
                                <span>{receiptData.schoolPhone}</span>
                              </div>
                            )}
                            {receiptData.schoolEmergencyPhone && (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                <Phone size={13} color="#dc2626" />
                                <span>{receiptData.schoolEmergencyPhone} (Emergency)</span>
                              </div>
                            )}
                            {receiptData.schoolEmail && (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                <Mail size={13} color="#0284c7" />
                                <span>{receiptData.schoolEmail}</span>
                              </div>
                            )}
                          </div>

                          {receiptData.schoolAddress && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: receiptData.schoolLogo ? "flex-start" : "center",
                                gap: "0.35rem",
                                fontSize: "0.82rem",
                                color: "#64748b",
                                fontWeight: "500",
                                marginTop: "0.15rem",
                              }}
                            >
                              <MapPin size={13} color="#0284c7" />
                              <span>{receiptData.schoolAddress}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Official Subtitle */}
                      <div
                        style={{
                          textAlign: "center",
                          marginBottom: "1.25rem",
                          background: "#f8fafc",
                          padding: "0.45rem",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "0.88rem",
                            margin: 0,
                            color: "#334155",
                            fontWeight: "800",
                            letterSpacing: "1.5px",
                            textTransform: "uppercase",
                          }}
                        >
                          OFFICIAL ADMISSION RECORD & CASHIER DEPOSIT CHALLAN
                        </p>
                      </div>

                      {/* Metadata Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "1rem",
                          marginBottom: "1rem",
                        }}
                      >
                        <div
                          style={{
                            background: "#f8fafc",
                            padding: "0.85rem 1rem",
                            borderRadius: "10px",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <h4
                            style={{
                              margin: "0 0 0.6rem",
                              fontSize: "0.78rem",
                              color: "#64748b",
                              textTransform: "uppercase",
                              letterSpacing: "0.8px",
                              fontWeight: "800",
                            }}
                          >
                            Transaction Details
                          </h4>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "0.35rem",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span style={{ color: "#64748b" }}>Date:</span>{" "}
                            <span style={{ fontWeight: "700", color: "#0f172a" }}>
                              {receiptData.date}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span style={{ color: "#64748b" }}>Time:</span>{" "}
                            <span style={{ fontWeight: "700", color: "#0f172a" }}>
                              {receiptData.time}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#f8fafc",
                            padding: "0.85rem 1rem",
                            borderRadius: "10px",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <h4
                            style={{
                              margin: "0 0 0.6rem",
                              fontSize: "0.78rem",
                              color: "#64748b",
                              textTransform: "uppercase",
                              letterSpacing: "0.8px",
                              fontWeight: "800",
                            }}
                          >
                            Parent / Guardian
                          </h4>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "0.35rem",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span style={{ color: "#64748b" }}>Name:</span>{" "}
                            <span style={{ fontWeight: "800", color: "#0f172a" }}>
                              {receiptData.parentName}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span style={{ color: "#64748b" }}>Contact:</span>{" "}
                            <span style={{ fontWeight: "700", color: "#0f172a" }}>
                              {receiptData.parentPhone}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Parent Portal Credentials (Render only if available) */}
                      {receiptData.parentEmail &&
                        receiptData.parentEmail !== "N/A" &&
                        receiptData.parentPassword &&
                        receiptData.parentPassword !== "N/A" && (
                          <div
                            style={{
                              background: "#eff6ff",
                              padding: "0.75rem 1rem",
                              borderRadius: "10px",
                              border: "1.5px solid #bfdbfe",
                              marginBottom: "1rem",
                              textAlign: "center",
                            }}
                          >
                            <h3
                              style={{
                                margin: "0 0 0.35rem",
                                color: "#1e40af",
                                fontSize: "0.88rem",
                                fontWeight: "800",
                              }}
                            >
                              Parent Portal Login Credentials
                            </h3>
                            <p
                              style={{
                                margin: "0 0 0.6rem",
                                color: "#3b82f6",
                                fontSize: "0.8rem",
                              }}
                            >
                              Use these credentials to log into the Parent Mobile App.
                            </p>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "center",
                                gap: "1.5rem",
                              }}
                            >
                              <div style={{ textAlign: "left" }}>
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#60a5fa",
                                    textTransform: "uppercase",
                                    fontWeight: "700",
                                  }}
                                >
                                  Login Email
                                </span>
                                <div
                                  style={{
                                    fontSize: "0.88rem",
                                    fontWeight: "700",
                                    color: "#1e3a8a",
                                    fontFamily: "monospace",
                                    background: "white",
                                    padding: "0.3rem 0.75rem",
                                    borderRadius: "6px",
                                    border: "1px solid #93c5fd",
                                    marginTop: "2px",
                                  }}
                                >
                                  {receiptData.parentEmail}
                                </div>
                              </div>
                              <div style={{ textAlign: "left" }}>
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#60a5fa",
                                    textTransform: "uppercase",
                                    fontWeight: "700",
                                  }}
                                >
                                  Password
                                </span>
                                <div
                                  style={{
                                    fontSize: "0.88rem",
                                    fontWeight: "700",
                                    color: "#1e3a8a",
                                    fontFamily: "monospace",
                                    background: "white",
                                    padding: "0.3rem 0.75rem",
                                    borderRadius: "6px",
                                    border: "1px solid #93c5fd",
                                    marginTop: "2px",
                                  }}
                                >
                                  {receiptData.parentPassword}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* Enrolled Student & Fee Breakdown */}
                      <div style={{ flex: 1 }}>
                        <h3
                          style={{
                            fontSize: "1.1rem",
                            color: "#0f172a",
                            fontWeight: "800",
                            borderBottom: "2px solid #e2e8f0",
                            paddingBottom: "0.5rem",
                            marginBottom: "0.6rem",
                          }}
                        >
                          Enrolled Student & Fee Breakdown
                        </h3>
                        <div
                          style={{
                            marginBottom: "1rem",
                            padding: "0.85rem 1rem",
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px",
                            background: "#ffffff",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "0.75rem",
                              flexWrap: "wrap",
                              gap: "0.5rem",
                            }}
                          >
                            <div>
                              <h4
                                style={{
                                  fontSize: "1.05rem",
                                  fontWeight: "900",
                                  margin: "0 0 0.2rem",
                                  color: "#0f172a",
                                }}
                              >
                                {stu.name.toUpperCase()}
                              </h4>
                              <div
                                style={{
                                  fontSize: "0.85rem",
                                  color: "#64748b",
                                  fontWeight: "600",
                                }}
                              >
                                Class: <strong style={{ color: "#334155" }}>{stu.className}</strong> • Roll No: {stu.rollNo || "Provisional"} • ADM No: {stu.admissionNo || "New Admission"}
                              </div>
                            </div>

                            {stu.isPaidAtAdmission ? (
                              <div className="pdf-paid-stamp">
                                <span className="pdf-paid-stamp-text">PAID ✓</span>
                                <span className="pdf-paid-stamp-sub">
                                  {stu.paymentMode || "Cash / Counter"}
                                </span>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "inline-flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  border: "2px dashed #f59e0b",
                                  borderRadius: "8px",
                                  padding: "0.25rem 0.75rem",
                                  background: "#fffbeb",
                                  color: "#b45309",
                                  fontWeight: "800",
                                  fontSize: "0.78rem",
                                }}
                              >
                                <span>DUE / UNPAID</span>
                                <span style={{ fontSize: "0.68rem", fontWeight: "600" }}>
                                  Payable at Counter
                                </span>
                              </div>
                            )}
                          </div>

                          {/* 1. Monthly Recurring Structure */}
                          {stu.feeStructure && stu.feeStructure.length > 0 && (
                            <div style={{ marginBottom: "0.75rem" }}>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: "800",
                                  color: "#2563eb",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  display: "block",
                                  marginBottom: "0.25rem",
                                }}
                              >
                                1. Monthly Recurring Structure
                              </span>
                              <table
                                style={{
                                  width: "100%",
                                  fontSize: "0.85rem",
                                  borderCollapse: "collapse",
                                }}
                              >
                                <tbody>
                                  {stu.feeStructure.map((fee) => (
                                    <tr
                                      key={fee.id}
                                      style={{ borderBottom: "1px solid #f1f5f9" }}
                                    >
                                      <td
                                        style={{
                                          padding: "0.3rem 0",
                                          color: "#334155",
                                          fontWeight: "500",
                                        }}
                                      >
                                        {fee.name} (Monthly)
                                      </td>
                                      <td
                                        style={{
                                          textAlign: "right",
                                          padding: "0.3rem 0",
                                          fontWeight: "700",
                                          color: "#0f172a",
                                        }}
                                      >
                                        Rs {Number(fee.amount).toLocaleString()}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* 2. One-Time Admission & Action Charges */}
                          {stu.individualActions && stu.individualActions.length > 0 && (
                            <div style={{ marginBottom: "0.75rem" }}>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: "800",
                                  color: "#d97706",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  display: "block",
                                  marginBottom: "0.25rem",
                                }}
                              >
                                2. One-Time Admission & Action Charges
                              </span>
                              <table
                                style={{
                                  width: "100%",
                                  fontSize: "0.85rem",
                                  borderCollapse: "collapse",
                                }}
                              >
                                <tbody>
                                  {stu.individualActions.map((act) => (
                                    <tr
                                      key={act.id}
                                      style={{ borderBottom: "1px solid #f1f5f9" }}
                                    >
                                      <td
                                        style={{
                                          padding: "0.3rem 0",
                                          color: "#334155",
                                          fontWeight: "500",
                                        }}
                                      >
                                        {act.name} (1-Time)
                                      </td>
                                      <td
                                        style={{
                                          textAlign: "right",
                                          padding: "0.3rem 0",
                                          fontWeight: "700",
                                          color: "#0f172a",
                                        }}
                                      >
                                        Rs {Number(act.amount).toLocaleString()}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {(!stu.feeStructure || stu.feeStructure.length === 0) &&
                            (!stu.individualActions || stu.individualActions.length === 0) && (
                              <p
                                style={{
                                  margin: "0.5rem 0",
                                  fontSize: "0.82rem",
                                  fontStyle: "italic",
                                  color: "#94a3b8",
                                  textAlign: "center",
                                }}
                              >
                                No specific fee items assigned during admission.
                              </p>
                            )}

                          {/* Receipt Total Summary Row */}
                          <div
                            style={{
                              marginTop: "0.6rem",
                              paddingTop: "0.6rem",
                              borderTop: "2px solid #e2e8f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                              Monthly Fee:{" "}
                              <strong style={{ color: "#0f172a" }}>
                                Rs {(stu.monthlyTotal || 0).toLocaleString()}
                              </strong>{" "}
                              | 1-Time Dues:{" "}
                              <strong style={{ color: "#0f172a" }}>
                                Rs {(stu.oneTimeTotal || 0).toLocaleString()}
                              </strong>
                            </div>
                            <div
                              style={{
                                fontSize: "1.05rem",
                                fontWeight: "900",
                                color: stu.isPaidAtAdmission ? "#047857" : "#0f172a",
                              }}
                            >
                              Total: Rs {(stu.grandTotal || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Cashier / Counter Verification & Stamp Row */}
                      <div
                        style={{
                          marginTop: "0.75rem",
                          marginBottom: "0.75rem",
                          padding: "0.85rem 1rem 0.4rem",
                          border: "1.5px dashed #cbd5e1",
                          borderRadius: "10px",
                          background: "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "1.5rem",
                            textAlign: "center",
                          }}
                        >
                          <div>
                            <div style={{ height: "35px" }} />
                            <div
                              style={{
                                borderTop: "1.5px solid #94a3b8",
                                paddingTop: "4px",
                                fontSize: "0.78rem",
                                fontWeight: "700",
                                color: "#334155",
                              }}
                            >
                              Cashier / Accounts Desk
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "flex-end",
                            }}
                          >
                            <div
                              style={{
                                width: "44px",
                                height: "44px",
                                borderRadius: "50%",
                                border: "1.5px dashed #94a3b8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.6rem",
                                fontWeight: "800",
                                color: "#94a3b8",
                                marginBottom: "4px",
                              }}
                            >
                              STAMP
                            </div>
                            <div
                              style={{
                                borderTop: "1.5px solid #94a3b8",
                                width: "100%",
                                paddingTop: "4px",
                                fontSize: "0.78rem",
                                fontWeight: "700",
                                color: "#334155",
                              }}
                            >
                              Official Stamp & Date
                            </div>
                          </div>

                          <div>
                            <div style={{ height: "35px" }} />
                            <div
                              style={{
                                borderTop: "1.5px solid #94a3b8",
                                paddingTop: "4px",
                                fontSize: "0.78rem",
                                fontWeight: "700",
                                color: "#334155",
                              }}
                            >
                              Principal / Admission Head
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Welcome Footer */}
                      <div
                        style={{
                          marginTop: "auto",
                          paddingTop: "0.5rem",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            width: "50px",
                            height: "3px",
                            background: "#0284c7",
                            margin: "0 auto 0.4rem",
                            borderRadius: "2px",
                          }}
                        />
                        <h3
                          style={{
                            fontSize: "1rem",
                            fontWeight: "800",
                            color: "#0f172a",
                            margin: "0 0 0.3rem",
                          }}
                        >
                          Welcome to Our School Family!
                        </h3>
                        <p
                          style={{
                            fontSize: "0.82rem",
                            color: "#64748b",
                            margin: 0,
                            lineHeight: "1.5",
                          }}
                        >
                          Thank you for choosing us for your child's education.
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 8mm 10mm 8mm 10mm;
                }
                *, *::before, *::after {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                html, body {
                  background: #ffffff !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  height: auto !important;
                  min-height: auto !important;
                  overflow: visible !important;
                }
                /* Hide everything in root to prevent blank trailing pages */
                #root {
                  display: none !important;
                  height: 0 !important;
                  overflow: hidden !important;
                }
                .no-print {
                  display: none !important;
                }
                .receipt-modal-overlay {
                  position: static !important;
                  display: block !important;
                  width: 100% !important;
                  height: auto !important;
                  background: transparent !important;
                  backdrop-filter: none !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  overflow: visible !important;
                }
                .receipt-modal-overlay > div {
                  max-width: 100% !important;
                  max-height: none !important;
                  box-shadow: none !important;
                  border: none !important;
                  border-radius: 0 !important;
                  overflow: visible !important;
                  background: transparent !important;
                  padding: 0 !important;
                }
                #admission-receipt-container {
                  display: block !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow: visible !important;
                }
                .admission-receipt {
                  width: 100% !important;
                  max-width: 100% !important;
                  box-sizing: border-box !important;
                  display: block !important;
                  filter: none !important;
                  box-shadow: none !important;
                  border: 1.5px solid #0f172a !important;
                  border-radius: 8px !important;
                  background: #ffffff !important;
                  margin: 0 auto !important;
                  padding: 0 !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
                .admission-receipt:not(:last-child) {
                  page-break-after: always !important;
                  break-after: page !important;
                }
              }
            `}</style>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Admission;
