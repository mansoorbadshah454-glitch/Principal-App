import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import {
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject // Added
} from 'firebase/storage';
import { Search, Send, ArrowLeft, MoreVertical, Phone, Video, MessageSquare, Clock, Check, CheckCheck, Paperclip, Plus } from 'lucide-react';
import './Inbox.css'; // We will create this or use inline styles

const Inbox = () => {
    const [schoolId, setSchoolId] = useState(null);
    const [teachers, setTeachers] = useState([]);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [showMenu, setShowMenu] = useState(false);

    const messagesEndRef = useRef(null);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

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

    // 2.5 Fetch Global Unread Counts
    useEffect(() => {
        if (!schoolId) return;

        const q = query(
            collection(db, `schools/${schoolId}/messages`),
            where('read', '==', false),
            where('to', 'in', ['principal', 'admin']) // Messages to principal or admin
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const counts = {};
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const senderId = data.fromId || data.from;
                if (senderId && senderId !== 'principal') {
                    counts[senderId] = (counts[senderId] || 0) + 1;
                }
            });
            setUnreadCounts(counts);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // 3. Fetch Messages for Selected Teacher
    useEffect(() => {
        if (!schoolId || !selectedTeacher) return;

        const q = query(
            collection(db, `schools/${schoolId}/messages`),
            orderBy("timestamp", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                // Improved Filtering:
                // 1. From Principal to this Teacher
                // 2. From this Teacher to Principal
                // 3. Teacher reply to Principal (using formId/toId)
                const isFromMe = data.from === 'principal' && data.to === selectedTeacher.id;
                const isToMe = (data.from === selectedTeacher.id || data.fromId === selectedTeacher.id) &&
                    (data.to === 'principal' || data.toId === 'admin'); // Assuming 'admin' is the generic toId for principal
                const isBroadcast = data.type === 'principal-broadcast' && data.to === 'all';

                if (isFromMe || isToMe || isBroadcast) {
                    msgs.push({ id: docSnap.id, ...data });

                    // Mark as read if it's incoming and unread
                    if (isToMe && data.read === false) {
                        updateDoc(doc(db, `schools/${schoolId}/messages`, docSnap.id), {
                            read: true
                        }).catch(err => console.error("Error marking as read:", err));
                    }
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

    // 4. Handle Clear History
    const handleClearHistory = async () => {
        if (!schoolId || !selectedTeacher || messages.length === 0) return;

        if (window.confirm(`Are you sure you want to clear the entire chat history with ${selectedTeacher.name}? This action cannot be undone.`)) {
            try {
                // Process deletions
                for (const msg of messages) {
                    // 1. Delete matching storage file if it exists
                    if (msg.attachment && msg.attachment.fullPath) {
                        try {
                            const fileRef = storageRef(storage, msg.attachment.fullPath);
                            await deleteObject(fileRef);
                        } catch (err) {
                            console.warn("Storage file delete failed (may not exist):", err);
                        }
                    }
                    // 2. Delete Firestore document
                    await deleteDoc(doc(db, `schools/${schoolId}/messages`, msg.id));
                }

                setShowMenu(false);
            } catch (error) {
                console.error("Error clearing history:", error);
                alert("Failed to clear history: " + error.message);
            }
        }
    };

    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        if (!messageText.trim() || !schoolId || !selectedTeacher || isSending) return;

        setIsSending(true);
        try {
            await addDoc(collection(db, `schools/${schoolId}/messages`), {
                text: messageText.trim(),
                from: 'principal',
                fromId: 'principal',
                fromName: 'Principal',
                to: selectedTeacher.id,
                toId: selectedTeacher.id,
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

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !schoolId || !selectedTeacher) return;

        setIsSending(true);
        try {
            const path = `schools/${schoolId}/messages/attachments/${Date.now()}_${file.name}`;
            const fileRef = storageRef(storage, path);
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);

            await addDoc(collection(db, `schools/${schoolId}/messages`), {
                text: `Sent an attachment: ${file.name}`,
                from: 'principal',
                fromId: 'principal',
                fromName: 'Principal',
                to: selectedTeacher.id,
                toId: selectedTeacher.id,
                toName: selectedTeacher.name,
                timestamp: serverTimestamp(),
                read: false,
                type: 'direct-message',
                attachment: {
                    url: url,
                    fullPath: path, // Added for easy deletion
                    name: file.name,
                    type: file.type.split('/')[1] || 'file'
                },
            });
            scrollToBottom();
        } catch (error) {
            console.error("Error uploading file:", error);
            alert("Failed to upload: " + error.message);
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
                                    {unreadCounts[teacher.id] > 0 && (
                                        <span className="unread-badge">{unreadCounts[teacher.id]}</span>
                                    )}
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
                            <div className="chat-header-actions" ref={menuRef} style={{ position: 'relative' }}>
                                <button
                                    title="Menu"
                                    className="icon-btn"
                                    onClick={() => setShowMenu(!showMenu)}
                                >
                                    <MoreVertical size={18} />
                                </button>

                                {showMenu && (
                                    <div className="action-dropdown" style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: '0',
                                        marginTop: '0.5rem',
                                        background: 'var(--wa-search-bg)',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                                        zIndex: 50,
                                        width: '180px',
                                        overflow: 'hidden'
                                    }}>
                                        <button
                                            onClick={handleClearHistory}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem 1rem',
                                                border: 'none',
                                                background: 'transparent',
                                                color: '#ef4444',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                fontSize: '0.95rem',
                                                transition: 'background 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                            }}
                                            onMouseEnter={(e) => e.target.style.background = 'var(--wa-hover)'}
                                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                        >
                                            Clear chat history
                                        </button>
                                    </div>
                                )}
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
                                                        <div className="attachment-container">
                                                            {['jpg', 'jpeg', 'png', 'webp'].includes(msg.attachment.type?.toLowerCase()) ? (
                                                                <img
                                                                    src={msg.attachment.url}
                                                                    alt={msg.attachment.name}
                                                                    className="media-preview"
                                                                    onClick={() => window.open(msg.attachment.url, '_blank')}
                                                                    style={{
                                                                        maxWidth: '100%',
                                                                        borderRadius: '8px',
                                                                        cursor: 'pointer',
                                                                        marginTop: '0.5rem',
                                                                        display: 'block'
                                                                    }}
                                                                />
                                                            ) : (
                                                                <a href={msg.attachment.url} target="_blank" rel="noopener noreferrer" className="message-attachment">
                                                                    <Paperclip size={14} /> {msg.attachment.name}
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="message-meta">
                                                        <span className="message-time">{formatMessageTime(msg.timestamp)}</span>
                                                        {isPrincipal && (
                                                            <span className="message-status">
                                                                {msg.read ? (
                                                                    <CheckCheck size={14} color="#3b82f6" />
                                                                ) : (
                                                                    <CheckCheck size={14} color="gray" />
                                                                )}
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
                        <div className="chat-input-area">
                            <label className="attach-btn" title="Attach file">
                                <Plus size={20} />
                                <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
                            </label>
                            <form className="chat-input-wrapper" onSubmit={handleSendMessage} style={{ flex: 1, display: 'flex' }}>
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
                        </div>
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
