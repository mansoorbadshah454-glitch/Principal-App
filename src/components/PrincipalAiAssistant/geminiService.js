import { generateInstantAnswer, getStudentMarksReport } from './aiDataEngine';

const DEFAULT_MODEL = 'gemini-1.5-flash';

/**
 * Call Google Gemini REST API directly (Browser safe, Zero backend server required)
 */
export async function askGeminiAssistant({ apiKey, userQuestion, context, conversationHistory = [] }) {
    // 1. Check if user is asking about a specific student by name or roll number
    let studentReport = null;
    const lowerQ = (userQuestion || '').toLowerCase();
    
    // Check if query contains student exam/promotion keywords
    const isExamQuery = lowerQ.includes('exam') || lowerQ.includes('result') || lowerQ.includes('term') || 
                        lowerQ.includes('pass') || lowerQ.includes('fail') || lowerQ.includes('promotion') ||
                        lowerQ.includes('marks') || lowerQ.includes('number');

    if (isExamQuery && context?.schoolId) {
        // Extract potential student name from the query
        const words = userQuestion.split(/\s+/).filter(w => w.length > 2);
        for (const word of words) {
            const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
            if (['result', 'marks', 'exam', 'terms', 'term', 'promotion', 'status', 'check', 'batao', 'kya', 'karo', 'ka', 'ki', 'ke', 'hai', 'hain', 'fail', 'pass'].includes(cleanWord.toLowerCase())) {
                continue;
            }
            // Try looking up student
            const rep = await getStudentMarksReport(context.schoolId, cleanWord);
            if (rep && !rep.notFound && !rep.error) {
                studentReport = rep;
                break;
            }
        }
    }

    // 2. If NO Gemini API Key is provided, use the Instant Local Engine
    if (!apiKey || apiKey.trim() === '') {
        const localAnswer = generateInstantAnswer(userQuestion, context, studentReport);
        return {
            text: localAnswer,
            source: 'local_engine',
            studentReport
        };
    }

    // 3. Prepare System Prompt & Context Injection for Gemini
    const systemPrompt = `
You are the AI Executive Assistant & School Secretary for the Principal of "${context?.schoolName || 'Smart School'}".
Your Persona:
- Professional, warm, respectful, intelligent, and proactive. Always address the user respectfully (e.g., "Principal Sir", "Sir").
- You speak fluent Roman Urdu (e.g., "Sir, aaj ki fee collection Rs. 45,000 hui hai..."), English, or Urdu depending on what the user asks.
- NEVER fabricate or guess school numbers. You have access to the exact verified live school data below.

=== VERIFIED LIVE SCHOOL DATA ===
- School Name: ${context?.schoolName || 'School'}
- Date: ${context?.date || new Date().toISOString().split('T')[0]}
- Current Month: ${context?.currentMonth || 'Current Month'} ${context?.year || ''}
- Total Students Enrolled: ${context?.totalStudents || 0}
- Total Classes: ${context?.classes?.length || 0} (${context?.classes?.map(c => c.name).join(', ')})
- Total Teachers & Staff: ${context?.teachers?.length || 0}

- TODAY'S FEE COLLECTION:
  * Total Collected Today: Rs. ${(context?.feeStats?.todayCollection || 0).toLocaleString()}
  * Students Paid Today: ${context?.feeStats?.todayCount || 0}

- CURRENT MONTH FEE SUMMARY:
  * Total Month Collection: Rs. ${(context?.feeStats?.monthCollection || 0).toLocaleString()}
  * Total Receipts: ${context?.feeStats?.monthCount || 0}

- SALARIES & PAYROLL (${context?.currentMonth || ''}):
  * Total Monthly Payroll Budget: Rs. ${(context?.payrollStats?.totalPayrollBudget || 0).toLocaleString()}
  * Salary Paid: ${context?.payrollStats?.paidTeachers || 0} Teachers (Rs. ${(context?.payrollStats?.paidAmount || 0).toLocaleString()})
  * Salary Pending: ${context?.payrollStats?.unpaidTeachers || 0} Teachers (Rs. ${(context?.payrollStats?.pendingAmount || 0).toLocaleString()})

- TODAY'S ATTENDANCE:
  * Present: ${context?.attendanceStats?.presentStudents || 0}
  * Absent: ${context?.attendanceStats?.absentStudents || 0}
  * Rate: ${context?.attendanceStats?.attendanceRate || 'N/A'}

${studentReport && !studentReport.notFound ? `
- SPECIFIC STUDENT FOUND:
  * Name: ${studentReport.student?.name || studentReport.student?.studentName} (Roll No: ${studentReport.student?.rollNo || 'N/A'}, Class: ${studentReport.className})
  * Overall Status: ${studentReport.isOverallPass ? 'PASS / PROMOTED' : 'FAIL / CONDITIONAL'}
  * Exam Results: ${JSON.stringify(studentReport.examResults)}
` : ''}
================================

Guidelines for Response:
1. Always give clear, concise, well-formatted answers with bullet points and bold highlights.
2. If asked about fees, salaries, exams, terms, promotions, or attendance, give exact numbers from the data above.
3. If the user asks in Roman Urdu, reply in polite, natural Roman Urdu.
4. Keep the tone friendly, encouraging, and supportive of the Principal's leadership.
`.trim();

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${apiKey.trim()}`;
        
        // Build contents payload including recent chat history for context
        const contents = [];

        // Add history (up to last 6 messages)
        conversationHistory.slice(-6).forEach(msg => {
            contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            });
        });

        // Add current user prompt
        contents.push({
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nUser Question: ${userQuestion}` }]
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 800
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.warn('[Gemini API] Request failed, falling back to local engine:', errData);
            const fallbackAnswer = generateInstantAnswer(userQuestion, context, studentReport);
            return {
                text: fallbackAnswer,
                source: 'local_fallback',
                studentReport
            };
        }

        const data = await response.json();
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
            return {
                text: responseText.trim(),
                source: 'gemini',
                studentReport
            };
        } else {
            const fallbackAnswer = generateInstantAnswer(userQuestion, context, studentReport);
            return { text: fallbackAnswer, source: 'local_fallback', studentReport };
        }
    } catch (e) {
        console.error('[Gemini API] Network/execution error, falling back to local engine:', e);
        const fallbackAnswer = generateInstantAnswer(userQuestion, context, studentReport);
        return { text: fallbackAnswer, source: 'local_fallback', studentReport };
    }
}
