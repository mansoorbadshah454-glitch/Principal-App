import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  limit,
  serverTimestamp
} from "firebase/firestore";

/**
 * Parses any sequence string (e.g. "ADM-0045", "105", "DPS/2026/09", "GR-1")
 * preserves the prefix and zero-padding, and increments the numeric portion by 1.
 */
export const parseAndIncrementSequence = (currentStr, defaultFallback = "ADM-001") => {
  if (!currentStr || typeof currentStr !== "string") {
    return defaultFallback;
  }

  const clean = currentStr.trim();
  if (!clean) return defaultFallback;

  // Match optional prefix and trailing digits
  const match = clean.match(/^(.*?)(\d+)$/);
  if (!match) {
    // If no trailing digits (e.g. "STU"), append "-001"
    return `${clean}-001`;
  }

  const prefix = match[1];
  const digits = match[2];
  const nextNum = parseInt(digits, 10) + 1;
  const padded = String(nextNum).padStart(digits.length, "0");

  return `${prefix}${padded}`;
};

/**
 * Finds the highest admission number from an array of sequence strings.
 */
export const findHighestSequence = (sequenceList, defaultFallback = "ADM-000") => {
  if (!Array.isArray(sequenceList) || sequenceList.length === 0) {
    return defaultFallback;
  }

  let highestStr = "";
  let highestNum = -1;

  for (const item of sequenceList) {
    if (!item || typeof item !== "string") continue;
    const clean = item.trim();
    const match = clean.match(/^(.*?)(\d+)$/);
    if (match) {
      const val = parseInt(match[2], 10);
      if (val > highestNum) {
        highestNum = val;
        highestStr = clean;
      }
    } else if (!highestStr) {
      highestStr = clean;
    }
  }

  return highestStr || defaultFallback;
};

/**
 * Fetches the next global Admission Number for a school.
 * 1. Checks schools/{schoolId}/settings/counters
 * 2. If not found or empty, scans recent students in schools/{schoolId}/students
 * 3. Returns next incremented sequence or "ADM-001" fallback
 */
export const getNextAdmissionNumber = async (schoolId, db) => {
  if (!schoolId || !db) return "ADM-001";

  try {
    // 1. Check dedicated school counter
    const counterRef = doc(db, `schools/${schoolId}/settings`, "counters");
    const counterSnap = await getDoc(counterRef);

    if (counterSnap.exists()) {
      const cData = counterSnap.data();
      if (cData && cData.lastAdmissionNo) {
        return parseAndIncrementSequence(cData.lastAdmissionNo, "ADM-001");
      }
    }

    // 2. Fallback / Zero-setup: Scan existing students in master collection
    const studentsRef = collection(db, `schools/${schoolId}/students`);
    let studentDocs = [];

    try {
      const q = query(studentsRef, limit(100));
      const snap = await getDocs(q);
      studentDocs = snap.docs;
    } catch (qErr) {
      console.warn("Direct student query fallback:", qErr);
    }

    if (studentDocs.length > 0) {
      const existingAdmissions = studentDocs
        .map((d) => d.data()?.admissionNo || d.data()?.registrationNo)
        .filter(Boolean);

      if (existingAdmissions.length > 0) {
        const highest = findHighestSequence(existingAdmissions, "ADM-000");
        return parseAndIncrementSequence(highest, "ADM-001");
      }
    }

    // Default starting admission number for brand new schools
    return "ADM-001";
  } catch (err) {
    console.error("Error calculating next admission number:", err);
    return "ADM-001";
  }
};

/**
 * Calculates the next available Roll Number for a specific class.
 * Reads existing students in schools/{schoolId}/classes/{classId}/students
 * plus any in-memory sibling drafts in the current admission session.
 */
export const getNextRollNumberForClass = async (
  schoolId,
  classId,
  db,
  currentDraftStudents = [],
  currentStudentIndex = 0
) => {
  if (!schoolId || !classId || !db) return "1";

  try {
    const classStudentsRef = collection(
      db,
      `schools/${schoolId}/classes/${classId}/students`
    );
    const snap = await getDocs(classStudentsRef);

    const existingRolls = [];

    // 1. Gather all existing roll numbers from Firestore
    snap.docs.forEach((d) => {
      const r = d.data()?.rollNo;
      if (r !== undefined && r !== null && String(r).trim() !== "") {
        existingRolls.push(String(r).trim());
      }
    });

    // 2. Add other draft students in current form session assigned to same class
    if (Array.isArray(currentDraftStudents)) {
      currentDraftStudents.forEach((st, idx) => {
        if (idx !== currentStudentIndex && st.admissionClass === classId && st.rollNo) {
          existingRolls.push(String(st.rollNo).trim());
        }
      });
    }

    if (existingRolls.length === 0) {
      return "1";
    }

    // Extract numbers to find highest
    let maxRollNum = 0;
    let foundFormatSample = null;

    for (const rollStr of existingRolls) {
      const match = rollStr.match(/^(.*?)(\d+)$/);
      if (match) {
        const num = parseInt(match[2], 10);
        if (num > maxRollNum) {
          maxRollNum = num;
          foundFormatSample = rollStr;
        }
      } else {
        const numOnly = parseInt(rollStr.replace(/\D/g, ""), 10);
        if (!isNaN(numOnly) && numOnly > maxRollNum) {
          maxRollNum = numOnly;
        }
      }
    }

    if (foundFormatSample) {
      return parseAndIncrementSequence(foundFormatSample, String(maxRollNum + 1));
    }

    return String(maxRollNum + 1);
  } catch (err) {
    console.error("Error calculating next roll number for class:", err);
    return "1";
  }
};

/**
 * Saves or updates the school admission counter document.
 */
export const updateAdmissionCounter = async (schoolId, lastAdmissionNo, db) => {
  if (!schoolId || !lastAdmissionNo || !db) return;
  try {
    const counterRef = doc(db, `schools/${schoolId}/settings`, "counters");
    await setDoc(
      counterRef,
      {
        lastAdmissionNo: String(lastAdmissionNo).trim(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Failed to update admission counter:", err);
  }
};

/**
 * Scans an array of preview data from Bulk Upload and syncs the counters document
 * so the system continues seamlessly from the imported file.
 */
export const syncCountersFromBulkUpload = async (schoolId, previewStudents, db) => {
  if (!schoolId || !Array.isArray(previewStudents) || previewStudents.length === 0 || !db) {
    return;
  }

  try {
    const admissionNumbers = previewStudents
      .map((s) => s.admissionNo || s.registrationNo)
      .filter(Boolean);

    if (admissionNumbers.length > 0) {
      const highest = findHighestSequence(admissionNumbers);
      if (highest && highest !== "ADM-000") {
        await updateAdmissionCounter(schoolId, highest, db);
      }
    }
  } catch (err) {
    console.warn("Failed to sync counters from bulk upload:", err);
  }
};
