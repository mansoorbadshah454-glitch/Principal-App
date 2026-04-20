import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, increment, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { Send, User } from 'lucide-react';
import CachedImage from './CachedImage';
import LikersModal from './LikersModal';

const CommentsSection = ({ schoolId, postId, currentUserId, schoolProfile }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [likersModalData, setLikersModalData] = useState(null);

    useEffect(() => {
        if (!schoolId || !postId) return;
        const q = query(
            collection(db, `schools/${schoolId}/posts/${postId}/comments`),
            orderBy('timestamp', 'desc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [schoolId, postId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUserId || submitting) return;

        setSubmitting(true);
        try {
            await addDoc(collection(db, `schools/${schoolId}/posts/${postId}/comments`), {
                text: newComment.trim(),
                authorId: currentUserId,
                authorName: schoolProfile?.name || 'User',
                authorImage: schoolProfile?.image || '',
                role: 'Principal',
                timestamp: serverTimestamp()
            });

            const postRef = doc(db, `schools/${schoolId}/posts/${postId}`);
            await updateDoc(postRef, {
                commentCount: increment(1)
            });

            setNewComment('');
        } catch (err) {
            console.error("Error adding comment:", err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!window.confirm("Delete this comment?")) return;
        try {
            await deleteDoc(doc(db, `schools/${schoolId}/posts/${postId}/comments`, commentId));
            const postRef = doc(db, `schools/${schoolId}/posts/${postId}`);
            await updateDoc(postRef, {
                commentCount: increment(-1)
            });
        } catch (err) {
            console.error("Error deleting comment:", err);
        }
    };

    const handleLikeComment = async (comment) => {
        if (!currentUserId) return;
        const commentRef = doc(db, `schools/${schoolId}/posts/${postId}/comments`, comment.id);
        const isLiked = comment.likes?.includes(currentUserId);
        try {
            if (isLiked) {
                await updateDoc(commentRef, { likes: arrayRemove(currentUserId) });
            } else {
                await updateDoc(commentRef, { likes: arrayUnion(currentUserId) });
            }
        } catch (error) {
            console.error("Error liking comment:", error);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return 'Just now';
        return timestamp.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{ padding: '1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            {likersModalData && (
                <LikersModal 
                    uids={likersModalData} 
                    schoolId={schoolId} 
                    onClose={() => setLikersModalData(null)} 
                />
            )}
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#e2e8f0' }}>
                    {schoolProfile?.image ? (
                        <CachedImage src={schoolProfile.image} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#64748b' }}>
                            <User size={18} />
                        </div>
                    )}
                </div>
                <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    style={{
                        flex: 1, padding: '0.5rem 1rem', borderRadius: '20px',
                        border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem'
                    }}
                    disabled={submitting}
                />
                <button
                    type="submit"
                    disabled={!newComment.trim() || submitting}
                    style={{
                        background: newComment.trim() ? '#3b82f6' : '#cbd5e1',
                        color: 'white', border: 'none', borderRadius: '50%',
                        width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: newComment.trim() ? 'pointer' : 'default',
                        transition: 'background 0.2s'
                    }}
                >
                    <Send size={16} style={{ marginLeft: '2px' }} />
                </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {comments.map(comment => (
                    <div key={comment.id} style={{ display: 'flex', gap: '0.75rem' }}>
                        {comment.authorImage ? (
                            <CachedImage src={comment.authorImage} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                <User size={18} />
                            </div>
                        )}
                        <div style={{ flex: 1 }}>
                            <div style={{ background: '#f1f5f9', padding: '0.5rem 0.75rem', borderRadius: '12px', display: 'inline-block', maxWidth: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: '600', fontSize: '0.85rem', color: '#1e293b' }}>{comment.authorName}</span>
                                    {comment.studentContext && (
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{comment.studentContext}</span>
                                    )}
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{comment.role}</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{comment.text}</p>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', marginLeft: '4px', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <span>{formatTime(comment.timestamp)}</span>
                                <button 
                                    onClick={() => handleLikeComment(comment)}
                                    style={{ background: 'none', border: 'none', color: comment.likes?.includes(currentUserId) ? '#3b82f6' : '#64748b', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', padding: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                    Like {comment.likes?.length > 0 ? `(${comment.likes.length})` : ''}
                                </button>
                                {comment.likes && comment.likes.length > 0 && (
                                    <button 
                                        onClick={() => setLikersModalData(comment.likes)}
                                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', padding: 0, textDecoration: 'underline' }}
                                    >
                                        View
                                    </button>
                                )}
                                <button 
                                    onClick={() => handleDeleteComment(comment.id)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', padding: 0 }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {comments.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', margin: '1rem 0' }}>
                        No comments yet. Be the first to comment!
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommentsSection;
