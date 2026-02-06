
import React, { useState, useEffect } from 'react';
import {
    Image as ImageIcon, Send, MoreHorizontal, Trash2,
    Shield, Clock, Loader2, Calendar
} from 'lucide-react';
import { db, storage } from '../firebase';
import {
    collection, addDoc, query, orderBy, onSnapshot,
    deleteDoc, doc, serverTimestamp, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const NewsFeed = () => {
    const [posts, setPosts] = useState([]);
    const [postText, setPostText] = useState('');
    const [postImage, setPostImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [schoolProfile, setSchoolProfile] = useState({ name: 'Principal', image: '' });
    const [menuOpenId, setMenuOpenId] = useState(null);

    // Fetch School Profile
    useEffect(() => {
        const fetchProfile = async () => {
            const session = localStorage.getItem('manual_session');
            if (session) {
                const { schoolId } = JSON.parse(session);
                try {
                    const docRef = doc(db, `schools/${schoolId}/settings`, 'profile');
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setSchoolProfile({
                            name: docSnap.data().name || 'Principal',
                            image: docSnap.data().profileImage || ''
                        });
                    }
                } catch (err) {
                    console.error("Error fetching profile:", err);
                }
            }
        };
        fetchProfile();
    }, []);

    // Fetch Posts
    useEffect(() => {
        const session = localStorage.getItem('manual_session');
        if (session) {
            const { schoolId } = JSON.parse(session);
            const q = query(
                collection(db, `schools/${schoolId}/posts`),
                orderBy('timestamp', 'desc')
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const currentTime = new Date();
                const oneWeekAgo = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);

                const filteredPosts = [];
                const deletePromises = [];

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const post = { id: doc.id, ...data };

                    if (!data.timestamp) {
                        filteredPosts.push(post); // Keep optimistic updates
                        return;
                    }

                    if (data.timestamp.toDate() > oneWeekAgo) {
                        filteredPosts.push(post);
                    } else {
                        // Found an old post, add to delete queue
                        // We only delete if it's the principal viewing (which it is)
                        // This acts as a lazy-cleanup
                        deletePromises.push(deleteDoc(doc.ref));
                        if (data.imageUrl) {
                            // Attempt to delete image ref (fire and forget)
                            const imageRef = ref(storage, data.imageUrl);
                            deletePromises.push(deleteObject(imageRef).catch(err => console.log('Image delete cleanup err', err)));
                        }
                    }
                });

                // Execute cleanup in background
                if (deletePromises.length > 0) {
                    Promise.all(deletePromises).then(() => console.log(`Cleaned up ${deletePromises.length} old items`));
                }

                setPosts(filteredPosts);
            });
            return () => unsubscribe();
        }
    }, []);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPostImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePost = async () => {
        if (!postText.trim() && !postImage) return;

        setLoading(true);
        const session = localStorage.getItem('manual_session');
        if (!session) return;
        const { schoolId } = JSON.parse(session);

        try {
            let imageUrl = '';
            if (postImage) {
                const storageRef = ref(storage, `schools/${schoolId}/posts/${Date.now()}`);
                await uploadBytes(storageRef, postImage);
                imageUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, `schools/${schoolId}/posts`), {
                text: postText,
                imageUrl: imageUrl,
                timestamp: serverTimestamp(),
                authorName: schoolProfile.name,
                authorImage: schoolProfile.image,
                role: 'Principal'
            });

            setPostText('');
            setPostImage(null);
            setImagePreview(null);
        } catch (error) {
            console.error("Error creating post:", error);
            alert("Failed to post.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (postId, imageUrl) => {
        const session = localStorage.getItem('manual_session');
        if (!session) return;
        const { schoolId } = JSON.parse(session);

        if (window.confirm("Delete this post?")) {
            try {
                await deleteDoc(doc(db, `schools/${schoolId}/posts`, postId));
                if (imageUrl) {
                    try {
                        const imageRef = ref(storage, imageUrl);
                        await deleteObject(imageRef);
                    } catch (e) {
                        console.log("Image delete skipped/failed", e);
                    }
                }
            } catch (error) {
                console.error("Error deleting post:", error);
            }
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'Just now';
        const date = timestamp.toDate();
        const now = new Date();
        const diffInHours = Math.abs(now - date) / 36e5;

        if (diffInHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Using inline styles for component isolation
    return (
        <div style={{ width: '100%', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header */}
            <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', color: 'white', border: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '60px', height: '60px', borderRadius: '50%', background: 'white',
                        padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {schoolProfile.image ? (
                            <img src={schoolProfile.image} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                            <Shield size={32} color="var(--primary)" />
                        )}
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>News Feed</h1>
                        <p style={{ opacity: 0.9, fontSize: '0.9rem' }}>Updates from the Principal's Desk</p>
                    </div>
                </div>
            </div>

            {/* Create Post */}
            <div className="card" style={{ marginBottom: '2rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9',
                        overflow: 'hidden', flexShrink: 0
                    }}>
                        {schoolProfile.image ? (
                            <img src={schoolProfile.image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <Shield size={24} color="#64748b" style={{ margin: '8px' }} />
                        )}
                    </div>
                    <textarea
                        value={postText}
                        onChange={(e) => setPostText(e.target.value)}
                        placeholder={`What's on your mind, ${schoolProfile.name}?`}
                        style={{
                            width: '100%', border: 'none', outline: 'none',
                            fontSize: '1rem', resize: 'none', minHeight: '80px',
                            fontFamily: 'inherit'
                        }}
                    />
                </div>

                {imagePreview && (
                    <div style={{ marginBottom: '1rem', position: 'relative' }}>
                        <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '12px', objectFit: 'cover' }} />
                        <button
                            onClick={() => { setPostImage(null); setImagePreview(null); }}
                            style={{
                                position: 'absolute', top: '10px', right: '10px',
                                background: 'rgba(0,0,0,0.5)', color: 'white',
                                border: 'none', borderRadius: '50%', width: '24px', height: '24px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            ×
                        </button>
                    </div>
                )}

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        cursor: 'pointer', color: '#64748b', fontWeight: '600', fontSize: '0.9rem',
                        padding: '0.5rem 1rem', borderRadius: '8px', transition: 'background 0.2s'
                    }} className="hover:bg-slate-50">
                        <ImageIcon size={20} color="#10b981" />
                        <span>Photo/Video</span>
                        <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                    </label>

                    <button
                        onClick={handlePost}
                        disabled={loading || (!postText.trim() && !postImage)}
                        className="btn-primary"
                        style={{
                            padding: '0.5rem 1.5rem', borderRadius: '8px',
                            opacity: (loading || (!postText.trim() && !postImage)) ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                        Post
                    </button>
                </div>
            </div>

            {/* Posts List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {posts.map(post => (
                    <div key={post.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9',
                                    overflow: 'hidden', flexShrink: 0
                                }}>
                                    {post.authorImage ? (
                                        <img src={post.authorImage} alt="Author" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Shield size={24} color="#64748b" style={{ margin: '8px' }} />
                                    )}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '2px' }}>
                                        {post.authorName}
                                    </h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '1px 4px', borderRadius: '4px', fontWeight: '600' }}>{post.role}</span>
                                        <span>•</span>
                                        <Clock size={12} />
                                        <span>{formatDate(post.timestamp)}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setMenuOpenId(menuOpenId === post.id ? null : post.id)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                                >
                                    <MoreHorizontal size={20} color="#64748b" />
                                </button>
                                {menuOpenId === post.id && (
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0,
                                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 10, minWidth: '120px'
                                    }}>
                                        <button
                                            onClick={() => handleDelete(post.id, post.imageUrl)}
                                            style={{
                                                width: '100%', textAlign: 'left', padding: '0.5rem 1rem',
                                                background: 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontSize: '0.9rem'
                                            }}
                                        >
                                            <Trash2 size={16} /> Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {post.text && (
                            <div style={{ padding: '0 1rem 1rem', fontSize: '1rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                                {post.text}
                            </div>
                        )}

                        {post.imageUrl && (
                            <div style={{ width: '100%', background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                                <img src={post.imageUrl} alt="Post Content" style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', display: 'block' }} />
                            </div>
                        )}

                        <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Calendar size={12} />
                            <span>Expires in {Math.max(0, 7 - Math.floor((new Date() - (post.timestamp?.toDate() || new Date())) / (1000 * 60 * 60 * 24)))} days</span>
                        </div>
                    </div>
                ))}

                {posts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        <p>No posts yet. Share something with the school!</p>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default NewsFeed;
