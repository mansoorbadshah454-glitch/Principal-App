import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Search, Send, ArrowLeft, MoreVertical, Phone, Video, MessageSquare, Clock, Check, CheckCheck, Paperclip } from 'lucide-react';
import './Inbox.css'; // We will create this or use inline styles

const Inbox = () => {
    const [schoolId, setSchoolId] = useState(null);
    const [teachers, setTeachers] = useState([]);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSending, setIsSending] = useState(false);

    const messagesEndRef = useRef(null);

    // 1. Resolve School ID First
    useEffect(() => {
        const resolveUser = async () => {
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const data = JSON.parse(manualSession);
                    if (data.schoolId) {
                        setSchoolId(data.schoolId);
                        return;
                    }
                } catch (e) {
                    console.error("[Inbox] Error parsing session:", e);
                }
            }

            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const token = await user.getIdTokenResult();
                        if (token.claims.schoolId) {
                            setSchoolId(token.claims.schoolId);
                        }
                    } catch (e) {
                        console.error("[Inbox] Token err:", e);
                    }
                }
            });
            return () => unsubscribe();
        };
        resolveUser();
    }, []);

    // 2. Fetch Teachers
    useEffect(() => {
        if (!schoolId) return;

        const q = query(collection(db, `schools/${schoolId}/teachers`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();

                // Dashboard logic to check if they are online
                // Get duty status from database
                const dutyStatus = data.isOnDuty || false;
                const lastDutyUpdate = data.lastDutyUpdate;

                // Helper function to check if it's a new day
                const isNewDay = (lastUpdateTimestamp) => {
                    if (!lastUpdateTimestamp) return false;
                    const lastUpdate = lastUpdateTimestamp.toDate ? lastUpdateTimestamp.toDate() : new Date(lastUpdateTimestamp);
                    const now = new Date();
                    const lastDate = new Date(lastUpdate.getFullYear(), lastUpdate.getMonth(), lastUpdate.getDate());
                    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    return currentDate > lastDate;
                };

                const isOff = isNewDay(lastDutyUpdate) || !dutyStatus;

                return {
                    id: doc.id,
                    name: data.name,
                    class: Array.isArray(data.assignedClasses) && data.assignedClasses.length > 0
                        ? data.assignedClasses[0]
                        : (data.assignedClasses || 'Unassigned'),
                    status: isOff ? 'off' : 'on',
                    ...data
                };
            });
            setTeachers(list);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // 3. Fetch Messages for Selected Teacher
    useEffect(() => {
        if (!schoolId || !selectedTeacher) return;

        // In a real app, you might want a thread ID or query by both sender/receiver
        // Here we query all messages and filter in client (or use a better query if indexed)
        const q = query(
            collection(db, `schools/${schoolId}/messages`),
            orderBy("timestamp", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // A message matches if it's from the principal to the teacher, OR from that teacher to the principal
                if (
                    (data.from === 'principal' && data.to === selectedTeacher.id) ||
                    (data.from === selectedTeacher.id && data.to === 'principal') ||
                    (data.type === 'teacher-reply' && data.from === selectedTeacher.id) ||
                    (data.type === 'principal-broadcast' && data.to === 'all')
                ) {
                    msgs.push({ id: doc.id, ...data });
                }
            });

            setMessages(msgs);
            scrollToBottom();
        });

        return () => unsubscribe();
    }, [schoolId, selectedTeacher]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!messageText.trim() || !schoolId || !selectedTeacher || isSending) return;

        setIsSending(true);
        try {
            await addDoc(collection(db, `schools/${schoolId}/messages`), {
                text: messageText,
                from: 'principal',
                fromName: 'Principal',
                to: selectedTeacher.id,
                toName: selectedTeacher.name,
                timestamp: serverTimestamp(),
                read: false,
                type: 'direct-message'
            });
            setMessageText('');
            scrollToBottom();
        } catch (error) {
            console.error("Error sending message:", error);
            alert("Failed to send message: " + error.message);
        } finally {
            setIsSending(false);
        }
    };

    const filteredTeachers = teachers.filter(t =>
        t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.class?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatMessageTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatMessageDate = (timestamp) => {
        if (!timestamp) return 'Today';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <div className="inbox-container">
            {/* Sidebar Pane (Teachers List) */}
            <div className={`inbox-sidebar ${selectedTeacher ? 'mobile-hidden' : ''}`}>
                <div className="inbox-sidebar-header">
                    <h2>Messages</h2>
                    <div className="inbox-search">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search teachers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="inbox-teacher-list custom-scrollbar">
                    {filteredTeachers.map(teacher => (
                        <div
                            key={teacher.id}
                            className={`inbox-teacher-item ${selectedTeacher?.id === teacher.id ? 'active' : ''}`}
                            onClick={() => setSelectedTeacher(teacher)}
                        >
                            <div className="teacher-avatar">
                                {teacher.name ? teacher.name.charAt(0).toUpperCase() : 'T'}
                                {teacher.status === 'on' && <span className="status-indicator online"></span>}
                            </div>
                            <div className="teacher-info">
                                <div className="teacher-name-row">
                                    <span className="teacher-name">{teacher.name || 'Unnamed Teacher'}</span>
                                    {/* Optional: Show last message time here if available in data model */}
                                </div>
                                <span className="teacher-class">{teacher.class || 'No Class'}</span>
                            </div>
                        </div>
                    ))}
                    {filteredTeachers.length === 0 && (
                        <div className="no-results">No teachers found.</div>
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`inbox-main ${!selectedTeacher ? 'mobile-hidden' : ''}`}>
                {selectedTeacher ? (
                    <>
                        {/* Chat Header */}
                        <div className="chat-header">
                            <div className="chat-header-left">
                                <button className="back-btn mobile-only" onClick={() => setSelectedTeacher(null)}>
                                    <ArrowLeft size={20} />
                                </button>
                                <div className="teacher-avatar">
                                    {selectedTeacher.name ? selectedTeacher.name.charAt(0).toUpperCase() : 'T'}
                                </div>
                                <div className="chat-header-info">
                                    <h3>{selectedTeacher.name}</h3>
                                    <span>{selectedTeacher.class} {selectedTeacher.status === 'on' ? '• Online' : ''}</span>
                                </div>
                            </div>
                            <div className="chat-header-actions">
                                <button title="Call" className="icon-btn"><Phone size={18} /></button>
                                <button title="Video Call" className="icon-btn"><Video size={18} /></button>
                                <button title="More" className="icon-btn"><MoreVertical size={18} /></button>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="chat-messages custom-scrollbar">
                            {messages.length === 0 ? (
                                <div className="empty-chat-state">
                                    <MessageSquare size={48} color="rgba(99, 102, 241, 0.5)" />
                                    <p>No messages yet.</p>
                                    <span>Send a message to start the conversation with {selectedTeacher.name}.</span>
                                </div>
                            ) : (
                                messages.map((msg, index) => {
                                    const isPrincipal = msg.from === 'principal';
                                    const showDateSeparator = index === 0 ||
                                        formatMessageDate(msg.timestamp) !== formatMessageDate(messages[index - 1]?.timestamp);

                                    return (
                                        <React.Fragment key={msg.id}>
                                            {showDateSeparator && (
                                                <div className="date-separator">
                                                    <span>{formatMessageDate(msg.timestamp)}</span>
                                                </div>
                                            )}
                                            <div className={`message-wrapper ${isPrincipal ? 'sent' : 'received'}`}>
                                                <div className="message-bubble">
                                                    <p className="message-text">{msg.text || msg.message}</p>

                                                    {msg.attachment && (
                                                        <a href={msg.attachment.url} target="_blank" rel="noopener noreferrer" className="message-attachment">
                                                            <Paperclip size={14} /> Attachment
                                                        </a>
                                                    )}

                                                    <div className="message-meta">
                                                        <span className="message-time">{formatMessageTime(msg.timestamp)}</span>
                                                        {isPrincipal && (
                                                            <span className="message-status">
                                                                <Check size={12} /> {/* Using single check for sent, double for read in real app */}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Input */}
                        <form className="chat-input-area" onSubmit={handleSendMessage}>
                            <input
                                type="text"
                                placeholder="Type a message..."
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                className="chat-input"
                            />
                            <button
                                type="submit"
                                className="send-btn"
                                disabled={!messageText.trim() || isSending}
                            >
                                <Send size={20} />
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="no-chat-selected">
                        <div className="illustration-wrapper">
                            <MessageSquare size={64} className="illustration-icon" />
                        </div>
                        <h3>Your Messages</h3>
                        <p>Select a teacher from the sidebar to view conversations.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Inbox;
