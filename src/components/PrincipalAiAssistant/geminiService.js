import { generateInstantAnswer, getDeepStudentProfile, formatCurrency, transliterateUrduToRoman } from './aiDataEngine';

const DEFAULT_MODEL = 'gemini-1.5-flash';

// Remember last active student across chat turns for pronouns like "iska phone nbr do", "iske marks batao"
let lastActiveStudentCache = null;

/**
 * Call Google Gemini REST API directly with deep school context injection
 */
export async function askGeminiAssistant({ apiKey, userQuestion, context, conversationHistory = [] }) {
    const activeApiKey = (apiKey || import.meta.env?.VITE_GEMINI_API_KEY || '').trim();
    const rawRoman = transliterateUrduToRoman(userQuestion || '');
    const lowerQ = (userQuestion || '').toLowerCase();
    const combinedQ = `${lowerQ} ${rawRoman.toLowerCase()}`;
    
    // 1. Check if this is a School-level Query or Help / Company Query
    const isSchoolLevelQuery = 
        combinedQ.includes('profit') || combinedQ.includes('munafa') || combinedQ.includes('loss') || combinedQ.includes('nuqsan') ||
        combinedQ.includes('bachat') || combinedQ.includes('admission') || combinedQ.includes('dakhila') || combinedQ.includes('slc') ||
        combinedQ.includes('left') || (combinedQ.includes('cashier') && !combinedQ.includes('roll')) || 
        (combinedQ.includes('counter') && !combinedQ.includes('roll')) || (combinedQ.includes('attendance') && !combinedQ.includes('roll')) ||
        (combinedQ.includes('salary') && !combinedQ.includes('roll')) || (combinedQ.includes('tankhwah') && !combinedQ.includes('roll')) ||
        combinedQ.includes('help') || combinedQ.includes('madad') || combinedQ.includes('support') || combinedQ.includes('mai tech') ||
        combinedQ.includes('mai') || combinedQ.includes('smc') || combinedQ.includes('company') || combinedQ.includes('developer') ||
        combinedQ.includes('mansoor') || combinedQ.includes('naqeeb') || combinedQ.includes('yaqoob') || combinedQ.includes('software') ||
        combinedQ.includes('pichlay saal') || combinedQ.includes('is saal profit') || combinedQ.includes('is month profit');

    let studentReport = null;

    // 2. Check if this is a pronoun follow-up ("iska", "uski", "unka", "in ka", "phone nbr and address do iska")
    const isPronounFollowup = 
        combinedQ.includes('iska') || combinedQ.includes('iski') || combinedQ.includes('uske') || 
        combinedQ.includes('uski') || combinedQ.includes('uska') || combinedQ.includes('inka') || 
        combinedQ.includes('unki') || combinedQ.includes('phone') || combinedQ.includes('address') || 
        combinedQ.includes('parent') || combinedQ.includes('father');

    if (isPronounFollowup && lastActiveStudentCache && !isSchoolLevelQuery) {
        studentReport = lastActiveStudentCache;
    }

    // 3. Extract Class Hint if mentioned (e.g. "Prep", "1st", "Nursery", "10th")
    let classHint = null;
    const classMatches = combinedQ.match(/\b(prep|nursery|play|kg|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th)\b/i);
    if (classMatches && classMatches[1]) {
        classHint = classMatches[1].toLowerCase();
    }

    // 4. Search for Student if explicitly intended
    if (!isSchoolLevelQuery && context?.schoolId && !studentReport) {
        // Check for explicit roll number like "roll no 1004", "roll 1228", "gr 550", "prep 1004", "class prep roll 1004"
        let cleanRoll = null;
        const rollMatch = (userQuestion + ' ' + rawRoman).match(/(?:roll\s*(?:no\.?|num(?:ber)?)?|gr\s*(?:no\.?)?|r\.no\.?)\s*[:#-]?\s*([a-zA-Z0-9_-]+)/i);
        if (rollMatch && rollMatch[1]) {
            cleanRoll = rollMatch[1].trim();
        } else {
            // Check for standalone numbers if class or student context is present (e.g. "class prep , 1004", "prep 1004")
            const numMatch = (userQuestion + ' ' + rawRoman).match(/\b(\d{1,6})\b/);
            if (numMatch && numMatch[1] && (classHint || combinedQ.includes('class') || combinedQ.includes('student') || combinedQ.includes('roll'))) {
                cleanRoll = numMatch[1].trim();
            }
        }

        if (cleanRoll) {
            const rep = await getDeepStudentProfile(context.schoolId, cleanRoll, classHint);
            if (rep && !rep.notFound && !rep.error) {
                studentReport = rep;
                lastActiveStudentCache = rep;
            }
        }

        if (!studentReport) {
            // Filter words against stop words list
            const stopWords = new Set([
                'aaj', 'ki', 'ka', 'ke', 'ko', 'mein', 'par', 'se', 'hai', 'hain', 'kya', 'kitni', 'kitna', 'kitne',
                'fee', 'fees', 'paid', 'pending', 'exam', 'exams', 'result', 'results', 'term', 'terms', 'first', 'second',
                '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', 'final', 'mid', 'marks', 'score', 'status', 'check', 'batao', 'dakhila', 'admission',
                'cashier', 'salary', 'profit', 'loss', 'attendance', 'school', 'sir', 'the', 'is', 'was', 'how', 'much',
                'date', 'time', 'waqt', 'din', 'tareekh', 'today', 'now', 'clock', 'calendar', 'pichlay', 'saal', 'year',
                'month', 'mahina', 'zyada', 'kam', 'aur', 'karo', 'dekho', 'do', 'iska', 'iski', 'uska', 'unki', 'unka',
                'phone', 'number', 'address', 'parent', 'father', 'mother', 'naam', 'bhi', 'total', 'bache', 'classes', 'class', 'prep', 'nursery', 'play', 'kg',
                'mujhe', 'batao', 'bataen', 'bataiye', 'karein', 'kare', 'bolo', 'sunao', 'dein', 'den'
            ]);

            // Clean candidate words from both raw text and transliterated roman text
            const cleanWords = rawRoman.split(/\s+/)
                .map(w => w.replace(/[^a-zA-Z0-9]/g, '').trim())
                .filter(w => w.length >= 3 && !stopWords.has(w.toLowerCase()));

            // Try 2-word phrase combinations first (e.g. "ayesha siddiqa")
            for (let i = 0; i < cleanWords.length - 1; i++) {
                const twoWordCandidate = `${cleanWords[i]} ${cleanWords[i + 1]}`;
                const rep = await getDeepStudentProfile(context.schoolId, twoWordCandidate, classHint);
                if (rep && !rep.notFound && !rep.error) {
                    studentReport = rep;
                    lastActiveStudentCache = rep;
                    break;
                }
            }

            // Try single words next
            if (!studentReport) {
                for (const word of cleanWords) {
                    const rep = await getDeepStudentProfile(context.schoolId, word, classHint);
                    if (rep && !rep.notFound && !rep.error) {
                        studentReport = rep;
                        lastActiveStudentCache = rep;
                        break;
                    }
                }
            }
        }
    }

    // 4. If NO Gemini API Key is available, seamlessly use the 100% Free Instant Local Engine
    if (!activeApiKey) {
        const localAnswer = generateInstantAnswer(userQuestion, context, studentReport);
        return {
            text: localAnswer,
            source: 'local_engine',
            studentReport
        };
    }

    // 5. Prepare Rich Context & Master System Prompt for Gemini
    const systemPrompt = `
You are the elite AI Executive Assistant & School Secretary for the Principal of "${context?.schoolName || 'Smart School'}".
Your Persona & Character:
- Respectful, intelligent, concise, proactive, and friendly. Always address the user politely (e.g., "Principal Sir", "Sir").
- You speak fluent natural Roman Urdu (e.g. "Sir, aaj ki fee collection Rs. 45,000 hui hai..."), English, or Urdu depending on user language.
- STRICT RULE: 100% ACCURACY. NEVER guess or invent school numbers. Use the verified live school data below.
- NATURAL SPEECH: Always format dates as "26 September 2026" and times as "11:30 AM" so that when read aloud it sounds human.

=== LIVE REAL-TIME CLOCK & CALENDAR ===
- Live Current Time: ${context?.currentTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
- Live Today's Date: ${context?.currentFormattedDate || new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
- Today's Day: ${context?.currentDay || 'Saturday'} (${context?.currentDayUrdu || ''})
- Current Academic Month & Year: ${context?.currentMonth || ''} ${context?.year || ''}

=== TECHNOLOGY PARTNER & COMPANY SUPPORT (MAI TECH) ===
- System Creator & Engineering Partner: "MAI TECH (SMC - Private) Limited"
- Software Name: "MAI SMS (School Management System)"
- Core Engineering & Support Team Contacts:
  1. Mansoor Ahmad (Technical Lead & System Architect): WhatsApp / Call: 0334-5722302 (Software Architecture, Cloud Operations)
  2. Naqeeb Jan (Customer Support & Systems Engineer): Phone / Mobile: 0337-9204647 (Daily Operations, Sync & Issue Resolution)
  3. Muhammad Yaqoob (Client Relations & Operations): Phone / Mobile: 0331-9656581 (Account Management, Hardware Setup & School Onboarding)
- Services: 24/7 Dedicated Principal Support, Cloud Auto-Backup, POS Receipt Thermal Printers & Biometric Integration, Custom Board Exam DMC Formats, Bulk SMS/WhatsApp Gateways.

=== VERIFIED LIVE SCHOOL MASTER DATA ===
- School Name: ${context?.schoolName || 'Smart School'}
- Total Enrolled Students: ${context?.totalStudents || 0}
- Total Classes: ${context?.classes?.length || 0} (${context?.classes?.map(c => `${c.name}: ${c.studentCount || 0} students`).join(', ')})
- Total Teachers & Staff: ${context?.teachers?.length || 0}

- FEE REVENUE & COLLECTION:
  * Today's Collection: Rs. ${(context?.feeStats?.todayCollection || 0).toLocaleString()} (${context?.feeStats?.todayCount || 0} students paid today)
  * Current Month Collection (${context?.currentMonth || ''}): Rs. ${(context?.feeStats?.monthCollection || 0).toLocaleString()} (${context?.feeStats?.monthCount || 0} receipts)
  * Previous Month Collection (${context?.prevMonthName || ''}): Rs. ${(context?.feeStats?.prevMonthCollection || 0).toLocaleString()}
  * This Year (${context?.year || ''}) Collection: Rs. ${(context?.feeStats?.thisYearCollection || 0).toLocaleString()}
  * Previous Year (${context?.prevYear || ''}) Collection: Rs. ${(context?.feeStats?.prevYearCollection || 0).toLocaleString()}

- CASHIER-WISE COLLECTION BREAKDOWN:
  * Today's Counter Logs: ${JSON.stringify(context?.feeStats?.cashierBreakdown?.today || {})}
  * This Month's Counter Logs: ${JSON.stringify(context?.feeStats?.cashierBreakdown?.thisMonth || {})}

- FINANCIAL PROFIT / LOSS COMPARISON:
  * Current Month Net Profit/Surplus (${context?.currentMonth || ''}): Rs. ${(context?.financeAnalytics?.thisMonth?.netProfit || 0).toLocaleString()} (Income: Rs. ${(context?.financeAnalytics?.thisMonth?.income || 0).toLocaleString()}, Expense: Rs. ${(context?.financeAnalytics?.thisMonth?.expense || 0).toLocaleString()})
  * Previous Month Net Profit (${context?.prevMonthName || ''}): Rs. ${(context?.financeAnalytics?.prevMonth?.netProfit || 0).toLocaleString()}
  * Monthly Comparison Verdict: ${context?.financeAnalytics?.monthComparisonText || 'Balanced'}
  * Annual (${context?.year || ''}) Profit vs (${context?.prevYear || ''}): ${context?.financeAnalytics?.yearComparisonText || 'Balanced'}

- NEW ADMISSIONS & LEFT STUDENTS (SLC VAULT):
  * This Year New Admissions (${context?.year || ''}): ${context?.admissionsStats?.thisYearCount || 0} Students
  * This Month New Admissions: ${context?.admissionsStats?.thisMonthCount || 0} Students
  * Last Year Admissions (${context?.prevYear || ''}): ${context?.admissionsStats?.lastYearCount || 0} Students
  * This Year Left Students (SLC): ${context?.slcStats?.thisYearLeft || 0} Students
  * Total 50-Year SLC Vault Archive: ${context?.slcStats?.totalArchived || 0} Certificates Issued

- SALARIES & PAYROLL (${context?.currentMonth || ''}):
  * Total Monthly Budget: Rs. ${(context?.payrollStats?.totalPayrollBudget || 0).toLocaleString()}
  * Paid: ${context?.payrollStats?.paidTeachers || 0} Teachers (Rs. ${(context?.payrollStats?.paidAmount || 0).toLocaleString()})
  * Pending: ${context?.payrollStats?.unpaidTeachers || 0} Teachers (Rs. ${(context?.payrollStats?.pendingAmount || 0).toLocaleString()})

- TODAY'S ATTENDANCE:
  * Present: ${context?.attendanceStats?.presentStudents || 0} | Absent: ${context?.attendanceStats?.absentStudents || 0} (Rate: ${context?.attendanceStats?.attendanceRate || 'N/A'})

${studentReport && !studentReport.notFound ? `
- SPECIFIC STUDENT 360° RECORD FOUND:
  * Name: ${studentReport.student?.name || studentReport.student?.studentName} (Roll No: ${studentReport.student?.rollNo || 'N/A'}, Class: ${studentReport.className})
  * Joining / Admission Date: ${studentReport.contactInfo?.admissionDate || 'N/A'}
  * Date of Birth: ${studentReport.contactInfo?.dob || 'N/A'} | Gender: ${studentReport.contactInfo?.gender || 'N/A'}
  * Father's Name: ${studentReport.contactInfo?.fatherName || 'N/A'}
  * Mother's Name: ${studentReport.contactInfo?.motherName || 'N/A'}
  * Phone / Mobile Number: ${studentReport.contactInfo?.phone || 'N/A'}
  * Emergency Contact: ${studentReport.contactInfo?.emergencyPhone || 'N/A'}
  * Home / Residential Address: ${studentReport.contactInfo?.address || 'N/A'}
  * B-Form / CNIC: ${studentReport.contactInfo?.bForm || 'N/A'}
  * Monthly Fee: Rs. ${(studentReport.financials?.monthlyFee || 0).toLocaleString()}
  * Current Fee Arrears / Pending Dues: Rs. ${(studentReport.financials?.arrears || 0).toLocaleString()} (${studentReport.financials?.isFeePaidThisMonth ? 'Paid for Current Month' : 'Pending for Current Month'})
  * Last Payment: Rs. ${(studentReport.financials?.lastReceiptAmount || 0).toLocaleString()} on ${studentReport.financials?.lastReceiptDate || 'N/A'} (Receipt: ${studentReport.financials?.lastReceiptNo || 'N/A'})
  * 12-Month Academic Fee Record (${context?.year || new Date().getFullYear()}):
    - Cleared / Paid Months: ${JSON.stringify(studentReport.financials?.paidMonths || [])}
    - Pending / Due Months: ${JSON.stringify(studentReport.financials?.pendingMonths || [])}
  * Academic Terms & Exam DMC Record:
    - Published / Completed Terms: ${JSON.stringify(studentReport.termReports || [])}
    - Pending / Upcoming Terms: ${JSON.stringify(studentReport.pendingTerms || [])}
  * Overall Exam Status: ${studentReport.termReports?.length > 0 ? (studentReport.isOverallPass ? 'PROMOTED / ALL PASS' : 'NEEDS IMPROVEMENT') : 'PENDING (Result cards not published to parents yet)'}
` : ''}
=======================================

Guidelines for Answering:
1. If asked about software help, support, bugs, training, backup, or company background, provide the MAI TECH support team details (Mansoor Ahmad: 0334-5722302, Naqeeb Jan: 0337-9204647, Muhammad Yaqoob: 0331-9656581) in a professional format.
2. If asked about a student's phone, address, or parent details, provide the exact numbers from the Student 360 Record.
3. If asked about profit comparison, cite the exact numbers from Financial Profit / Loss Comparison above.
4. If asked about admissions or SLC left students, cite the exact numbers above.
5. STRICT RULE FOR EXAMS: If an exam term has not been officially published to parents yet (or appears in Pending / Upcoming Terms), state clearly that the term is "⏳ Pending (Result abhi publish nahi hua)". Only show final scores for officially published terms, and NEVER duplicate subject entries.
6. Keep answers clean, respectful, well-structured, and easy to read.
`.trim();

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${activeApiKey}`;
        
        const contents = [];

        conversationHistory.slice(-6).forEach(msg => {
            contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            });
        });

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
                    temperature: 0.3,
                    maxOutputTokens: 900
                }
            })
        });

        if (!response.ok) {
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
        console.error('[Gemini API] Network fallback to local engine:', e);
        const fallbackAnswer = generateInstantAnswer(userQuestion, context, studentReport);
        return { text: fallbackAnswer, source: 'local_fallback', studentReport };
    }
}
