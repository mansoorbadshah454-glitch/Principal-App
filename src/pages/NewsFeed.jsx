import React, { useState, useEffect } from 'react';
import {
    Image as ImageIcon, Send, MoreHorizontal, Trash2,
    Shield, Clock, Loader2, Calendar, ThumbsUp, MessageCircle, Users
} from 'lucide-react';
import { db, storage, auth } from '../firebase';
import CommentsSection from '../components/CommentsSection';
import LikersModal from '../components/LikersModal';
import {
    collection, addDoc, query, orderBy, onSnapshot,
    deleteDoc, doc, serverTimestamp, getDoc, updateDoc, arrayUnion, arrayRemove, increment
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import CachedImage from '../components/CachedImage';

const BACKGROUND_GRADIENTS = [
    { id: 0, colors: [], name: 'Default' },
    { id: 1, colors: ['#FF5F6D', '#FFC371'], name: 'Sunset' },
    { id: 2, colors: ['#2193b0', '#6dd5ed'], name: 'Ocean' },
    { id: 3, colors: ['#cc2b5e', '#753a88'], name: 'Purple Love' },
    { id: 4, colors: ['#00B4DB', '#0083B0'], name: 'Blue Raspberry' },
    { id: 5, colors: ['#f12711', '#f5af19'], name: 'Flare' },
    { id: 6, colors: ['#8E2DE2', '#4A00E0'], name: 'Frost' },
];

const NewsFeed = () => {
    const [posts, setPosts] = useState([]);
    const [postText, setPostText] = useState('');
    const [postImage, setPostImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [schoolProfile, setSchoolProfile] = useState({ name: 'Principal', image: '' });
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [openCommentPostId, setOpenCommentPostId] = useState(null);
    const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState(0);
    const [likersModalData, setLikersModalData] = useState(null);

    // Audience State
    const [audience, setAudience] = useState('all'); // 'all' or 'class'
    const [selectedClass, setSelectedClass] = useState('');
    const [classes, setClasses] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null); // To track likes
    const [schoolId, setSchoolId] = useState(null);

    // 1. Resolve School ID & User ID
    useEffect(() => {
        const resolveAuth = async () => {
            // Priority 1: Manual Session
            const session = localStorage.getItem('manual_session');
            if (session) {
                try {
                    const data = JSON.parse(session);
                    if (data.schoolId && data.uid) {
                        setSchoolId(data.schoolId);
                        setCurrentUserId(data.uid);
                        return;
                    }
                } catch (e) {
                    console.error("Session parse error", e);
                }
            }

            // Priority 2: Firebase Auth
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    setCurrentUserId(user.uid);
                    try {
                        const tokenResult = await user.getIdTokenResult();
                        if (tokenResult.claims.schoolId) {
                            setSchoolId(tokenResult.claims.schoolId);
                        }
                    } catch (e) {
                        console.error("Error fetching claims", e);
                    }
                }
            });
            return () => unsubscribe();
        };

        resolveAuth();
    }, []);

    // 2. Fetch School Profile
    useEffect(() => {
        if (!schoolId) return;

        const fetchProfile = async () => {
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
        };
        fetchProfile();
    }, [schoolId]);

    // 3. Fetch Classes for Dropdown
    useEffect(() => {
        if (!schoolId) return;


        const q = query(collection(db, `schools/${schoolId}/classes`));
        const unsubscribe = onSnapshot(q, (snapshot) => {

            const classesData = snapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name
            })).sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
            setClasses(classesData);
        }, (error) => {
            console.error("NewsFeed: Error fetching classes", error);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // Fetch Posts
    useEffect(() => {
        if (schoolId) {
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
                        deletePromises.push(deleteDoc(doc.ref));
                        if (data.imageUrl) {
                            const imageRef = ref(storage, data.imageUrl);
                            deletePromises.push(deleteObject(imageRef).catch(err => console.log('Image delete cleanup err', err)));
                        }
                    }
                });

                if (deletePromises.length > 0) {
                    Promise.all(deletePromises).then(() => console.log(`Cleaned up ${deletePromises.length} old items`));
                }

                setPosts(filteredPosts);
            });
            return () => unsubscribe();
        }
    }, [schoolId]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedBackgroundIndex(0); // Reset background when picking image
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
        if (audience === 'class' && !selectedClass) {
            alert("Please select a class.");
            return;
        }

        setLoading(true);
        setLoading(true);
        if (!schoolId) return;

        try {
            let imageUrl = '';
            if (postImage) {
                const storageRef = ref(storage, `schools/${schoolId}/posts/${Date.now()}`);
                await uploadBytes(storageRef, postImage);
                imageUrl = await getDownloadURL(storageRef);
            }

            const targetClassName = audience === 'class'
                ? classes.find(c => c.id === selectedClass)?.name || ''
                : '';

            await addDoc(collection(db, `schools/${schoolId}/posts`), {
                text: postText,
                imageUrl: imageUrl,
                timestamp: serverTimestamp(),
                authorName: schoolProfile.name,
                authorImage: schoolProfile.image,
                role: 'Principal',
                audience: audience,
                targetClassId: audience === 'class' ? selectedClass : null,
                targetClassName: targetClassName,
                likes: [],
                commentCount: 0,
                backgroundIndex: selectedBackgroundIndex
            });

            setPostText('');
            setPostImage(null);
            setImagePreview(null);
            setSelectedBackgroundIndex(0);
            setAudience('all');
            setSelectedClass('');
        } catch (error) {
            console.error("Error creating post:", error);
            alert("Failed to post.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (postId, imageUrl) => {

        if (!schoolId) return;

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

    const handleLike = async (post) => {

        if (!schoolId || !currentUserId) return;
        const uid = currentUserId;

        // Optimistic UI handled by Firestore listener
        const postRef = doc(db, `schools/${schoolId}/posts`, post.id);
        const isLiked = post.likes?.includes(uid);

        try {
            if (isLiked) {
                await updateDoc(postRef, {
                    likes: arrayRemove(uid)
                });
            } else {
                await updateDoc(postRef, {
                    likes: arrayUnion(uid)
                });
            }
        } catch (error) {
            console.error("Error liking post:", error);
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

    return (
        <div style={{ margin: '-2.5rem', padding: '2.5rem', minHeight: 'calc(100vh - 2.5rem)', background: '#1e293b', animation: 'fadeIn 0.5s ease-out' }}>
            
            {likersModalData && (
                <LikersModal 
                    uids={likersModalData} 
                    schoolId={schoolId} 
                    onClose={() => setLikersModalData(null)} 
                />
            )}

            <div className="card" style={{
                background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                color: 'white',
                border: 'none',
                borderRadius: '0', 
                margin: '-2.5rem -2.5rem 2rem -2.5rem',
                padding: '2rem',
                position: 'sticky',
                top: 0,
                zIndex: 50
            }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '60px', height: '60px', borderRadius: '50%', background: 'white',
                        padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {schoolProfile.image ? (
                            <CachedImage src={schoolProfile.image} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
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

            {/* Main Content - Centered */}
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 1rem' }}>

                {/* Create Post */}
                <div className="card" style={{ marginBottom: '2rem', padding: '1rem' }}>
                    <div style={{
                        display: 'flex', gap: '1rem', marginBottom: '1rem',
                        background: selectedBackgroundIndex > 0 ? `linear-gradient(135deg, ${BACKGROUND_GRADIENTS[selectedBackgroundIndex].colors.join(', ')})` : 'none',
                        minHeight: selectedBackgroundIndex > 0 ? '300px' : 'auto',
                        padding: selectedBackgroundIndex > 0 ? '1rem' : '0',
                        borderRadius: selectedBackgroundIndex > 0 ? '12px' : '0',
                        alignItems: selectedBackgroundIndex > 0 ? 'center' : 'flex-start',
                        position: 'relative'
                    }}>
                        {selectedBackgroundIndex === 0 && (
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9',
                                overflow: 'hidden', flexShrink: 0
                            }}>
                                {schoolProfile.image ? (
                                    <CachedImage src={schoolProfile.image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <Shield size={24} color="#64748b" style={{ margin: '8px' }} />
                                )}
                            </div>
                        )}
                        <textarea
                            value={postText}
                            onChange={(e) => setPostText(e.target.value)}
                            placeholder={`What's on your mind, ${schoolProfile.name}?`}
                            style={{
                                width: '100%', border: 'none', outline: 'none',
                                fontSize: selectedBackgroundIndex > 0 ? '28px' : '1rem',
                                color: selectedBackgroundIndex > 0 ? '#ffffff' : 'inherit',
                                textAlign: selectedBackgroundIndex > 0 ? 'center' : 'left',
                                fontWeight: selectedBackgroundIndex > 0 ? 'bold' : 'normal',
                                background: 'transparent',
                                resize: 'none', minHeight: selectedBackgroundIndex > 0 ? 'auto' : '80px',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>

                    {/* Background Selection Row */}
                    {!imagePreview && !postImage && (
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' }}>
                            {BACKGROUND_GRADIENTS.map((bg) => (
                                <div
                                    key={bg.id}
                                    onClick={() => setSelectedBackgroundIndex(bg.id)}
                                    style={{
                                        width: '36px', height: '36px', borderRadius: '50%',
                                        background: bg.id === 0 ? '#f1f5f9' : `linear-gradient(135deg, ${bg.colors.join(', ')})`,
                                        border: selectedBackgroundIndex === bg.id ? '2px solid var(--primary)' : '2px solid transparent',
                                        cursor: 'pointer', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >
                                    {bg.id === 0 && <div style={{width: 16, height: 2, background: '#cbd5e1', transform: 'rotate(-45deg)'}}></div>}
                                </div>
                            ))}
                        </div>
                    )}

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

                    {/* Audience Selection */}
                    <div style={{ padding: '0.5rem 0', marginBottom: '1rem', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Users size={16} /> Audience:
                            </span>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="all"
                                    checked={audience === 'all'}
                                    onChange={() => setAudience('all')}
                                />
                                All Classes
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="class"
                                    checked={audience === 'class'}
                                    onChange={() => setAudience('class')}
                                />
                                Specific Class
                            </label>

                            {audience === 'class' && (
                                <select
                                    value={selectedClass}
                                    onChange={(e) => setSelectedClass(e.target.value)}
                                    style={{
                                        padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0',
                                        fontSize: '0.9rem', outline: 'none', marginLeft: '0.5rem'
                                    }}
                                >
                                    <option value="">Select Class...</option>
                                    {classes.map(cls => (
                                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

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
                                            <CachedImage src={post.authorImage} alt="Author" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                                            {post.audience === 'class' && (
                                                <>
                                                    <span>•</span>
                                                    <Users size={12} />
                                                    <span>{post.targetClassName || 'Class'}</span>
                                                </>
                                            )}
                                            {post.audience === 'all' && (
                                                <>
                                                    <span>•</span>
                                                    <Users size={12} />
                                                    <span>All</span>
                                                </>
                                            )}
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

                            {post.text && post.backgroundIndex > 0 ? (
                                <div style={{
                                    minHeight: '300px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: `linear-gradient(135deg, ${BACKGROUND_GRADIENTS[post.backgroundIndex]?.colors?.join(', ') || '#4f46e5, #06b6d4'})`,
                                    padding: '2rem', margin: '0 0 1rem 0'
                                }}>
                                    <div style={{
                                        fontSize: '28px', color: '#ffffff', fontWeight: 'bold',
                                        textAlign: 'center', whiteSpace: 'pre-wrap', width: '100%'
                                    }}>
                                        {post.text}
                                    </div>
                                </div>
                            ) : (
                                post.text && (
                                    <div style={{ padding: '0 1rem 1rem', fontSize: '1rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                                        {post.text}
                                    </div>
                                )
                            )}

                            {post.imageUrl && (
                                <div style={{ width: '100%', background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                                    <CachedImage src={post.imageUrl} alt="Post Content" style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', display: 'block' }} />
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <button
                                            onClick={() => handleLike(post)}
                                            style={{
                                                background: 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                color: post.likes?.includes(currentUserId) ? '#3b82f6' : '#64748b',
                                                fontSize: '0.9rem', fontWeight: '600', padding: 0
                                            }}
                                        >
                                            <ThumbsUp size={18} fill={post.likes?.includes(currentUserId) ? '#3b82f6' : 'none'} />
                                            <span>{post.likes?.length || 0} Likes</span>
                                        </button>
                                        {(post.likes && post.likes.length > 0) && (
                                            <button
                                                onClick={() => setLikersModalData(post.likes)}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                                    color: '#64748b', fontSize: '0.85rem', fontWeight: '600', padding: 0, textDecoration: 'underline'
                                                }}
                                            >
                                                View
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setOpenCommentPostId(openCommentPostId === post.id ? null : post.id)}
                                        style={{
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            color: openCommentPostId === post.id ? '#3b82f6' : '#64748b',
                                            fontSize: '0.9rem', fontWeight: '600'
                                        }}
                                    >
                                        <MessageCircle size={18} fill={openCommentPostId === post.id ? '#3b82f6' : 'none'} />
                                        <span>{post.commentCount || 0} Comments</span>
                                    </button>
                                </div>

                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <Calendar size={12} />
                                    <span>Expires in {Math.max(0, 7 - Math.floor((new Date() - (post.timestamp?.toDate() || new Date())) / (1000 * 60 * 60 * 24)))} days</span>
                                </div>
                            </div>

                            {openCommentPostId === post.id && (
                                <CommentsSection
                                    schoolId={schoolId}
                                    postId={post.id}
                                    currentUserId={currentUserId}
                                    schoolProfile={schoolProfile}
                                />
                            )}
                        </div>
                    ))}

                    {posts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            <p>No posts yet. Share something with the school!</p>
                        </div>
                    )}
                </div>

            </div>


            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div >
    );
};

export default NewsFeed;
