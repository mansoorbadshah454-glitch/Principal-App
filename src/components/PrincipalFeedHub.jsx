import React, { useState, useEffect, useMemo } from 'react';
import {
    Bell, MessageCircle, ThumbsUp, Send, Loader2, Sparkles,
    Shield, Clock, ChevronRight, User, CornerDownRight, ExternalLink
} from 'lucide-react';
import {
    collection, query, orderBy, onSnapshot, addDoc,
    serverTimestamp, doc, updateDoc, increment, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import CachedImage from './CachedImage';

const PrincipalFeedHub = ({ schoolId, currentUserId, schoolProfile, posts = [], onNavigateToPost }) => {
    const [activeTab, setActiveTab] = useState('comments'); // 'comments' | 'notifications'
    const [commentsList, setCommentsList] = useState([]);
    const [replyTextMap, setReplyTextMap] = useState({});
    const [replyingMap, setReplyingMap] = useState({});
    const [activeReplyId, setActiveReplyId] = useState(null);

    // Identify Principal's posts
    const principalPosts = useMemo(() => {
        return posts.filter(p => 
            p.role === 'Principal' || 
            (p.authorName && schoolProfile?.name && p.authorName.toLowerCase() === schoolProfile.name.toLowerCase()) ||
            (currentUserId && p.authorId === currentUserId)
        );
    }, [posts, currentUserId, schoolProfile]);

    const principalPostIds = useMemo(() => {
        return principalPosts.map(p => p.id);
    }, [principalPosts]);

    // Calculate Principal Aggregate Stats
    const stats = useMemo(() => {
        let totalLikes = 0;
        let totalComments = 0;

        principalPosts.forEach(post => {
            const likesCount = (post.likes?.length || 0) + Object.keys(post.reactions || {}).length;
            totalLikes += likesCount;
            totalComments += (post.commentCount || 0);
        });

        return {
            totalPosts: principalPosts.length,
            totalLikes,
            totalComments
        };
    }, [principalPosts]);

    // Real-time listener for comments on Principal's Posts
    useEffect(() => {
        if (!schoolId || principalPostIds.length === 0) {
            setCommentsList([]);
            return;
        }

        // Setup real-time listeners on the latest 10 Principal posts' comment subcollections
        const unsubscribers = [];
        const topPosts = principalPosts.slice(0, 10);

        topPosts.forEach(post => {
            const q = query(
                collection(db, `schools/${schoolId}/posts/${post.id}/comments`),
                orderBy('timestamp', 'desc'),
                limit(8)
            );

            const unsub = onSnapshot(q, (snapshot) => {
                const fetched = snapshot.docs.map(doc => ({
                    id: doc.id,
                    postId: post.id,
                    postText: post.text || (post.media?.length ? 'Shared media' : 'Post'),
                    postTimestamp: post.timestamp,
                    ...doc.data()
                }));

                setCommentsList(prev => {
                    // Filter out existing comments from this post and append updated ones
                    const otherComments = prev.filter(c => c.postId !== post.id);
                    const combined = [...otherComments, ...fetched];
                    // Sort descending by timestamp
                    combined.sort((a, b) => {
                        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : (a.timestamp || 0);
                        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : (b.timestamp || 0);
                        return timeB - timeA;
                    });
                    return combined;
                });
            }, (err) => {
                console.error("PrincipalFeedHub comments listener error:", err);
            });

            unsubscribers.push(unsub);
        });

        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }, [schoolId, principalPostIds.join(',')]);

    // Real-time Notifications list generated from Principal posts activity
    const notificationsList = useMemo(() => {
        const notifications = [];

        // 1. Likes notifications
        principalPosts.forEach(post => {
            const likers = [...new Set([
                ...(post.likes || []),
                ...Object.keys(post.reactions || {}).filter(k => post.reactions[k] === 'like')
            ])];

            if (likers.length > 0) {
                notifications.push({
                    id: `like_${post.id}`,
                    type: 'like',
                    postId: post.id,
                    postText: post.text || 'Photo / Announcement',
                    count: likers.length,
                    timestamp: post.timestamp,
                    title: `${likers.length} ${likers.length === 1 ? 'person' : 'people'} liked your post`
                });
            }
        });

        // 2. Comments notifications
        commentsList.forEach(comment => {
            if (comment.authorName && comment.authorName !== schoolProfile?.name) {
                notifications.push({
                    id: `comment_${comment.id}`,
                    type: 'comment',
                    postId: comment.postId,
                    postText: comment.postText,
                    authorName: comment.authorName,
                    authorImage: comment.authorImage,
                    role: comment.role || 'Member',
                    text: comment.text,
                    timestamp: comment.timestamp,
                    title: `${comment.authorName} commented on your post`
                });
            }
        });

        // Sort notifications by timestamp descending
        notifications.sort((a, b) => {
            const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : (a.timestamp || 0);
            const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : (b.timestamp || 0);
            return timeB - timeA;
        });

        return notifications;
    }, [principalPosts, commentsList, schoolProfile]);

    const handleSendInlineReply = async (comment) => {
        const replyText = replyTextMap[comment.id]?.trim();
        if (!replyText || !schoolId || !currentUserId) return;

        setReplyingMap(prev => ({ ...prev, [comment.id]: true }));

        try {
            await addDoc(collection(db, `schools/${schoolId}/posts/${comment.postId}/comments`), {
                text: replyText,
                authorId: currentUserId,
                authorName: schoolProfile?.name || 'Principal',
                authorImage: schoolProfile?.image || '',
                role: 'Principal',
                replyTo: comment.authorName || null,
                timestamp: serverTimestamp()
            });

            // Increment post comment count
            const postRef = doc(db, `schools/${schoolId}/posts/${comment.postId}`);
            await updateDoc(postRef, {
                commentCount: increment(1)
            });

            // Clear input & close reply form
            setReplyTextMap(prev => ({ ...prev, [comment.id]: '' }));
            setActiveReplyId(null);
        } catch (err) {
            console.error("Error posting inline reply:", err);
            alert("Failed to send reply. Please try again.");
        } finally {
            setReplyingMap(prev => ({ ...prev, [comment.id]: false }));
        }
    };

    const formatTimestamp = (ts) => {
        if (!ts) return 'Just now';
        try {
            const date = ts.toDate ? ts.toDate() : new Date(ts);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            return `${diffDays}d ago`;
        } catch (e) {
            return '';
        }
    };

    return (
        <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '16px',
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
            maxHeight: '100%'
        }}>
            {/* Header / Stats */}
            <div style={{
                padding: '1.25rem 1.25rem 0.75rem',
                background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
                borderBottom: '1px solid var(--border-color, #f1f5f9)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)'
                    }}>
                        <Shield size={18} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main, #0f172a)' }}>
                            Principal's Hub
                        </h3>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>
                            Live Post Engagement & Replies
                        </span>
                    </div>
                </div>

                {/* Mini Stats Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.5rem',
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(4px)',
                    padding: '0.5rem 0.6rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(226, 232, 240, 0.8)'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#4f46e5' }}>{stats.totalPosts}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '500' }}>Posts</div>
                    </div>
                    <div style={{ textAlign: 'center', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0ea5e9' }}>{stats.totalLikes}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '500' }}>Likes</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#10b981' }}>{stats.totalComments}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '500' }}>Comments</div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color, #f1f5f9)',
                background: '#f8fafc'
            }}>
                <button
                    onClick={() => setActiveTab('comments')}
                    style={{
                        flex: 1,
                        padding: '0.65rem 0.5rem',
                        border: 'none',
                        borderBottom: activeTab === 'comments' ? '2px solid #4f46e5' : '2px solid transparent',
                        background: activeTab === 'comments' ? '#ffffff' : 'transparent',
                        color: activeTab === 'comments' ? '#4f46e5' : '#64748b',
                        fontWeight: activeTab === 'comments' ? '700' : '600',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <MessageCircle size={14} />
                    <span>Comments</span>
                    {commentsList.length > 0 && (
                        <span style={{
                            fontSize: '0.68rem',
                            padding: '1px 5px',
                            borderRadius: '10px',
                            background: activeTab === 'comments' ? '#e0e7ff' : '#e2e8f0',
                            color: activeTab === 'comments' ? '#4338ca' : '#64748b',
                            fontWeight: 'bold'
                        }}>
                            {commentsList.length}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('notifications')}
                    style={{
                        flex: 1,
                        padding: '0.65rem 0.5rem',
                        border: 'none',
                        borderBottom: activeTab === 'notifications' ? '2px solid #4f46e5' : '2px solid transparent',
                        background: activeTab === 'notifications' ? '#ffffff' : 'transparent',
                        color: activeTab === 'notifications' ? '#4f46e5' : '#64748b',
                        fontWeight: activeTab === 'notifications' ? '700' : '600',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <Bell size={14} />
                    <span>Activity</span>
                    {notificationsList.length > 0 && (
                        <span style={{
                            fontSize: '0.68rem',
                            padding: '1px 5px',
                            borderRadius: '10px',
                            background: activeTab === 'notifications' ? '#e0e7ff' : '#e2e8f0',
                            color: activeTab === 'notifications' ? '#4338ca' : '#64748b',
                            fontWeight: 'bold'
                        }}>
                            {notificationsList.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Tab Content Stream */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
            }}>
                {/* 1. COMMENTS STREAM */}
                {activeTab === 'comments' && (
                    <>
                        {commentsList.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8' }}>
                                <MessageCircle size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                                <p style={{ fontSize: '0.85rem', margin: 0, fontWeight: '500' }}>No comments on Principal posts yet.</p>
                                <span style={{ fontSize: '0.75rem' }}>Comments from teachers & parents will appear here in real-time.</span>
                            </div>
                        ) : (
                            commentsList.map(comment => {
                                const isPrincipalSelf = comment.role === 'Principal' || comment.authorName === schoolProfile?.name;
                                const isReplyOpen = activeReplyId === comment.id;

                                return (
                                    <div
                                        key={comment.id}
                                        style={{
                                            padding: '0.65rem 0.75rem',
                                            borderRadius: '12px',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem',
                                            transition: 'border-color 0.2s ease'
                                        }}
                                    >
                                        {/* Post Context Snippet */}
                                        <div
                                            onClick={() => onNavigateToPost && onNavigateToPost(comment.postId)}
                                            style={{
                                                fontSize: '0.72rem',
                                                color: '#64748b',
                                                background: '#f1f5f9',
                                                padding: '3px 6px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '4px'
                                            }}
                                            title="Click to view post"
                                        >
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                                                On: "{comment.postText?.substring(0, 45)}..."
                                            </span>
                                            <ExternalLink size={11} color="#94a3b8" />
                                        </div>

                                        {/* Comment Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    background: '#ede9fe',
                                                    overflow: 'hidden',
                                                    flexShrink: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    {comment.authorImage ? (
                                                        <CachedImage
                                                            src={comment.authorImage}
                                                            alt={comment.authorName}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <User size={13} color="#6d28d9" />
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1e293b' }}>
                                                    {comment.authorName}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '1px 4px',
                                                    borderRadius: '4px',
                                                    background: isPrincipalSelf ? '#dcfce7' : '#e0e7ff',
                                                    color: isPrincipalSelf ? '#15803d' : '#4338ca',
                                                    fontWeight: '600'
                                                }}>
                                                    {comment.role || 'Teacher'}
                                                </span>
                                            </div>

                                            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                                {formatTimestamp(comment.timestamp)}
                                            </span>
                                        </div>

                                        {/* Comment Text */}
                                        <p style={{
                                            margin: '0',
                                            fontSize: '0.82rem',
                                            color: '#334155',
                                            lineHeight: '1.35',
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {comment.text}
                                        </p>

                                        {/* Quick Inline Reply Bar */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                                            <button
                                                onClick={() => setActiveReplyId(isReplyOpen ? null : comment.id)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#4f46e5',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px'
                                                }}
                                            >
                                                <CornerDownRight size={12} />
                                                {isReplyOpen ? 'Cancel' : 'Quick Reply'}
                                            </button>
                                        </div>

                                        {/* Inline Reply Input */}
                                        {isReplyOpen && (
                                            <div style={{
                                                marginTop: '4px',
                                                display: 'flex',
                                                gap: '6px',
                                                alignItems: 'center',
                                                padding: '4px',
                                                background: '#ffffff',
                                                borderRadius: '8px',
                                                border: '1.5px solid #6366f1'
                                            }}>
                                                <input
                                                    type="text"
                                                    value={replyTextMap[comment.id] || ''}
                                                    onChange={(e) => setReplyTextMap({ ...replyTextMap, [comment.id]: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleSendInlineReply(comment);
                                                        }
                                                    }}
                                                    placeholder={`Reply to ${comment.authorName}...`}
                                                    style={{
                                                        flex: 1,
                                                        border: 'none',
                                                        outline: 'none',
                                                        fontSize: '0.78rem',
                                                        padding: '4px 6px',
                                                        fontFamily: 'inherit'
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleSendInlineReply(comment)}
                                                    disabled={replyingMap[comment.id] || !replyTextMap[comment.id]?.trim()}
                                                    style={{
                                                        background: '#4f46e5',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        padding: '4px 8px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 'bold',
                                                        opacity: (replyingMap[comment.id] || !replyTextMap[comment.id]?.trim()) ? 0.5 : 1
                                                    }}
                                                >
                                                    {replyingMap[comment.id] ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </>
                )}

                {/* 2. ACTIVITY & NOTIFICATIONS STREAM */}
                {activeTab === 'notifications' && (
                    <>
                        {notificationsList.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8' }}>
                                <Bell size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                                <p style={{ fontSize: '0.85rem', margin: 0, fontWeight: '500' }}>No recent activity.</p>
                                <span style={{ fontSize: '0.75rem' }}>Likes and engagements on your posts will appear here.</span>
                            </div>
                        ) : (
                            notificationsList.map(notif => {
                                const isLike = notif.type === 'like';

                                return (
                                    <div
                                        key={notif.id}
                                        onClick={() => onNavigateToPost && onNavigateToPost(notif.postId)}
                                        style={{
                                            padding: '0.65rem 0.75rem',
                                            borderRadius: '12px',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            gap: '0.6rem',
                                            alignItems: 'flex-start',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    >
                                        <div style={{
                                            width: '30px',
                                            height: '30px',
                                            borderRadius: '50%',
                                            background: isLike ? '#dbeafe' : '#ede9fe',
                                            color: isLike ? '#2563eb' : '#7c3aed',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {isLike ? <ThumbsUp size={15} /> : <MessageCircle size={15} />}
                                        </div>

                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{
                                                fontSize: '0.8rem',
                                                fontWeight: '600',
                                                color: '#1e293b',
                                                lineHeight: '1.3'
                                            }}>
                                                {notif.title}
                                            </div>
                                            {notif.text && (
                                                <p style={{
                                                    margin: '2px 0 0',
                                                    fontSize: '0.75rem',
                                                    color: '#475569',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    "{notif.text}"
                                                </p>
                                            )}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                marginTop: '4px',
                                                fontSize: '0.68rem',
                                                color: '#94a3b8'
                                            }}>
                                                <Clock size={10} />
                                                <span>{formatTimestamp(notif.timestamp)}</span>
                                            </div>
                                        </div>

                                        <ChevronRight size={14} color="#cbd5e1" style={{ alignSelf: 'center' }} />
                                    </div>
                                );
                            })
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PrincipalFeedHub;
