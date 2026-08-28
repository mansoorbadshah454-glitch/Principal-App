// Central Built-in AI Vision Engine for School SaaS
// Automatically fetches the Master Gemini API Key configured by Super Admin in Super Admin Settings.
// Queries Google's ModelService dynamically to execute on verified, active models.

import { db } from '../firebase';
import { doc } from 'firebase/firestore';
import { getDocFast } from './cacheUtils';

let cachedMasterKey = localStorage.getItem('gemini_api_key') || import.meta.env?.VITE_GEMINI_API_KEY || "";
let cachedWorkingModel = "";

/**
 * Resolves the Master Gemini API Key set globally by Super Admin.
 */
export const resolveMasterGeminiKey = async () => {
    if (cachedMasterKey && cachedMasterKey.trim()) {
        return cachedMasterKey.trim();
    }

    // 1. Try reading from Firestore curriculums/ai_settings (Guaranteed Permission)
    try {
        const snap = await getDocFast(doc(db, "curriculums", "ai_settings"));
        if (snap.exists() && snap.data().geminiApiKey) {
            const key = snap.data().geminiApiKey.trim();
            cachedMasterKey = key;
            localStorage.setItem('gemini_api_key', key);
            return key;
        }
    } catch (e) {
        console.warn("Could not read curriculums/ai_settings doc:", e);
    }

    // 2. Try reading from Firestore system_config/ai_settings
    try {
        const snap = await getDocFast(doc(db, "system_config", "ai_settings"));
        if (snap.exists() && snap.data().geminiApiKey) {
            const key = snap.data().geminiApiKey.trim();
            cachedMasterKey = key;
            localStorage.setItem('gemini_api_key', key);
            return key;
        }
    } catch (e) {
        console.warn("Could not read ai_settings doc:", e);
    }

    // 3. Try reading from Firestore system_configs/global
    try {
        const globalSnap = await getDocFast(doc(db, "system_configs", "global"));
        if (globalSnap.exists()) {
            const data = globalSnap.data().configs;
            if (data?.ai?.geminiApiKey) {
                const key = data.ai.geminiApiKey.trim();
                cachedMasterKey = key;
                localStorage.setItem('gemini_api_key', key);
                return key;
            }
        }
    } catch (e) {
        console.warn("Could not read system_configs/global:", e);
    }

    return "";
};

/**
 * Dynamically queries Google API to get all active generation models for this key.
 */
export const fetchSupportedModels = async (activeKey) => {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`);
        if (res.ok) {
            const data = await res.json();
            const models = (data.models || [])
                .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
                .map(m => m.name.replace(/^models\//, ''));

            console.log("Active Google AI Models for key:", models);

            if (models.length > 0) {
                // Sort models so fast vision models are prioritized
                return models.sort((a, b) => {
                    const aFlash = a.includes('flash') ? 1 : 0;
                    const bFlash = b.includes('flash') ? 1 : 0;
                    return bFlash - aFlash;
                });
            }
        } else {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Google API error: ${res.status}`);
        }
    } catch (e) {
        console.warn("Model list query failed:", e.message);
    }

    // Hard fallback list if model discovery endpoint fails
    return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
};

/**
 * Executes a Gemini request strictly against verified, supported models.
 */
const executeGeminiRequest = async (activeKey, payload) => {
    let candidateModels = [];

    if (cachedWorkingModel) {
        candidateModels = [cachedWorkingModel];
    } else {
        candidateModels = await fetchSupportedModels(activeKey);
    }

    let lastError = null;

    for (const modelName of candidateModels) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${activeKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );

            if (response.ok) {
                const data = await response.json();
                const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawText) {
                    cachedWorkingModel = modelName;
                    return rawText;
                }
            } else {
                const errJson = await response.json().catch(() => ({}));
                const rawMsg = errJson.error?.message || `API error (${response.status})`;
                lastError = new Error(rawMsg);
                console.warn(`Attempt with model "${modelName}" failed:`, rawMsg);
            }
        } catch (e) {
            lastError = e;
            console.warn(`Exception calling "${modelName}":`, e);
        }
    }

    // If cached working model failed, invalidate cache and try all supported models once
    if (cachedWorkingModel) {
        cachedWorkingModel = "";
        const allModels = await fetchSupportedModels(activeKey);
        for (const modelName of allModels) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${activeKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (rawText) {
                        cachedWorkingModel = modelName;
                        return rawText;
                    }
                }
            } catch (e) {
                console.warn("Retry exception:", e);
            }
        }
    }

    throw lastError || new Error("Failed to extract content from image. Please try again.");
};

