import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { db, storage } from "../firebase";
import {
  collection,
  getDocs,
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
  "Fine fee",
  "Uniform",
  "Books",
  "Sports",
  "Tour charges",
  "Club membership",
];
const RECURRING_CATEGORIES = [
  "Admission fee",
  "Tuition fee",
  "Transport fee",
  "Library",
  "Hostel fee",
  "Stationary charges",
  "Promotions fee",
  "Concession",
  "Security",
  "Miscellaneous",
  "Annual fund",
];
const ALL_CATEGORIES = [...RECURRING_CATEGORIES, ...ACTION_CATEGORIES].sort();

const Admission = () => {
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
      newFeeCategory: ALL_CATEGORIES[0],
      newFeeAmount: "",
      profilePic: null,
    },
  ]);

  const [availableClasses, setAvailableClasses] = useState([]);
  const [schoolId, setSchoolId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchSchoolAndClasses = async () => {
      const manualSession = localStorage.getItem("manual_session");
      if (manualSession) {
        const userData = JSON.parse(manualSession);
        setSchoolId(userData.schoolId);

        try {
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
          console.error("Error fetching classes:", error);
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
        newFeeCategory: ALL_CATEGORIES[0],
        newFeeAmount: "",
        profilePic: null,
      },
    ]);
  };

  const handleAddFee = (index) => {
    const updatedStudents = [...students];
    const student = updatedStudents[index];
    if (!student.newFeeCategory || !student.newFeeAmount) return;

    const isAction = ACTION_CATEGORIES.includes(student.newFeeCategory);
    const newItem = {
      id: Date.now().toString(),
      name: student.newFeeCategory,
      amount: Number(student.newFeeAmount),
      ...(isAction ? { status: "unpaid" } : {}),
    };

    if (isAction) {
      student.individualActions = [...student.individualActions, newItem];
    } else {
      student.feeStructure = [...student.feeStructure, newItem];
    }

    student.newFeeAmount = ""; // Reset input
    setStudents(updatedStudents);
  };

  const handleRemoveFee = (studentIndex, feeId, isAction) => {
    const updatedStudents = [...students];
    const student = updatedStudents[studentIndex];

    if (isAction) {
      student.individualActions = student.individualActions.filter(
        (item) => item.id !== feeId,
      );
    } else {
      student.feeStructure = student.feeStructure.filter(
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

    if (!schoolId) {
      alert("School ID missing. Please relogin.");
      return;
    }

    setIsLoading(true);

    try {
      // STEP 1: Handle Parent Account
      let finalParentId = existingParent ? existingParent.id : null;

      if (!finalParentId) {
        // Create New Parent via Server-Side Function (Secure)
        const functions = getFunctions();
        const createSchoolUserFn = httpsCallable(functions, "createSchoolUser");

        const result = await createSchoolUserFn({
          email: parentDetails.email ? parentDetails.email.trim() : "",
          password: parentDetails.password, // Admission form should have password field if new
          name: parentDetails.fatherName.trim(),
          role: "parent",
          schoolId: schoolId,
          phone: parentDetails.phone.trim(),
          emergencyPhone: parentDetails.emergencyPhone
            ? parentDetails.emergencyPhone.trim()
            : "",
          address: parentDetails.address,
          occupation: parentDetails.occupation,
          linkedStudents: [], // We link students after creating them below
        });

        finalParentId = result.data.uid;
      } else {
        // Optional: Update Existing Parent Details if needed?
        // For now, we trust the search result or leave it as is to avoid overwrites.
      }

      // STEP 2: Process New Students
      const newStudentLinks = [];

      const admissionPromises = students.map(async (student) => {
        if (!student.admissionClass) return;

        const selectedClass = availableClasses.find(
          (c) => c.id === student.admissionClass,
        );
        const className = selectedClass ? selectedClass.name : "Unknown";

        // Generate ID via ref (so we use same ID for both locations)
        const studentRef = doc(
          collection(
            db,
            `schools/${schoolId}/classes/${student.admissionClass}/students`,
          ),
        );
        const studentId = studentRef.id;

        // Upload Profile Pic if available
        let profilePicUrl = null;
        if (student.profilePic) {
          try {
            const storagePath = `schools/${schoolId}/students/${studentId}/profile.jpg`;
            const imageRef = ref(storage, storagePath);
            await uploadString(imageRef, student.profilePic, 'data_url');
            profilePicUrl = await getDownloadURL(imageRef);
          } catch (err) {
            console.error("Error uploading profile pic:", err);
          }
        }

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
          parentDetails: { ...parentDetails, parentId: finalParentId }, // Link Ref in Student Doc
          rollNo:
            student.rollNo || `TPP-${Math.floor(1000 + Math.random() * 9000)}`,
          admissionNo: student.admissionNo || "", // Save Admission No
          feeStructure: student.feeStructure || [],
          individualActions: student.individualActions || [],
          status: "present",
          avgScore: 0,
          homework: 0,
          classId: student.admissionClass, // Ensure classId is in the doc
          className: className,
          createdAt: serverTimestamp(),
        };

        // 1. Save to Class Sub-collection
        await setDoc(studentRef, studentData);

        // 2. Save to Master Students Collection
        const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);
        await setDoc(masterStudentRef, studentData);

        // Add to links array
        // Add to links array
        newStudentLinks.push({
          studentId: studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          classId: student.admissionClass,
          className: className,
        });

        // Update Class Count
        const classRef = doc(
          db,
          `schools/${schoolId}/classes`,
          student.admissionClass,
        );
        await updateDoc(classRef, {
          students: increment(1),
        });
      });

      await Promise.all(admissionPromises);

      // STEP 3: Link Students (New + Sibling) to Parent Account
      const allLinks = [...newStudentLinks, ...linkedSiblings];

      // We use arrayUnion to add without duplicates
      // However, arrayUnion works on primitives or exact object matches.
      // Since these are new objects, we should fetch current and unique them, or just add.
      // Using updateDoc with arrayUnion is safest.
      const parentRef = doc(db, `schools/${schoolId}/parents`, finalParentId);

      // To be 100% safe with arrayUnion on objects, we handle it carefully.
      // But since these are NEW students, unique ID guarantees uniqueness.
      // For linkedSiblings, we might duplicate if already there?
      // Better to pull, check, push. But arrayUnion is fine for now usually.

      if (allLinks.length > 0) {
        await updateDoc(parentRef, {
          linkedStudents: arrayUnion(...allLinks),
        });
      }

      alert("Admission & Parent Account Linked Successfully!");

      // Set Receipt Data before clearing form
      setReceiptData({
        schoolName: localStorage.getItem("schoolName") || "Our School",
        schoolPhone: localStorage.getItem("schoolPhone") || "+1 234 567 8900",
        schoolEmergencyPhone:
          localStorage.getItem("schoolEmergencyPhone") || "+1 987 654 3210",
        schoolAddress:
          localStorage.getItem("schoolAddress") ||
          "123 Education Street, City, Country",
        schoolLogo: localStorage.getItem("schoolLogo") || "",
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        parentName: parentDetails.fatherName,
        parentPhone: parentDetails.phone,
        parentEmail: parentDetails.email,

        parentPassword: parentDetails.password,
        students: students.map((s) => {
          const cls = availableClasses.find((c) => c.id === s.admissionClass);
          return {
            name: `${s.firstName} ${s.lastName}`,
            className: cls ? cls.name : "Unknown Class",
            rollNo: s.rollNo,
            admissionNo: s.admissionNo,
            feeStructure: s.feeStructure || [],
            individualActions: s.individualActions || [],
          };
        }),
      });
      setShowReceipt(true);

      // Reset Form (Runs behind the scenes)
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
          admissionNo: "",
          feeStructure: [],
          individualActions: [],
          newFeeCategory: ALL_CATEGORIES[0],
          newFeeAmount: "",
          profilePic: null,
        },
      ]);
      setExistingParent(null);
      setSearchPhone("");
      setLinkedSiblings([]);
    } catch (error) {
      console.error("Error submitting admission:", error);
      alert(
        `Failed to submit admission: ${error.message || error.code || "Unknown error"}. Please try again.`,
      );
    } finally {
      setIsLoading(false);
    }
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
        <header className="page-header">
          <div>
            <h1 className="page-title">New Admission</h1>
            <p className="page-subtitle">
              Enroll one or more students for the academic year
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
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
          </div>
        </header>
      </div>

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
              {students.map((student, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.3 }}
                  className="student-card"
                  style={{
                    background: "#3b82f6",
                    border: "2px solid #1e40af",
                    boxShadow: "8px 8px 0px #1e40af",
                    color: "white",
                  }}
                >
                  <div
                    className="student-header"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}
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

                    {/* Fee Details */}
                    <div
                      className="input-group"
                      style={{ gridColumn: "1 / -1" }}
                    >
                      <label
                        className="input-label"
                        style={{ color: "rgba(255,255,255,0.8)" }}
                      >
                        Fee Management
                      </label>

                      <div
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          padding: "1rem",
                          borderRadius: "16px",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {/* Existing Fees List */}
                        <div
                          style={{
                            marginBottom: "0.5rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                          }}
                        >
                          {student.feeStructure.length === 0 &&
                            student.individualActions.length === 0 && (
                              <p
                                style={{
                                  color: "rgba(255,255,255,0.5)",
                                  textAlign: "center",
                                  padding: "1rem",
                                  background: "rgba(0,0,0,0.2)",
                                  borderRadius: "12px",
                                  fontSize: "0.9rem",
                                }}
                              >
                                No fees assigned.
                              </p>
                            )}

                          {student.feeStructure.map((fee) => (
                            <div
                              key={fee.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "0.75rem 1rem",
                                background: "rgba(255,255,255,0.1)",
                                borderRadius: "12px",
                              }}
                            >
                              <span
                                style={{ fontWeight: "600", color: "white" }}
                              >
                                {fee.name}
                              </span>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "1rem",
                                }}
                              >
                                <span
                                  style={{ fontWeight: "800", color: "white" }}
                                >
                                  Rs {fee.amount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveFee(index, fee.id, false)
                                  }
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    padding: "0.25rem",
                                  }}
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          ))}

                          {student.individualActions.map((action) => (
                            <div
                              key={action.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "0.75rem 1rem",
                                background: "rgba(239, 68, 68, 0.1)",
                                borderRadius: "12px",
                                border: "1px dashed rgba(239, 68, 68, 0.3)",
                              }}
                            >
                              <span
                                style={{ fontWeight: "600", color: "#fca5a5" }}
                              >
                                {action.name} (Action)
                              </span>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "1rem",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "800",
                                    color: "#fca5a5",
                                  }}
                                >
                                  Rs {action.amount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveFee(index, action.id, true)
                                  }
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    padding: "0.25rem",
                                  }}
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add New Fee Form */}
                        <div
                          style={{
                            display: "flex",
                            gap: "1rem",
                            alignItems: "center",
                          }}
                        >
                          <select
                            name="newFeeCategory"
                            value={student.newFeeCategory}
                            onChange={(e) => handleStudentChange(index, e)}
                            className="modern-input modern-select"
                            style={{ flex: 2 }}
                          >
                            <optgroup label="Recurring Fees">
                              {RECURRING_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Individual Actions (Fines, Uniforms, etc.)">
                              {ACTION_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          <input
                            type="number"
                            name="newFeeAmount"
                            placeholder="Amount"
                            value={student.newFeeAmount}
                            onChange={(e) => handleStudentChange(index, e)}
                            className="modern-input"
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddFee(index)}
                            disabled={!student.newFeeAmount}
                            style={{
                              padding: "0 1.5rem",
                              height: "48px",
                              borderRadius: "12px",
                              border: "none",
                              background: student.newFeeAmount
                                ? "#6366f1"
                                : "rgba(255,255,255,0.1)",
                              color: "white",
                              fontWeight: "700",
                              cursor: student.newFeeAmount
                                ? "pointer"
                                : "not-allowed",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <Plus size={18} /> Add
                          </button>
                        </div>
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
                            <Camera size={32} color="rgba(255,255,255,0.5)" />
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
                              color: "var(--text-muted)",
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
              ))}
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

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div
          className="receipt-modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            fontFamily: "'Inter', sans-serif",
            background: "rgba(0,0,0,0.6)",
            overflowY: "auto",
            padding: "3rem 1rem",
          }}
        >
          <div
            className="no-print"
            style={{
              position: "fixed",
              top: "20px",
              right: "40px",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              zIndex: 100000,
            }}
          >
            <button
              onClick={() => setShowReceipt(false)}
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#ef4444",
                color: "white",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                transition: "transform 0.2s",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.transform = "scale(1.1)")
              }
              onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <X size={28} />
            </button>
            <button
              onClick={isDownloading ? undefined : handleDownloadPDF}
              disabled={isDownloading}
              style={{
                padding: "0 1.5rem",
                height: "56px",
                borderRadius: "28px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                cursor: isDownloading ? "not-allowed" : "pointer",
                opacity: isDownloading ? 0.7 : 1,
                boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                transition: "transform 0.2s, background 0.2s",
                fontWeight: "600",
                fontSize: "1.05rem",
                letterSpacing: "0.5px",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.background = "#2563eb";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.background = "#3b82f6";
              }}
              title="Download as PDF"
            >
              {isDownloading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Download size={22} />
              )}
              {isDownloading ? "Generating..." : "Save PDF"}
            </button>
          </div>

          <div
            id="admission-receipt-container"
            style={{
              width: "100%",
              maxWidth: "850px",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              margin: "0 auto",
              position: "relative",
            }}
          >
            {receiptData.students.map((stu, index) => (
              <div
                key={index}
                className="admission-receipt animate-fade-in-up"
                style={{
                  background: "white",
                  color: "#1e293b",
                  width: "100%",
                  minHeight: "auto",
                  position: "relative",
                  filter: "drop-shadow(0 25px 35px rgba(0,0,0,0.4))",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
                  pageBreakAfter: "always",
                }}
              >
                <div
                  style={{
                    height: "16px",
                    background:
                      "linear-gradient(-45deg, transparent 11px, white 0), linear-gradient(45deg, transparent 11px, white 0)",
                    backgroundPosition: "left-bottom",
                    backgroundSize: "22px 22px",
                    backgroundRepeat: "repeat-x",
                    marginBottom: "-1px",
                  }}
                ></div>

                <div
                  style={{
                    padding: "1.5rem 2rem",
                    flex: 1,
                    background: "white",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      textAlign: "center",
                      marginBottom: "1rem",
                      borderBottom: "3px solid #f1f5f9",
                      paddingBottom: "1rem",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "1.6rem",
                        fontWeight: "800",
                        margin: "0 0 0.25rem",
                        color: "#0f172a",
                        letterSpacing: "-0.5px",
                      }}
                    >
                      {receiptData.schoolName.toUpperCase()}
                    </h2>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: "1.5rem",
                        margin: "0.5rem 0",
                        fontSize: "0.85rem",
                        color: "#475569",
                        fontWeight: "500",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <Phone size={14} color="#3b82f6" />
                        <span>{receiptData.schoolPhone}</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <Phone size={14} color="#ef4444" />
                        <span>
                          {receiptData.schoolEmergencyPhone} (Emergency)
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontSize: "0.85rem",
                        color: "#475569",
                        fontWeight: "500",
                        marginBottom: "1rem",
                      }}
                    >
                      <MapPin size={14} color="#3b82f6" />
                      <span>{receiptData.schoolAddress}</span>
                    </div>

                    <p
                      style={{
                        fontSize: "1.1rem",
                        margin: 0,
                        color: "#64748b",
                        fontWeight: "600",
                        letterSpacing: "2px",
                      }}
                    >
                      OFFICIAL ADMISSION RECORD
                    </p>
                  </div>

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
                        padding: "1rem",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4
                        style={{
                          margin: "0 0 1rem",
                          fontSize: "0.9rem",
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        Transaction Details
                      </h4>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        <span style={{ color: "#475569" }}>Date:</span>{" "}
                        <span style={{ fontWeight: "600" }}>
                          {receiptData.date}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.9rem",
                        }}
                      >
                        <span style={{ color: "#475569" }}>Time:</span>{" "}
                        <span style={{ fontWeight: "600" }}>
                          {receiptData.time}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        background: "#f8fafc",
                        padding: "1rem",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h4
                        style={{
                          margin: "0 0 1rem",
                          fontSize: "0.9rem",
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        Parent Account
                      </h4>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        <span style={{ color: "#475569" }}>Name:</span>{" "}
                        <span style={{ fontWeight: "700", color: "#0f172a" }}>
                          {receiptData.parentName}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.9rem",
                        }}
                      >
                        <span style={{ color: "#475569" }}>Contact:</span>{" "}
                        <span style={{ fontWeight: "600" }}>
                          {receiptData.parentPhone}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#eff6ff",
                      padding: "1rem",
                      borderRadius: "12px",
                      border: "2px solid #bfdbfe",
                      marginBottom: "1rem",
                      textAlign: "center",
                    }}
                  >
                    <h3
                      style={{
                        margin: "0 0 1rem",
                        color: "#1e40af",
                        fontSize: "1rem",
                        fontWeight: "800",
                      }}
                    >
                      Parent Portal Login Credentials
                    </h3>
                    <p
                      style={{
                        margin: "0 0 1.5rem",
                        color: "#3b82f6",
                        fontSize: "0.95rem",
                      }}
                    >
                      Please keep these credentials safe. You will use them to
                      log into the Parent App.
                    </p>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: "1rem",
                      }}
                    >
                      <div style={{ textAlign: "left" }}>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color: "#60a5fa",
                            textTransform: "uppercase",
                            fontWeight: "700",
                          }}
                        >
                          Login Email
                        </span>
                        <div
                          style={{
                            fontSize: "1rem",
                            fontWeight: "700",
                            color: "#1e3a8a",
                            fontFamily: "monospace",
                            marginTop: "0.25rem",
                            background: "white",
                            padding: "0.5rem 1rem",
                            borderRadius: "6px",
                            border: "1px solid #93c5fd",
                          }}
                        >
                          {receiptData.parentEmail || "N/A"}
                        </div>
                      </div>
                      <div style={{ textAlign: "left" }}>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color: "#60a5fa",
                            textTransform: "uppercase",
                            fontWeight: "700",
                          }}
                        >
                          Password
                        </span>
                        <div
                          style={{
                            fontSize: "1rem",
                            fontWeight: "700",
                            color: "#1e3a8a",
                            fontFamily: "monospace",
                            marginTop: "0.25rem",
                            background: "white",
                            padding: "0.5rem 1rem",
                            borderRadius: "6px",
                            border: "1px solid #93c5fd",
                          }}
                        >
                          {receiptData.parentPassword || "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        fontSize: "1.3rem",
                        color: "#0f172a",
                        fontWeight: "800",
                        borderBottom: "2px solid #e2e8f0",
                        paddingBottom: "0.75rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Enrolled Student & Fees
                    </h3>
                    <div
                      style={{
                        marginBottom: "1rem",
                        padding: "1rem",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <div>
                          <h4
                            style={{
                              fontSize: "1rem",
                              fontWeight: "800",
                              margin: "0 0 0.25rem",
                              color: "#0f172a",
                            }}
                          >
                            {stu.name.toUpperCase()}
                          </h4>
                          <div
                            style={{
                              fontSize: "1rem",
                              color: "#64748b",
                              fontWeight: "500",
                            }}
                          >
                            {stu.className}
                          </div>
                        </div>
                        <div
                          style={{ textAlign: "right", fontSize: "0.95rem" }}
                        >
                          <div
                            style={{
                              color: "#475569",
                              marginBottom: "0.25rem",
                            }}
                          >
                            Roll No:{" "}
                            <span
                              style={{ fontWeight: "700", color: "#0f172a" }}
                            >
                              {stu.rollNo || "N/A"}
                            </span>
                          </div>
                          <div style={{ color: "#475569" }}>
                            Admission No:{" "}
                            <span
                              style={{ fontWeight: "700", color: "#0f172a" }}
                            >
                              {stu.admissionNo || "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <table
                        style={{
                          width: "100%",
                          fontSize: "0.9rem",
                          borderCollapse: "collapse",
                        }}
                      >
                        <thead>
                          <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
                            <th
                              style={{
                                textAlign: "left",
                                padding: "0.75rem 0",
                                color: "#64748b",
                                fontWeight: "700",
                                fontSize: "0.9rem",
                                textTransform: "uppercase",
                              }}
                            >
                              Fee Description
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: "0.75rem 0",
                                color: "#64748b",
                                fontWeight: "700",
                                fontSize: "0.9rem",
                                textTransform: "uppercase",
                              }}
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stu.feeStructure.map((fee) => (
                            <tr
                              key={fee.id}
                              style={{ borderBottom: "1px solid #f1f5f9" }}
                            >
                              <td
                                style={{
                                  padding: "0.5rem 0",
                                  color: "#334155",
                                  fontWeight: "500",
                                }}
                              >
                                {fee.name}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "0.5rem 0",
                                  fontWeight: "700",
                                  color: "#0f172a",
                                }}
                              >
                                Rs {fee.amount.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {stu.individualActions.map((act) => (
                            <tr
                              key={act.id}
                              style={{ borderBottom: "1px solid #f1f5f9" }}
                            >
                              <td
                                style={{
                                  padding: "0.5rem 0",
                                  color: "#334155",
                                  fontWeight: "500",
                                }}
                              >
                                {act.name}{" "}
                                <span
                                  style={{
                                    fontSize: "0.8rem",
                                    background: "#f1f5f9",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    marginLeft: "6px",
                                    color: "#64748b",
                                  }}
                                >
                                  Action
                                </span>
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "0.5rem 0",
                                  fontWeight: "700",
                                  color: "#0f172a",
                                }}
                              >
                                Rs {act.amount.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {stu.feeStructure.length === 0 &&
                            stu.individualActions.length === 0 && (
                              <tr>
                                <td
                                  colSpan="2"
                                  style={{
                                    padding: "0.5rem 0",
                                    fontStyle: "italic",
                                    color: "#94a3b8",
                                    textAlign: "center",
                                  }}
                                >
                                  No fees assigned during admission
                                </td>
                              </tr>
                            )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "1rem",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "60px",
                        height: "4px",
                        background: "#3b82f6",
                        margin: "0 auto 0.5rem",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <h3
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: "800",
                        color: "#0f172a",
                        margin: "0 0 0.5rem",
                      }}
                    >
                      Welcome to Our School Family!
                    </h3>
                    <p
                      style={{
                        fontSize: "0.9rem",
                        color: "#64748b",
                        margin: "0 0 0.5rem",
                        lineHeight: "1.6",
                      }}
                    >
                      Thank you for choosing us for your child's education.
                      <br />
                      We are committed to providing the best learning
                      environment.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    height: "16px",
                    background:
                      "linear-gradient(135deg, transparent 11px, white 0), linear-gradient(-135deg, transparent 11px, white 0)",
                    backgroundPosition: "left-top",
                    backgroundSize: "22px 22px",
                    backgroundRepeat: "repeat-x",
                    marginTop: "-1px",
                  }}
                ></div>
              </div>
            ))}
          </div>

          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              .receipt-modal-overlay {
                position: relative !important;
                display: block !important;
                height: auto !important;
                width: 100% !important;
                max-width: 100% !important;
                overflow: visible !important;
                padding: 0 !important;
                background: white !important;
              }
              #admission-receipt-container, #admission-receipt-container * {
                visibility: visible;
              }
              #admission-receipt-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0;
                padding: 0;
                display: block !important;
              }
              .admission-receipt {
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                zoom: 0.95;
                display: block !important;
                page-break-inside: avoid !important;
                filter: none !important;
                box-shadow: none !important;
                margin-bottom: 0 !important;
                page-break-after: always !important;
                break-after: page !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default Admission;
