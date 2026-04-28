import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, getDocs, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';
import {
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject // Added
} from 'firebase/storage';
import { Search, Send, ArrowLeft, MoreVertical, Phone, Video, MessageSquare, Clock, Check, CheckCheck, Paperclip, Plus } from 'lucide-react';
import './Inbox.css'; // We will create this or use inline styles
import CachedImage from '../components/CachedImage';

const Inbox = () => {
    const [schoolId, setSchoolId] = useState(null);
    const [currentUserId, setCurrentUserId] = useState('principal');
    const [currentUserRole, setCurrentUserRole] = useState('principal');
    const [currentUserName, setCurrentUserName] = useState('Principal');

    const [teachers, setTeachers] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [principalContact, setPrincipalContact] = useState([]); // Array to map alongside teachers

    // messagingId is 'principal' for the principal, and UID for admins.
    // This matches the Teacher App's expectations.
    const messagingId = (currentUserRole === 'principal') ? 'principal' : currentUserId;

    const [selectedTeacher, setSelectedTeacher] = useState(null); // Now represents any selected contact
    const [messages, setMessages] = useState([]);
    const [legacyMessages, setLegacyMessages] = useState([]);
    const [messageText, setMessageText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [showMenu, setShowMenu] = useState(false);
    const [activeTab, setActiveTab] = useState('list'); // 'list' | 'group'

    // New state for file upload confirmation
    const [selectedFileForUpload, setSelectedFileForUpload] = useState(null);
    const [fileCaption, setFileCaption] = useState('');

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
                        setCurrentUserRole((data.role || 'principal').toLowerCase());
                        setCurrentUserId(data.uid || 'principal');
                        setCurrentUserName(data.displayName || data.name || (data.role === 'school Admin' ? 'Admin' : 'Principal'));
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
                            setCurrentUserRole((token.claims.role || 'principal').toLowerCase());
                            setCurrentUserId(user.uid);
                            setCurrentUserName(user.displayName || (token.claims.role === 'school Admin' ? 'Admin' : 'Principal'));
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
                    role: 'Teacher',
                    ...data
                };
            });
            setTeachers(list);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // 2.2 Fetch Admins (If logged in as Principal or Admin)
    useEffect(() => {
        if (!schoolId) return;

        // If I am an Admin, I should see the Principal, not other Admins (or maybe other admins too? Decided to just show Principal and Teachers based on requirements)
        if (currentUserRole === 'school Admin') {
            setPrincipalContact([{
                id: 'principal',
                name: 'Principal',
                class: 'School Principal',
                status: 'on',
                role: 'Principal'
            }]);

            // Still fetch other admins to chat with them if needed? The user requested to msg Teachers and Principal.
            const q = query(collection(db, `schools/${schoolId}/admin_users`), where('role', '==', 'school Admin'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const list = snapshot.docs
                    .filter(doc => doc.id !== currentUserId)
                    .map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            name: data.displayName || data.name || 'Unknown Admin',
                            class: 'School Admin',
                            status: 'on',
                            role: 'Admin',
                            ...data
                        };
                    });
                setAdmins(list);
            });
            return () => unsubscribe();
        } else {
            // I am the Principal, fetch all Admins
            const q = query(collection(db, `schools/${schoolId}/admin_users`), where('role', '==', 'school Admin'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const list = snapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            name: data.displayName || data.name || 'Unknown Admin',
                            class: 'School Admin',
                            status: 'on',
                            role: 'Admin',
                            ...data
                        };
                    });
                setAdmins(list);
            });
            return () => unsubscribe();
        }
    }, [schoolId, currentUserRole, currentUserId]);

    // 2.5 Fetch Global Unread Counts
    useEffect(() => {
        if (!schoolId || !messagingId) return;

        const q = query(
            collection(db, `schools/${schoolId}/messages`),
            where('participants', 'array-contains', messagingId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const counts = {};
            snapshot.forEach(docSnap => {
                const data = docSnap.data();

                // Only count unread messages
                if (data.read === true) return;

                const senderId = data.fromId || data.from;
                if (senderId && senderId !== messagingId) {
                    // Check if it's meant for me (either via UID or alias)
                    if (data.toId === messagingId || data.to === messagingId || data.toId === currentUserId) {
                        counts[senderId] = (counts[senderId] || 0) + 1;
                    }
                }
            });
            setUnreadCounts(counts);
        });

        return () => unsubscribe();
    }, [schoolId, messagingId, currentUserId]);

    // 2.7 One-Time Sweep for Old Stuck Notifications
    useEffect(() => {
        if (!schoolId) return;
        const sweepOldMessages = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/messages`));
                const snap = await getDocsFast(q);
                const batch = writeBatch(db);
                let count = 0;
                snap.forEach(docSnap => {
                    if (docSnap.data().read === false) {
                        batch.update(docSnap.ref, { read: true });
                        count++;
                    }
                });
                if (count > 0) {
                    await batch.commit();
                    console.log(`[Sweep] Cleared ${count} stuck unread messages.`);
                }
            } catch (e) {
                console.error("[Sweep Error]", e);
            }
        };
        sweepOldMessages();
    }, [schoolId]);

    // 3. Fetch Messages for Selected Contact
    useEffect(() => {
        if (!schoolId || !selectedTeacher || !messagingId) return;

        // Optimized query using participants array (uses alias if principal)
        const qOptimized = query(
            collection(db, `schools/${schoolId}/messages`),
            where('participants', 'array-contains', messagingId)
        );

        // Legacy query for old messages (Fallback)
        // Note: This is less efficient but necessary for older data.
        // It fetches all messages for the school. We'll filter heavily.
        const qLegacy = query(
            collection(db, `schools/${schoolId}/messages`)
        );

        const unsubscribeOptimized = onSnapshot(qOptimized, (snapshot) => {
            const msgs = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();

                const isGroupChat = selectedTeacher.id === 'all_teachers';
                let isRelevant = false;

                if (isGroupChat) {
                    isRelevant = data.toId === 'all_teachers' || data.type === 'principal-broadcast';
                } else {
                    const isFromMe = (data.fromId === messagingId || data.fromId === currentUserId || data.from === messagingId) && (data.toId === selectedTeacher.id || data.to === selectedTeacher.id);
                    const isToMe = (data.fromId === selectedTeacher.id || data.from === selectedTeacher.id) && (data.toId === messagingId || data.toId === currentUserId || data.to === messagingId);
                    isRelevant = isFromMe || isToMe;

                    if (isToMe && data.read === false) {
                        updateDoc(doc(db, `schools/${schoolId}/messages`, docSnap.id), {
                            read: true
                        }).catch(err => console.error("Error marking as read:", err));
                    }
                }

                if (isRelevant) {
                    msgs.push({ id: docSnap.id, ...data });
                }
            });
            setMessages(msgs);
            scrollToBottom();
        });

        // Legacy listener for older messages without participants field
        const unsubscribeLegacy = onSnapshot(qLegacy, (snapshot) => {
            const legacyMsgs = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.participants) return; // Skip optimized messages handled by other listener

                const isGroupChat = selectedTeacher.id === 'all_teachers';
                let isRelevant = false;

                if (isGroupChat) {
                    isRelevant = data.toId === 'all_teachers' || data.type === 'principal-broadcast';
                } else {
                    const isFromMe = (data.fromId === messagingId || data.fromId === currentUserId || data.from === messagingId) && (data.toId === selectedTeacher.id || data.to === selectedTeacher.id);
                    const isToMe = (data.fromId === selectedTeacher.id || data.from === selectedTeacher.id) && (data.toId === messagingId || data.toId === currentUserId || data.to === messagingId);
                    isRelevant = isFromMe || isToMe;
                }

                if (isRelevant) {
                    legacyMsgs.push({ id: docSnap.id, ...data });
                }
            });
            setLegacyMessages(legacyMsgs);
        });

        return () => {
            unsubscribeOptimized();
            unsubscribeLegacy();
        };
    }, [schoolId, selectedTeacher, messagingId, currentUserId]);

    // Merge messages from both listeners for display
    const mergedMessages = useMemo(() => {
        const all = [...messages, ...legacyMessages];
        return all.sort((a, b) => {
            const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : Date.now());
            const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : Date.now());
            return timeA - timeB;
        });
    }, [messages, legacyMessages]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    // 4. Handle Clear History
    const handleClearHistory = async () => {
        if (!schoolId || !selectedTeacher || mergedMessages.length === 0) return;

        if (window.confirm(`Are you sure you want to clear the entire chat history with ${selectedTeacher.name}? This action cannot be undone.`)) {
            try {
                // Process deletions
                for (const msg of mergedMessages) {
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
            const isGroup = selectedTeacher.id === 'all_teachers';
            const participantsList = isGroup
                ? [messagingId, ...teachers.map(t => t.id)]
                : [messagingId, selectedTeacher.id];

            await addDoc(collection(db, `schools/${schoolId}/messages`), {
                text: messageText.trim(),
                from: currentUserRole === 'principal' ? 'principal' : 'admin',
                fromId: messagingId,
                fromName: currentUserName,
                fromRole: currentUserRole,
                to: isGroup ? 'all' : (selectedTeacher.role === 'Teacher' ? 'teacher' : (selectedTeacher.role === 'Principal' ? 'principal' : 'admin')),
                toId: selectedTeacher.id,
                toName: selectedTeacher.name,
                toRole: isGroup ? 'group' : (selectedTeacher.role === 'Teacher' ? 'teacher' : (selectedTeacher.role === 'Principal' ? 'principal' : 'school Admin')),
                participants: participantsList,
                timestamp: serverTimestamp(),
                read: false,
                type: isGroup ? 'principal-broadcast' : 'direct-message'
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

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !schoolId || !selectedTeacher) return;
        
        setSelectedFileForUpload(file);
        setFileCaption('');
        e.target.value = null; // Reset input so same file can be chosen again if canceled
    };

    const confirmAndUploadFile = async () => {
        const file = selectedFileForUpload;
        if (!file || !schoolId || !selectedTeacher) return;

        setIsSending(true);
        setSelectedFileForUpload(null); // Close modal
        try {
            const path = `schools/${schoolId}/messages/attachments/${Date.now()}_${file.name}`;
            const fileRef = storageRef(storage, path);
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);

            const isGroup = selectedTeacher.id === 'all_teachers';
            const participantsList = isGroup
                ? [messagingId, ...teachers.map(t => t.id)]
                : [messagingId, selectedTeacher.id];

            await addDoc(collection(db, `schools/${schoolId}/messages`), {
                text: fileCaption.trim() || '', // Use caption instead of hardcoded prefix
                from: currentUserRole === 'principal' ? 'principal' : 'admin',
                fromId: messagingId,
                fromName: currentUserName,
                fromRole: currentUserRole,
                to: isGroup ? 'all' : (selectedTeacher.role === 'Teacher' ? 'teacher' : (selectedTeacher.role === 'Principal' ? 'principal' : 'admin')),
                toId: selectedTeacher.id,
                toName: selectedTeacher.name,
                toRole: isGroup ? 'group' : (selectedTeacher.role === 'Teacher' ? 'teacher' : (selectedTeacher.role === 'Principal' ? 'principal' : 'school Admin')),
                participants: participantsList,
                timestamp: serverTimestamp(),
                read: false,
                type: isGroup ? 'principal-broadcast' : 'direct-message',
                attachment: {
                    url: url,
                    fullPath: path, // Added for easy deletion
                    name: file.name,
                    type: file.type.split('/')[1] || 'file'
                },
            });
            setFileCaption('');
            scrollToBottom();
        } catch (error) {
            console.error("Error uploading file:", error);
            alert("Failed to upload: " + error.message);
        } finally {
            setIsSending(false);
        }
    };

    const allContacts = [...principalContact, ...admins, ...teachers];

    const filteredTeachers = allContacts.filter(t =>
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
                            placeholder="Search contacts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', padding: '10px 20px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <button 
                        onClick={() => { setActiveTab('list'); setSelectedTeacher(null); }}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: activeTab === 'list' ? 'var(--primary-color, #4f46e5)' : 'transparent', color: activeTab === 'list' ? '#fff' : 'inherit', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                    >List</button>
                    <button 
                        onClick={() => { setActiveTab('group'); setSelectedTeacher({ id: 'all_teachers', name: 'All Teachers Group', role: 'Group' }); }}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: activeTab === 'group' ? 'var(--primary-color, #4f46e5)' : 'transparent', color: activeTab === 'group' ? '#fff' : 'inherit', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                    >Group</button>
                </div>

                <div className="inbox-teacher-list custom-scrollbar">
                    {activeTab === 'list' ? (
                        <>
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
                                <div className="no-results">No contacts found.</div>
                            )}
                        </>
                    ) : (
                        <div
                            className={`inbox-teacher-item ${selectedTeacher?.id === 'all_teachers' ? 'active' : ''}`}
                            onClick={() => setSelectedTeacher({ id: 'all_teachers', name: 'All Teachers Group', role: 'Group' })}
                        >
                            <div className="teacher-avatar" style={{ background: '#10b981' }}>
                                G
                            </div>
                            <div className="teacher-info">
                                <div className="teacher-name-row">
                                    <span className="teacher-name">All Teachers Group</span>
                                </div>
                                <span className="teacher-class">Broadcast to everyone</span>
                            </div>
                        </div>
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
                                    <span>
                                        {selectedTeacher.role === 'Admin' ? 'School Admin' : selectedTeacher.class}
                                        {selectedTeacher.status === 'on' ? ' • Online' : ''}
                                    </span>
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
                            {mergedMessages.length === 0 ? (
                                <div className="empty-chat-state">
                                    <MessageSquare size={48} color="rgba(99, 102, 241, 0.5)" />
                                    <p>No messages yet.</p>
                                    <span>Send a message to start the conversation with {selectedTeacher.name}.</span>
                                </div>
                            ) : (
                                mergedMessages.map((msg, index) => {
                                    const isMe = msg.fromId === messagingId || msg.fromId === currentUserId || msg.from === messagingId || (messagingId === 'principal' && msg.from === 'principal');
                                    const showDateSeparator = index === 0 ||
                                        formatMessageDate(msg.timestamp) !== formatMessageDate(mergedMessages[index - 1]?.timestamp);

                                    return (
                                        <React.Fragment key={msg.id}>
                                            {showDateSeparator && (
                                                <div className="date-separator">
                                                    <span>{formatMessageDate(msg.timestamp)}</span>
                                                </div>
                                            )}
                                            <div className={`message-wrapper ${isMe ? 'sent' : 'received'}`}>
                                                <div className="message-bubble">
                                                    {(msg.text || msg.message) && (
                                                        <p className="message-text">{msg.text || msg.message}</p>
                                                    )}

                                                    {msg.attachment && (
                                                        <div className="attachment-container">
                                                            {['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(msg.attachment.type?.toLowerCase()) ? (
                                                                <CachedImage
                                                                    src={msg.attachment.url}
                                                                    alt={msg.attachment.name}
                                                                    className="media-preview"
                                                                    onClick={() => window.open(msg.attachment.url, '_blank')}
                                                                    style={{
                                                                        maxWidth: '250px',
                                                                        maxHeight: '250px',
                                                                        borderRadius: '8px',
                                                                        cursor: 'pointer',
                                                                        marginTop: msg.text ? '0.5rem' : '0',
                                                                        display: 'block',
                                                                        objectFit: 'cover'
                                                                    }}
                                                                />
                                                            ) : ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(msg.attachment.type?.toLowerCase()) ? (
                                                                <video
                                                                    src={msg.attachment.url}
                                                                    controls
                                                                    className="media-preview"
                                                                    style={{
                                                                        maxWidth: '250px',
                                                                        maxHeight: '250px',
                                                                        borderRadius: '8px',
                                                                        marginTop: msg.text ? '0.5rem' : '0',
                                                                        display: 'block',
                                                                        backgroundColor: '#000'
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
                                                        {isMe && (
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
                        <div className="chat-input-area" style={{ position: 'relative' }}>
                            <label className="attach-btn" title="Attach file">
                                <Plus size={20} />
                                <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,video/*,application/pdf" />
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
                        <p>Select a contact from the sidebar to view conversations.</p>
                    </div>
                )}
            </div>

            {/* File Upload Confirmation Modal */}
            {selectedFileForUpload && (
                <div className="file-confirm-overlay" style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="file-confirm-modal" style={{
                        background: 'var(--bg-color, #fff)', padding: '20px', borderRadius: '12px',
                        width: '90%', maxWidth: '400px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-color, #000)' }}>Send Attachment</h3>
                        <div style={{ marginBottom: '15px', padding: '10px', background: 'var(--hover-color, #f3f4f6)', borderRadius: '8px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedFileForUpload.type.startsWith('image/') ? (
                                <img src={URL.createObjectURL(selectedFileForUpload)} alt="preview" style={{ maxWidth: '100%', maxHeight: '200px', display: 'block', margin: '0 auto', borderRadius: '8px' }} />
                            ) : selectedFileForUpload.type.startsWith('video/') ? (
                                <video src={URL.createObjectURL(selectedFileForUpload)} style={{ maxWidth: '100%', maxHeight: '200px', display: 'block', margin: '0 auto', borderRadius: '8px' }} controls />
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-color, #000)' }}><Paperclip size={24} /> <span style={{ wordBreak: 'break-all' }}>{selectedFileForUpload.name}</span></div>
                            )}
                        </div>
                        <input
                            type="text"
                            placeholder="Add a caption..."
                            value={fileCaption}
                            onChange={(e) => setFileCaption(e.target.value)}
                            onKeyDown={(e) => { if(e.key === 'Enter') confirmAndUploadFile() }}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '15px', boxSizing: 'border-box' }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setSelectedFileForUpload(null)} style={{ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#666', fontWeight: 500 }}>Cancel</button>
                            <button onClick={confirmAndUploadFile} disabled={isSending} style={{ padding: '8px 16px', border: 'none', background: 'var(--primary-color, var(--wa-primary, #6366f1))', color: '#fff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                                {isSending ? 'Sending...' : <><Send size={16} /> Send</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Inbox;