/**
 * Scans a book's Table of Contents / Index page and automatically returns an array of chapters.
 */
export const scanBookIndexPage = async (base64Data, mimeType, subjectName) => {
    const activeKey = await resolveMasterGeminiKey();
    if (!activeKey) {
        throw new Error("AI Engine not configured. Please open Super Admin WebApp -> Settings and save your free Gemini API Key.");
    }

    const promptText = `
You are an expert textbook curriculum parser. 
Analyze this textbook Table of Contents / Index page for Subject "${subjectName}".

Extract ALL chapter / unit names in order. Return ONLY valid JSON in this exact structure without any markdown code fences or backticks:
{
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter 1: Physical Quantities & Measurement",
      "time": "2 Weeks"
    },
    {
      "chapterNumber": 2,
      "title": "Chapter 2: Kinematics",
      "time": "2 Weeks"
    }
  ]
}

RULES:
1. Capture all visible chapters in order (e.g. Chapter 1, Chapter 2... or Unit 1, Unit 2... or Sabaq 1, 2...).
2. If in Urdu, preserve accurate Urdu chapter titles.
3. Return clean, parseable JSON only.
`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: promptText },
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType || 'image/jpeg'
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1
        }
    };

    const rawText = await executeGeminiRequest(activeKey, payload);

    let cleanJsonStr = rawText.trim();
    if (cleanJsonStr.startsWith('```json')) {
        cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJsonStr.startsWith('```')) {
        cleanJsonStr = cleanJsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanJsonStr);
    return parsed.chapters || [];
};

/**
 * Scans exercise page photos and extracts MCQs, short questions, and long questions.
 */
export const scanExercisePages = async (imageParts, subjectName, chapterName) => {
    const activeKey = await resolveMasterGeminiKey();
    if (!activeKey) {
        throw new Error("AI Engine not configured. Please open Super Admin WebApp -> Settings and save your free Gemini API Key.");
    }

    const promptText = `
You are an expert textbook curriculum parser. 
Scan this exercise page for "${chapterName}" (${subjectName}).

Extract all exercise questions into this strict JSON format:
{
  "topics": ["Key topic or sub-concept 1", "Key topic or sub-concept 2"],
  "questions": [
    {
      "type": "mcq",
      "question": "Question text in English or Urdu",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Correct Option text",
      "marks": 1
    },
    {
      "type": "blank",
      "question": "The sun rises in the ______ direction.",
      "correctAnswer": "East",
      "marks": 1
    },
    {
      "type": "true_false",
      "question": "Plants produce oxygen during photosynthesis.",
      "correctAnswer": "True",
      "marks": 1
    },
    {
      "type": "short",
      "question": "Short question text",
      "marks": 2
    },
    {
      "type": "long",
      "question": "Long descriptive question text",
      "marks": 5
    }
  ]
}

RULES:
1. Accurately categorize question types: 'mcq' (with 4 options), 'blank' (Fill in the blanks with ______), 'true_false' (True/False), 'short', and 'long'.
2. Return ONLY JSON without markdown code fences.
3. Capture exact Urdu or English text.
`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: promptText },
                    ...imageParts
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1
        }
    };

    const rawText = await executeGeminiRequest(activeKey, payload);

    let cleanJsonStr = rawText.trim();
    if (cleanJsonStr.startsWith('```json')) {
        cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJsonStr.startsWith('```')) {
        cleanJsonStr = cleanJsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanJsonStr);
    return {
        questions: parsed.questions || [],
        topics: parsed.topics || []
    };
};

