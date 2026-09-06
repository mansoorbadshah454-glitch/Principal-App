import React, { useState, useEffect, useRef } from 'react';
import { 
    Sparkles, MessageSquare, X, Send, Bot, User, RefreshCw, 
    ChevronDown, Volume2, Mic, MicOff, Check, AlertCircle, 
    ArrowUpRight, ShieldCheck, Zap, HelpCircle, CheckCircle2, GraduationCap 
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getLiveSchoolContext } from './aiDataEngine';
import { askGeminiAssistant } from './geminiService';

export default function PrincipalAiAssistant({ schoolId }) {
    const [isOpen, setIsOpen] = useState(false);
    const [schoolLogo, setSchoolLogo] = useState('');
    const [messages, setMessages] = useState(() => {
        return [
            {
                id: 'welcome',
                role: 'assistant',
                text: `Salam Principal Sir! 👋 Main aapka **School AI Assistant** hoon.\n\nAap mujh se school ke baray mein kuch bhi pooch sakte hain jaise:\n• **Aaj ki fee collection kitni hui?**\n• **Is month kitne teachers ki salary paid hui?**\n• **Kisi student ka exam result ya promotion status**\n• **Aaj ki student attendance**\n\nMain aapki kya madad kar sakta hoon?`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        ];
    });
    
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [schoolContext, setSchoolContext] = useState(null);
    const [isRefreshingContext, setIsRefreshingContext] = useState(false);
    const [aiSettings, setAiSettings] = useState({ apiKey: '', botName: 'Principal AI Copilot' });
    const [isListening, setIsListening] = useState(false);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    // 1. Listen to School Profile for Logo Image
    useEffect(() => {
        if (!schoolId) return;

        const profileRef = doc(db, `schools/${schoolId}/settings`, 'profile');
        const unsub = onSnapshot(profileRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const logo = data.profileImage || data.logo || data.schoolLogo || data.photoUrl || data.logoUrl || data.image || '';
                setSchoolLogo(logo);
            }
        }, (err) => {
            console.warn('[AI Assistant] Profile logo fetch notice:', err);
        });

        return () => unsub();
    }, [schoolId]);

    // 2. Listen to School AI Settings (Gemini API Key, Bot Name)
    useEffect(() => {
        if (!schoolId) return;

        const localKey = localStorage.getItem(`gemini_api_key_${schoolId}`) || localStorage.getItem('gemini_api_key') || '';
        if (localKey) {
            setAiSettings(prev => ({ ...prev, apiKey: localKey }));
        }

        const aiDocRef = doc(db, `schools/${schoolId}/settings`, 'ai');
        const unsub = onSnapshot(aiDocRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setAiSettings({
                    apiKey: data.apiKey || localKey || '',
                    botName: data.botName || 'Principal AI Copilot'
                });
            }
        }, (err) => {
            console.warn('[AI Assistant] Settings listener notice:', err);
        });

        return () => unsub();
    }, [schoolId]);

    // 3. Fetch Live School Context on Mount or School Change
    const refreshContext = async () => {
        if (!schoolId) return;
        setIsRefreshingContext(true);
        try {
            const ctx = await getLiveSchoolContext(schoolId);
            setSchoolContext(ctx);
        } catch (e) {
            console.error('[AI Assistant] Error refreshing context:', e);
        } finally {
            setIsRefreshingContext(false);
        }
    };

    useEffect(() => {
        refreshContext();
    }, [schoolId]);

    // 4. Web Speech Recognition Setup (Voice Query)
    useEffect(() => {
        if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'ur-PK';

            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setInputText(transcript);
                setIsListening(false);
            };

            recognitionRef.current.onerror = () => {
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }
    }, []);

    const toggleVoice = () => {
        if (!recognitionRef.current) {
            alert('Voice input is not supported in this browser.');
            return;
        }
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            try {
                recognitionRef.current.start();
                setIsListening(true);
            } catch (e) {
                console.warn('Voice start error:', e);
            }
        }
    };

    // 5. Handle Message Send
    const handleSend = async (customPrompt) => {
        const queryText = (customPrompt || inputText).trim();
        if (!queryText || isLoading) return;

        const userMsg = {
            id: Date.now().toString(),
            role: 'user',
            text: queryText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        setIsLoading(true);

        try {
            // Always fetch fresh real-time context from Firestore
            let activeCtx = await getLiveSchoolContext(schoolId);
            if (activeCtx) {
                setSchoolContext(activeCtx);
            } else {
                activeCtx = schoolContext;
            }

            const response = await askGeminiAssistant({
                apiKey: aiSettings.apiKey,
                userQuestion: queryText,
                context: activeCtx,
                conversationHistory: messages
            });

            const assistantMsg = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: response.text,
                source: response.source,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (error) {
            console.error('[AI Assistant] Chat error:', error);
            setMessages(prev => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    text: 'Maazrat Sir! Koi technical masla pesh aya. Barah-e-karam dobara koshish kijiye.',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    // Quick suggestion chips
    const suggestions = [
        { label: '📊 Aaj ki Fees?', query: 'Aaj kitni fee collect hui hai?' },
        { label: '💰 Salaries Status', query: 'Is month kitne teachers ki salary pay ho chuki hai aur kitni baki hai?' },
        { label: '👥 Aaj ki Attendance', query: 'Aaj ki student attendance report kya hai?' },
        { label: '🏫 School Strength', query: 'School mein total kitne students aur classes hain?' },
        { label: '🎓 Exam & Promotions', query: 'Promotions aur exam term results ka status batao.' }
    ];

    // Helper: Parse bold / highlighted segments
    const parseFormattedInline = (rawText, lineKey) => {
        const boldRegex = /\*\*(.*?)\*\*/g;
        const parts = [];
        let lastIdx = 0;
        let match;
        
        while ((match = boldRegex.exec(rawText)) !== null) {
            if (match.index > lastIdx) {
                parts.push(rawText.substring(lastIdx, match.index));
            }
            parts.push(
                <strong key={`${lineKey}-${match.index}`} className="font-bold text-slate-950">
                    {match[1]}
                </strong>
            );
            lastIdx = boldRegex.lastIndex;
        }
        if (lastIdx < rawText.length) {
            parts.push(rawText.substring(lastIdx));
        }
        return parts.length > 0 ? parts : rawText;
    };

    // Sharp, Clean Markdown Formatter
    const renderFormattedText = (content) => {
        if (!content) return '';
        const lines = content.split('\n');
        return lines.map((line, idx) => {
            const trimmed = line.trim();
            if (trimmed === '') {
                return <div key={idx} className="h-2" />;
            }

            // Bullet line: strip leading '• ', '* ', or '- ' to prevent double bullets
            if (trimmed.startsWith('•') || trimmed.startsWith('*') || trimmed.startsWith('-')) {
                const cleanContent = trimmed.replace(/^[•*\-]\s*/, '');
                return (
                    <div key={idx} className="flex items-start gap-2.5 my-1.5 text-[14.5px] leading-relaxed text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-2 flex-shrink-0" />
                        <span className="flex-1 font-[450]">{parseFormattedInline(cleanContent, idx)}</span>
                    </div>
                );
            }

            // Headers
            if (trimmed.startsWith('###') || trimmed.startsWith('##')) {
                const headerText = trimmed.replace(/^#+\s*/, '');
                return (
                    <div key={idx} className="font-bold text-indigo-950 text-[15px] tracking-tight mt-3 mb-1.5 flex items-center gap-1.5">
                        {parseFormattedInline(headerText, idx)}
                    </div>
                );
            }

            return (
                <div key={idx} className="text-[14.5px] leading-relaxed text-slate-800 font-[450] my-1">
                    {parseFormattedInline(trimmed, idx)}
                </div>
            );
        });
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 font-sans antialiased">
            {/* Custom styles to hide chip scrollbar and sharpen text rendering */}
            <style>{`
                .copilot-chips-scroll::-webkit-scrollbar {
                    display: none !important;
                }
                .copilot-chips-scroll {
                    -ms-overflow-style: none !important;
                    scrollbar-width: none !important;
                }
            `}</style>

            {/* Circular Round Floating Trigger Button with School Logo & Label Below */}
            {!isOpen && (
                <div className="flex flex-col items-center gap-1.5 select-none">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="relative group flex items-center justify-center w-15 h-15 sm:w-16 sm:h-16 rounded-full p-[3px] bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 shadow-[0_10px_25px_rgba(79,70,229,0.45)] hover:shadow-[0_15px_35px_rgba(79,70,229,0.65)] hover:scale-108 active:scale-95 transition-all duration-300 border border-white/40 cursor-pointer"
                        title="Open My School AI Copilot"
                    >
                        {/* Circular Inner Frame */}
                        <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden flex items-center justify-center border border-white/20">
                            {schoolLogo ? (
                                <img
                                    src={schoolLogo}
                                    alt="School Logo"
                                    className="w-full h-full object-cover rounded-full"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                    }}
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white">
                                    <Sparkles className="w-7 h-7 text-amber-300 animate-pulse" />
                                </div>
                            )}
                        </div>

                        {/* Pulsating Live Status Indicator Badge */}
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white shadow-sm"></span>
                        </span>
                    </button>

                    {/* Label below the circle image */}
                    <div 
                        onClick={() => setIsOpen(true)}
                        className="px-2.5 py-0.5 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold rounded-full shadow-md tracking-tight border border-white/20 whitespace-nowrap cursor-pointer hover:bg-indigo-900 hover:scale-105 active:scale-95 transition-all"
                    >
                        My School AI
                    </div>
                </div>
            )}

            {/* Chat Box Modal */}
            {isOpen && (
                <div className="flex flex-col w-[390px] sm:w-[450px] h-[620px] max-h-[86vh] bg-white rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 p-[2px] flex items-center justify-center shadow-inner border border-white/25 overflow-hidden">
                                {schoolLogo ? (
                                    <img src={schoolLogo} alt="School Logo" className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <Bot className="w-5 h-5 text-white" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-[15px] tracking-tight text-white">{aiSettings.botName || 'My School AI'}</h3>
                                    <span className="text-[10.5px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        Live
                                    </span>
                                </div>
                                <p className="text-[11.5px] text-slate-300 font-medium">
                                    {aiSettings.apiKey ? '✨ Google Gemini AI Connected' : '⚡ 100% Free Instant Engine'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={refreshContext}
                                disabled={isRefreshingContext}
                                title="Refresh School Live Data"
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshingContext ? 'animate-spin text-amber-400' : ''}`} />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Quick Suggestion Chips (Clean & No Ugly Scrollbars) */}
                    <div className="px-3.5 py-2 bg-slate-50/90 border-b border-slate-200/70 flex items-center gap-2 overflow-x-auto copilot-chips-scroll">
                        {suggestions.map((s, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSend(s.query)}
                                className="whitespace-nowrap px-3 py-1.5 text-[12px] font-semibold text-slate-700 bg-white hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-full transition-all duration-150 shadow-sm flex items-center gap-1.5 flex-shrink-0 active:scale-95"
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    {/* Messages Container */}
                    <div className="flex-1 p-4 overflow-y-auto bg-gradient-to-b from-slate-50/40 via-white to-slate-50/30 space-y-4">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm overflow-hidden ${
                                    msg.role === 'user' 
                                        ? 'bg-indigo-600 text-white' 
                                        : 'bg-gradient-to-tr from-indigo-500 to-purple-600 text-white'
                                }`}>
                                    {msg.role === 'user' ? (
                                        <User className="w-4 h-4" />
                                    ) : (
                                        schoolLogo ? <img src={schoolLogo} alt="Logo" className="w-full h-full object-cover" /> : <Bot className="w-4 h-4" />
                                    )}
                                </div>

                                <div className={`flex flex-col max-w-[84%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`p-3.5 sm:p-4 rounded-2xl ${
                                        msg.role === 'user'
                                            ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-md'
                                            : 'bg-white border border-slate-200/90 rounded-tl-none shadow-sm'
                                    }`}>
                                        {msg.role === 'user' ? (
                                            <p className="text-[14.5px] font-medium leading-relaxed">{msg.text}</p>
                                        ) : (
                                            <div>{renderFormattedText(msg.text)}</div>
                                        )}
                                    </div>
                                    <span className="text-[10.5px] text-slate-400 font-medium mt-1 px-1">{msg.time}</span>
                                </div>
                            </div>
                        ))}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                                    {schoolLogo ? <img src={schoolLogo} alt="Logo" className="w-full h-full object-cover" /> : <Bot className="w-4 h-4" />}
                                </div>
                                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    <span className="text-[13px] text-slate-600 font-medium ml-1">Thinking & analyzing data...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-slate-200/80">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSend();
                            }}
                            className="flex items-center gap-2"
                        >
                            <button
                                type="button"
                                onClick={toggleVoice}
                                title={isListening ? 'Listening... click to stop' : 'Voice Input (Urdu / English)'}
                                className={`p-2.5 rounded-xl border transition-all ${
                                    isListening
                                        ? 'bg-rose-500 text-white border-rose-600 animate-pulse shadow-md'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                                }`}
                            >
                                {isListening ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
                            </button>

                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Poochiye: Fees, Salary, Results..."
                                className="flex-1 px-3.5 py-2.5 text-[14px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900 placeholder-slate-400 font-medium transition-all"
                            />

                            <button
                                type="submit"
                                disabled={!inputText.trim() || isLoading}
                                className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 flex-shrink-0"
                            >
                                <Send className="w-4.5 h-4.5" />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
