import React, { useState, useEffect, useRef } from 'react';
import { 
    Sparkles, MessageSquare, X, Send, Bot, User, RefreshCw, 
    ChevronDown, Volume2, VolumeX, Mic, MicOff, Check, AlertCircle, 
    ArrowUpRight, ShieldCheck, Zap, HelpCircle, CheckCircle2, GraduationCap,
    TrendingUp, Award, DollarSign, Users, Square, Play, Pause, PlusCircle, RotateCcw
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getLiveSchoolContext } from './aiDataEngine';
import { askGeminiAssistant } from './geminiService';

const createWelcomeMessage = () => ({
    id: 'welcome-' + Date.now(),
    role: 'assistant',
    text: `Salam Principal Sir! 👋 Main aapka **School AI Executive Copilot** hoon.\n\nAap mujh se school ka 100% verified live data foran pooch sakte hain:\n• **Kisi student ki fee paid hai ya pending arrears kitne hain?**\n• **Student ke exam marks aur terms result (1st term, final exam)?**\n• **Is saal ka profit pichlay saal se zyada tha ya kam?**\n• **Is saal kitne new admissions aaye aur kitne students left (SLC) hue?**\n• **Aaj cashier ne kitni fee collect ki?**\n\nMain aapki kya madad kar sakta hoon?`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
});