/**
 * Scans a Multi-Page Book / Exercise PDF or Batch Scanned Images
 * Automatically detects all chapters and extracts all exercise questions (MCQs, Blanks, True/False, Shorts, Longs) grouped by chapter.
 */
export const scanCompleteBookPdf = async (base64Data, mimeType, subjectName, className) => {
    const activeKey = await resolveMasterGeminiKey();
    if (!activeKey) {
        throw new Error("AI Engine not configured. Please open Super Admin WebApp -> Settings and save your free Gemini API Key.");
    }

    const promptText = `
You are an elite educational textbook parser for Pakistani & International School Curriculums.
Subject: "${subjectName}"
Target Class: "${className || 'General'}"

Analyze this entire document / multi-page scanned PDF.
The document contains textbook index pages and/or chapter exercise pages (scanned via CamScanner or digital PDF).

TASK:
1. Identify all distinct Chapters / Units / Sabaq present in this document.
2. Under each chapter, extract ALL exercise questions found in the pages:
   - MCQs (Multiple Choice Questions) with all 4 options and correct answer.
   - Fill in the Blanks (with target blank position denoted by '______').
   - True / False statements.
   - Short Questions / Conceptual Questions / Review Questions.
   - Long Questions / Comprehensive / Analytical / Descriptive Questions / Numericals.
3. If the textbook is in Urdu, Sindhi, or Arabic, accurately preserve native script and correct typography.
4. If the textbook is bilingual (English & Urdu), capture both English and Urdu text.

Strictly output ONLY valid JSON in this exact structure without markdown code fences or backticks:
{
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter 1: Physical Quantities and Measurement",
      "topics": ["SI Units", "Significant Figures", "Measuring Instruments"],
      "questions": [
        {
          "type": "mcq",
          "question": "The number of base units in SI is:",
          "options": ["3", "6", "7", "9"],
          "correctAnswer": "7",
          "marks": 1
        },
        {
          "type": "blank",
          "question": "The least count of Vernier Calipers is ______ mm.",
          "correctAnswer": "0.1",
          "marks": 1
        },
        {
          "type": "true_false",
          "question": "Kilogram is a base unit in SI system.",
          "correctAnswer": "True",
          "marks": 1
        },
        {
          "type": "short",
          "question": "What is the least count of a Vernier Calipers?",
          "marks": 2
        },
        {
          "type": "long",
          "question": "Describe the construction and working of a screw gauge with diagram explanation.",
          "marks": 5
        }
      ]
    }
  ]
}

RULES:
1. Do not skip any chapters or questions present in the scanned pages.
2. Group each question under its correct chapter.
3. Every MCQ MUST have 4 options in the options array.
4. Fill in the blanks MUST have '______' in the question text.
5. Question types MUST be one of: 'mcq', 'blank', 'true_false', 'short', 'long'.
6. Marks: MCQ = 1, Blank = 1, True/False = 1, Short = 2 or 3, Long = 4 or 5.
7. Return clean, raw JSON ONLY.
`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: promptText },
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType || 'application/pdf'
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1
        }
    };

    const rawText = await executeGeminiRequest(activeKey, payload);

    let cleanJsonStr = rawText.trim();
    if (cleanJsonStr.startsWith('```json')) {
        cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJsonStr.startsWith('```')) {
        cleanJsonStr = cleanJsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
        const parsed = JSON.parse(cleanJsonStr);
        return parsed.chapters || [];
    } catch (parseErr) {
        // Fallback: try to extract JSON from anywhere in text
        const jsonMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const fallbackParsed = JSON.parse(jsonMatch[0]);
            return fallbackParsed.chapters || [];
        }
        throw new Error("Could not parse AI response into structured chapters. Please ensure the PDF is legible.");
    }
};

