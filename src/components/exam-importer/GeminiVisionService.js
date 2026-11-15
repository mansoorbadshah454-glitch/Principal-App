/**
 * GeminiVisionService.js
 * Calls Google Gemini Vision API (Flash 2.5 / 1.5) directly via fetch.
 * Zero external libraries. 100% structured JSON extraction for Broadsheets.
 */

/**
 * Retrieve Gemini API Key from multiple potential safe locations:
 * 1. LocalStorage per-school key (set via Settings > AI Copilot)
 * 2. LocalStorage global gemini key
 * 3. Vite environment variable
 */
export function getGeminiApiKey(schoolId) {
    if (schoolId) {
        const schoolKey = localStorage.getItem(`gemini_api_key_${schoolId}`);
        if (schoolKey && schoolKey.trim()) return schoolKey.trim();
    }
    const globalKey = localStorage.getItem('gemini_api_key');
    if (globalKey && globalKey.trim()) return globalKey.trim();

    const envKey = import.meta.env?.VITE_GEMINI_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();

    return null;
}

/**
 * Dynamically queries Google API to get all active generation models for this key.
 */
export async function getSupportedGeminiModels(apiKey) {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
            const data = await res.json();
            const supported = (data.models || [])
                .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
                .map(m => m.name.replace(/^models\//, ''));

            if (supported.length > 0) {
                return supported.sort((a, b) => {
                    const aFlash = a.includes('flash') ? 1 : 0;
                    const bFlash = b.includes('flash') ? 1 : 0;
                    return bFlash - aFlash;
                });
            }
        }
    } catch (e) {
        console.warn("Dynamic model query failed:", e);
    }
    return ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-flash'];
}

/**
 * Rapid Header Subject Scanner:
 * Scans only the top header row of the physical register image to auto-detect
 * the exact left-to-right subjects and their max marks.
 */
export async function detectSubjectsFromRegisterImage({
    base64Image,
    defaultSubjects = [],
    schoolId,
    customApiKey = null
}) {
    const apiKey = customApiKey || getGeminiApiKey(schoolId);
    if (!apiKey) {
        throw new Error("Gemini API Key missing. Please configure your key in Settings > AI Copilot or enter it when prompted.");
    }

    const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

    const instruction = `You are an expert exam broadsheet register digitization AI.
Analyze ONLY the top header row (column titles) of this handwritten/printed marksheet broadsheet register.

Given Reference Class Subjects:
${JSON.stringify(defaultSubjects.map(s => ({ subjectId: s.subjectId, name: s.name, maxMarks: s.maxMarks || 100 })))}

TASK:
1. Detect all subject columns from LEFT to RIGHT in the exact order they physically appear on this register sheet.
2. Read the subject name (e.g. Urdu, English, Math, Science, Islamiyat, Nazra, Computer, Social Studies, Drawing, etc.).
3. If max marks are specified in the column header (e.g., /100, /50, /75, /25), extract that as 'maxMarks' (integer). Default to 100 if not specified.
4. If a detected subject matches a reference subject, reuse its subjectId. Otherwise generate a clean snake_case subjectId.
5. Ignore non-subject columns like 'Roll No', 'Name', 'Father Name', 'Total', 'Meezan', 'Grade', 'Position', 'Remarks'.

Return ONLY valid JSON without markdown:
{
  "detectedSubjects": [
    { "subjectId": "urdu", "name": "Urdu", "maxMarks": 100 },
    { "subjectId": "english", "name": "English", "maxMarks": 100 }
  ]
}`;

    const requestBody = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: instruction },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: cleanBase64
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: "application/json"
        }
    };

    const models = await getSupportedGeminiModels(apiKey);
    let lastError = null;

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || response.statusText;
                throw new Error(`${model} Error: ${errMsg}`);
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) {
                throw new Error("No data returned by Gemini Vision.");
            }

            const cleanJsonText = textResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const parsed = JSON.parse(cleanJsonText);
            if (Array.isArray(parsed?.detectedSubjects) && parsed.detectedSubjects.length > 0) {
                return parsed.detectedSubjects;
            }
            return null;
        } catch (err) {
            lastError = err;
            console.warn(`Header detect attempt with ${model} failed, trying fallback...`, err);
        }
    }

    throw lastError || new Error("Failed to auto-detect subjects from register image.");
}

/**
 * Calls Gemini Flash Vision with the processed broadsheet image
 * and the preloaded student/subject roster.
 * Auto-detects and aligns subject column sequence directly from the physical register photo!
 */
