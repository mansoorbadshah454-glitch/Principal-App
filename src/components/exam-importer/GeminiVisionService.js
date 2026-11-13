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
 * Calls Gemini Flash Vision with the processed broadsheet image
 * and the preloaded student/subject roster.
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
1. A photograph of a physical handwritten student marksheet broadsheet.
2. An ordered list of subjects appearing in column order from left to right:
${JSON.stringify(subjects.map((s, i) => ({ colIndex: i + 1, subjectId: s.subjectId, name: s.name, maxMarks: s.maxMarks })))}
3. A known student roster for this class:
${JSON.stringify(students.map(st => ({ rollNo: String(st.rollNo || st.rollNumber || ''), name: st.name, studentId: st.studentId || st.id })))}

STRICT RULES:
1. Do NOT transcribe names. Handwritten Urdu/English names are often illegible. Anchor STRICTLY on the Roll Number column (or sequential row order corresponding to the student roster).
2. Extract numeric marks for each subject matching the exact subject columns from left to right.
3. If an exam mark is marked as Absent ('A', 'Abs', 'غ/حاضر'), set the mark to -1 (representing Absent).
4. If a mark cell is blank/unattempted, set it to 0.
5. Extract the handwritten register Grand Total written by the teacher in the final 'Total' / 'Grand Total' / 'Meezan' column into 'registerGrandTotal'.
6. If any mark has severe overwriting, strike-through (kat-pit), or blur, add the subject's subjectId to the 'lowConfidenceSubjects' array for that student row.
7. Return ONLY valid JSON in this exact structure without markdown backticks:
{
  "sourceImageIndex": ${imageIndex},
  "rows": [
    {
      "rollNo": "1",
      "studentId": "id_here_or_matched",
      "marks": {
        "subject_id": 85
      },
      "registerGrandTotal": 420,
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

    // Use Gemini 2.5 Flash with fallback to 1.5 Flash
    const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
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