export default function PrincipalAiAssistant({ schoolId }) {
    const [isOpen, setIsOpen] = useState(false);
    const [schoolLogo, setSchoolLogo] = useState('');
    const [messages, setMessages] = useState(() => [createWelcomeMessage()]);
    
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [schoolContext, setSchoolContext] = useState(null);
    const [isRefreshingContext, setIsRefreshingContext] = useState(false);
    const [aiSettings, setAiSettings] = useState({ apiKey: '', botName: 'Principal AI Copilot' });
    const [isListening, setIsListening] = useState(false);
    
    // Voice Output (Speech Synthesis) states
    const [speakingMsgId, setSpeakingMsgId] = useState(null);
    const [autoSpeak, setAutoSpeak] = useState(false);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const isListeningRef = useRef(false);
    const accumulatedTextRef = useRef('');
    const silenceTimerRef = useRef(null);
    const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

    // New Chat / Fresh Conversation Handler
    const handleNewChat = () => {
        if (synthRef.current) {
            synthRef.current.cancel();
            setSpeakingMsgId(null);
        }
        if (isListeningRef.current && recognitionRef.current) {
            isListeningRef.current = false;
            try { recognitionRef.current.stop(); } catch (e) {}
            setIsListening(false);
        }
        setMessages([createWelcomeMessage()]);
        setInputText('');
    };

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

    // 4. Clean Text for Natural Conversational Speech Synthesis (Human-sounding speech)
    const cleanTextForSpeech = (rawText) => {
        if (!rawText) return '';
        
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        let text = rawText;

        // Convert ISO dates (YYYY-MM-DD) to spoken words "DD Month YYYY"
        text = text.replace(/(\d{4})-(\d{2})-(\d{2})/g, (match, y, m, d) => {
            const mIdx = parseInt(m, 10) - 1;
            const mName = monthNames[mIdx] || m;
            return `${parseInt(d, 10)} ${mName} ${y}`;
        });

        // Convert date numbers like 26/09/2026 to "26 September 2026"
        text = text.replace(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g, (match, d, m, y) => {
            const mIdx = parseInt(m, 10) - 1;
            const mName = monthNames[mIdx] || m;
            return `${d} ${mName} ${y}`;
        });

        return text
            .replace(/\*\*(.*?)\*\*/g, '$1') // Strip bold
            .replace(/###?\s*/g, '') // Strip headings
            .replace(/[•*–—\-]\s*/g, ' ') // Strip bullets
            .replace(/Rs\.\s*/gi, 'Rupees ') // Natural Currency
            .replace(/PKR\s*/gi, 'Rupees ')
            .replace(/(\d+)%/g, '$1 percent')
            .replace(/(\d+)\/(\d+)/g, '$1 out of $2')
            .replace(/SLC/g, 'School Leaving Certificate')
            .replace(/DMC/g, 'Result Card')
            .replace(/[\u{1F600}-\u{1F6FF}|[\u{2600}-\u{26FF}]/gu, '') // Strip emojis
            .replace(/[\[\]\(\)\{\}]/g, ' ') // Strip brackets
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .trim();
    };

    // 5. Speech Synthesis (Text-to-Speech Voice Response)
    const speakMessage = (text, msgId) => {
        if (!synthRef.current) {
            alert('Voice audio is not supported in this browser.');
            return;
        }

        if (speakingMsgId === msgId) {
            synthRef.current.cancel();
            setSpeakingMsgId(null);
            return;
        }

        synthRef.current.cancel(); // Stop any ongoing speech
        const speechText = cleanTextForSpeech(text);
        if (!speechText) return;

        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // Try to pick Urdu / Hindi / South-Asian friendly English voice if available
        const voices = synthRef.current.getVoices?.() || [];
        const preferredVoice = voices.find(v => v.lang.includes('ur') || v.lang.includes('hi') || v.lang.includes('en-IN') || v.lang.includes('en-PK')) || voices[0];
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.onstart = () => setSpeakingMsgId(msgId);
        utterance.onend = () => setSpeakingMsgId(null);
        utterance.onerror = () => setSpeakingMsgId(null);

        synthRef.current.speak(utterance);
    };

    // Stop speaking & listening when modal closes
    useEffect(() => {
        if (!isOpen) {
            if (synthRef.current) {
                synthRef.current.cancel();
                setSpeakingMsgId(null);
            }
            if (isListeningRef.current && recognitionRef.current) {
                isListeningRef.current = false;
                try { recognitionRef.current.stop(); } catch (e) {}
                setIsListening(false);
            }
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
            }
        }
    }, [isOpen]);

    // 6. Web Speech Recognition Setup (Continuous Streaming Voice Input)
    useEffect(() => {
        if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            
            // Critical: Continuous mode keeps mic active through pauses & longer sentences
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'ur-PK';

            recognition.onstart = () => {
                isListeningRef.current = true;
                setIsListening(true);
            };

            recognition.onresult = (event) => {
                // Clear any existing silence countdown whenever user speaks a word
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                }

                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const trans = event.results[i][0]?.transcript || '';
                    if (event.results[i].isFinal) {
                        accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + trans.trim();
                    } else {
                        interimTranscript += trans;
                    }
                }

                const liveCombined = (accumulatedTextRef.current + ' ' + interimTranscript).trim();
                if (liveCombined) {
                    setInputText(liveCombined);
                }

                // Generous silence buffer (8 seconds of absolute silence before auto-stopping)
                silenceTimerRef.current = setTimeout(() => {
                    if (isListeningRef.current && recognitionRef.current) {
                        isListeningRef.current = false;
                        try { recognitionRef.current.stop(); } catch (e) {}
                        setIsListening(false);
                    }
                }, 8000);
            };

            recognition.onerror = (event) => {
                console.warn('[AI Assistant] Speech recognition event:', event.error);
                if (event.error !== 'no-speech') {
                    isListeningRef.current = false;
                    setIsListening(false);
                }
            };

            recognition.onend = () => {
                // If user is still speaking and browser ended early, seamlessly keep session alive
                if (isListeningRef.current) {
                    try {
                        recognition.start();
                    } catch (e) {
                        isListeningRef.current = false;
                        setIsListening(false);
                    }
                } else {
                    setIsListening(false);
                }
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const toggleVoice = () => {
        if (!recognitionRef.current) {
            alert('Voice input is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        if (isListening) {
            // Stop listening manually
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            isListeningRef.current = false;
            try { recognitionRef.current.stop(); } catch (e) {}
            setIsListening(false);
        } else {
            // Stop any ongoing voice output first
            if (synthRef.current) {
                synthRef.current.cancel();
                setSpeakingMsgId(null);
            }

            accumulatedTextRef.current = inputText ? inputText.trim() : '';
            try {
                recognitionRef.current.start();
                isListeningRef.current = true;
                setIsListening(true);
            } catch (e) {
                console.warn('Voice start warning (already active):', e);
                isListeningRef.current = true;
                setIsListening(true);
            }
        }
    };

    // 7. Handle Message Send
    const handleSend = async (customPrompt) => {
        // Stop active recording if sending
        if (isListeningRef.current && recognitionRef.current) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            isListeningRef.current = false;
            try { recognitionRef.current.stop(); } catch (e) {}
            setIsListening(false);
        }

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

            const newMsgId = (Date.now() + 1).toString();
            const assistantMsg = {
                id: newMsgId,
                role: 'assistant',
                text: response.text,
                source: response.source,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setMessages(prev => [...prev, assistantMsg]);

            // Auto-speak if toggled on
            if (autoSpeak) {
                setTimeout(() => {
                    speakMessage(response.text, newMsgId);
                }, 300);
            }
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

    // Quick suggestion chips covering all essential Principal queries
    const suggestions = [
        { label: '📊 Aaj ki Fees?', query: 'Aaj counter par kitni fee collect hui hai?' },
        { label: '📈 Profit vs Pichla Saal?', query: 'Is saal school ka profit pichlay saal se zyada tha ya kam? Aur is month ka batao.' },
        { label: '🆘 Help & MAI TECH Support', query: 'School software help and MAI TECH support contact details batao' },
        { label: '💵 Cashier Collection', query: 'Cashier ne aaj kitni fee submit ki hai aur is month kitni ki hai?' },
        { label: '💰 Teachers Salary', query: 'Is month kitne teachers ki salary pay ho chuki hai aur kitni baki hai?' },
        { label: '👥 Aaj ki Attendance', query: 'Aaj ki student attendance rate kya hai?' },
        { label: '🏫 School Strength', query: 'School mein total kitne active students aur classes hain?' }
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

            // Bullet line
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
            <style>{`
                .copilot-chips-scroll::-webkit-scrollbar {
                    display: none !important;
                }
                .copilot-chips-scroll {
                    -ms-overflow-style: none !important;
                    scrollbar-width: none !important;
                }
            `}</style>

            {/* Circular Floating Trigger Button with School Logo & Label */}
            {!isOpen && (
                <div className="flex flex-col items-center gap-1.5 select-none">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="relative group flex items-center justify-center w-15 h-15 sm:w-16 sm:h-16 rounded-full p-[3px] bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 shadow-[0_10px_25px_rgba(79,70,229,0.45)] hover:shadow-[0_15px_35px_rgba(79,70,229,0.65)] hover:scale-108 active:scale-95 transition-all duration-300 border border-white/40 cursor-pointer"
                        title="Open My School AI Copilot"
                    >
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
                <div className="flex flex-col w-[390px] sm:w-[460px] h-[640px] max-h-[88vh] bg-white rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
                                        Live Data
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-300 font-medium">
                                    {aiSettings.apiKey || import.meta.env?.VITE_GEMINI_API_KEY ? '✨ Google Gemini AI Connected' : '⚡ 100% Free Instant Engine'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            {/* New Chat Button */}
                            <button
                                onClick={handleNewChat}
                                title="Start New Fresh Chat (Nayi Chat Shuru Karein)"
                                className="flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-bold bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-lg transition-all border border-indigo-400/40 shadow-sm active:scale-95 cursor-pointer"
                            >
                                <PlusCircle className="w-3.5 h-3.5 text-indigo-200" />
                                <span>New Chat</span>
                            </button>

                            {/* Auto Voice Speak Toggle */}
                            <button
                                onClick={() => setAutoSpeak(!autoSpeak)}
                                title={autoSpeak ? 'Auto Voice Speak: ON (Click to turn off)' : 'Auto Voice Speak: OFF (Click to turn on)'}
                                className={`p-1.5 rounded-lg transition-all ${autoSpeak ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-white/30' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
                            >
                                {autoSpeak ? <Volume2 className="w-4 h-4 text-emerald-300 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
                            </button>

                            {/* Refresh Context Button */}
                            <button
                                onClick={refreshContext}
                                disabled={isRefreshingContext}
                                title="Refresh School Live Data"
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshingContext ? 'animate-spin text-amber-400' : ''}`} />
                            </button>
                            
                            {/* Close Modal */}
                            <button
                                onClick={() => setIsOpen(false)}
                                title="Close Assistant"
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Quick Suggestion Chips */}
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
                        {messages.map((msg) => {
                            const isSpeakingThis = speakingMsgId === msg.id;

                            return (
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

                                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`p-3.5 sm:p-4 rounded-2xl relative group ${
                                            msg.role === 'user'
                                                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-md'
                                                : 'bg-white border border-slate-200/90 rounded-tl-none shadow-sm'
                                        }`}>
                                            {msg.role === 'user' ? (
                                                <p className="text-[14.5px] font-medium leading-relaxed">{msg.text}</p>
                                            ) : (
                                                <div>
                                                    {renderFormattedText(msg.text)}

                                                    {/* Voice Read Aloud Button on Assistant message */}
                                                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                                                        <button
                                                            onClick={() => speakMessage(msg.text, msg.id)}
                                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold transition-all ${
                                                                isSpeakingThis
                                                                    ? 'bg-rose-50 text-rose-600 border border-rose-200 animate-pulse'
                                                                    : 'hover:bg-indigo-50 hover:text-indigo-600 text-slate-500'
                                                            }`}
                                                            title={isSpeakingThis ? 'Stop Speaking' : 'Read Aloud (Voice)'}
                                                        >
                                                            {isSpeakingThis ? (
                                                                <>
                                                                    <Square className="w-3.5 h-3.5 fill-rose-600" />
                                                                    <span>Stop Voice</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Volume2 className="w-3.5 h-3.5" />
                                                                    <span>Listen Voice</span>
                                                                </>
                                                            )}
                                                        </button>

                                                        <span className="text-[10.5px] text-slate-400">{msg.time}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {msg.role === 'user' && (
                                            <span className="text-[10.5px] text-slate-400 font-medium mt-1 px-1">{msg.time}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

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
                                    <span className="text-[13px] text-slate-600 font-medium ml-1">Analyzing school database...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-slate-200/80">
                        {/* Voice Listening Active Banner */}
                        {isListening && (
                            <div className="mb-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-700 animate-in fade-in slide-in-from-bottom-2 duration-150 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                                    </span>
                                    <span className="text-[12px] font-bold">🎙️ Sun raha hoon... (Aap bolte rahein)</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleVoice}
                                    className="text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-0.5 rounded-lg transition-all active:scale-95 cursor-pointer shadow-xs"
                                >
                                    Rokiye / Done
                                </button>
                            </div>
                        )}

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
                                title={isListening ? 'Listening... click to stop' : 'Voice Input (Speak your question)'}
                                className={`p-2.5 rounded-xl border transition-all ${
                                    isListening
                                        ? 'bg-rose-500 text-white border-rose-600 animate-pulse shadow-md ring-2 ring-rose-200'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                                }`}
                            >
                                {isListening ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
                            </button>

                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Student fee dues, exam marks, profit comparison..."
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