export async function extractBroadsheetPageWithAI({
    base64Image,
    imageIndex,
    students, // [{ studentId, rollNo, name }]
    subjects, // [{ subjectId, name, maxMarks }]
    schoolId,
    customApiKey = null
}) {
    const apiKey = customApiKey || getGeminiApiKey(schoolId);
    if (!apiKey) {
        throw new Error("Gemini API Key missing. Please configure your key in Settings > AI Copilot or enter it when prompted.");
    }

    // Strip data:image/...;base64, prefix for raw inline data
    const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

    const systemInstruction = `You are an expert exam broadsheet register digitization AI.
You are given:
1. A photograph of a physical handwritten/printed student marksheet broadsheet register.
2. Suggested/Reference class subjects:
${JSON.stringify(subjects.map((s, i) => ({ colIndex: i + 1, subjectId: s.subjectId, name: s.name, maxMarks: s.maxMarks || 100 })))}
3. A known student roster for this class:
${JSON.stringify(students.map(st => ({ rollNo: String(st.rollNo || st.rollNumber || ''), name: st.name, studentId: st.studentId || st.id })))}

REGISTER STYLE & SUBJECT AUTO-DETECTION:
1. FIRST, inspect the top header row of the physical marksheet table from LEFT to RIGHT.
2. Identify the EXACT subject columns as they physically appear on this register sheet (e.g. Urdu, English, Mathematics, Science, Islamiyat, Nazra, Drawing, etc.).
3. Extract maximum marks for each subject if printed in the header (e.g., 100, 50, 75, 25). Default to 100 if not stated.
4. Order the subject columns in "detectedSubjects" EXACTLY matching the left-to-right sequence on the physical register.
5. If a detected subject matches a reference subject, preserve that subjectId. For any custom/extra subjects not in reference, create a clean snake_case subjectId.

STUDENT MARKS EXTRACTION RULES:
1. Do NOT transcribe names. Handwritten Urdu/English names are often illegible. Anchor STRICTLY on the Roll Number column (or sequential row order corresponding to the student roster).
2. Extract numeric marks for each subject matching the detected subject columns from left to right.
3. If an exam mark is marked as Absent ('A', 'Abs', 'غ/حاضر'), set the mark to -1 (representing Absent).
4. If a mark cell is blank/unattempted, set it to 0.
5. Extract the handwritten register Grand Total written by the teacher in the final 'Total' / 'Grand Total' / 'Meezan' column into 'registerGrandTotal'.
6. If any mark has severe overwriting, strike-through (kat-pit), or blur, add the subject's subjectId to the 'lowConfidenceSubjects' array for that student row.
7. Return ONLY valid JSON in this exact structure without markdown backticks:
{
  "sourceImageIndex": ${imageIndex},
  "detectedSubjects": [
    { "subjectId": "urdu", "name": "Urdu", "maxMarks": 100 },
    { "subjectId": "english", "name": "English", "maxMarks": 100 }
  ],
  "rows": [
    {
      "rollNo": "1",
      "studentId": "id_here_or_matched",
      "marks": {
        "urdu": 85,
        "english": 72
      },
      "registerGrandTotal": 157,
      "lowConfidenceSubjects": []
    }
  ]
}`;

    const requestBody = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: systemInstruction },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: cleanBase64
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
        }
    };

    // Dynamically retrieve supported models for this key
    const models = await getSupportedGeminiModels(apiKey);
    let lastError = null;

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || response.statusText;
                throw new Error(`${model} Error: ${errMsg}`);
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) {
                throw new Error("No data returned by Gemini Vision.");
            }

            const cleanJsonText = textResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const parsed = JSON.parse(cleanJsonText);
            return parsed;
        } catch (err) {
            lastError = err;
            console.warn(`Attempt with ${model} failed, trying fallback...`, err);
        }
    }

    throw lastError || new Error("Failed to process broadsheet image with Gemini.");
}

/**
 * Smart Multi-Image Merger:
 * Merges extracted rows from Part 1, Part 2, Part 3 into the preloaded class student roster.
 * Ensures every registered student has a clean, validated state in the workspace.
 */
export function mergeMultiImageResults({
    extractedParts, // Array of { sourceImageIndex, rows: [...] }
    students,       // Full roster [{ id, name, rollNo }]
    subjects        // [{ subjectId, name, maxMarks }]
}) {
    // Map extracted rows by rollNo or studentId
    const extractedMap = new Map();

    extractedParts.forEach(part => {
        const imgIdx = part.sourceImageIndex ?? 0;
        (part.rows || []).forEach(row => {
            const cleanRoll = String(row.rollNo || '').trim().replace(/^0+/, '');
            const key = row.studentId || (cleanRoll ? `roll_${cleanRoll}` : null);
            if (key) {
                extractedMap.set(key, { ...row, sourceImageIndex: imgIdx });
            }
        });
    });

    // Merge against official students roster
    return students.map((st, idx) => {
        const studentId = st.studentId || st.id || `st_${idx + 1}`;
        const rollStr = String(st.rollNo || st.rollNumber || idx + 1).trim();
        const cleanRoll = rollStr.replace(/^0+/, '');

        // Try to find matching extracted row by studentId or Roll No
        const matched = extractedMap.get(studentId) || extractedMap.get(`roll_${cleanRoll}`);

        const marks = {};
        const lowConfidenceSubjects = matched?.lowConfidenceSubjects || [];

        subjects.forEach(sub => {
            let val = matched?.marks?.[sub.subjectId];
            if (val === undefined || val === null || isNaN(val)) {
                // If not in matched, default to 0
                val = 0;
            }
            marks[sub.subjectId] = val;
        });

        // Compute system auto-sum
        const systemTotal = Object.values(marks).reduce((sum, v) => sum + (v > 0 ? Number(v) : 0), 0);
        const registerGrandTotal = matched?.registerGrandTotal !== undefined ? Number(matched.registerGrandTotal) : systemTotal;

        return {
            studentId,
            rollNo: rollStr,
            name: st.name || st.studentName || `Student #${rollStr}`,
            fatherName: st.fatherName || '',
            marks,
            systemTotal,
            registerGrandTotal,
            lowConfidenceSubjects,
            sourceImageIndex: matched?.sourceImageIndex ?? 0,
            hasAiData: !!matched
        };
    });
}
