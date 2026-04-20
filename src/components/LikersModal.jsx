import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { X, User } from 'lucide-react';

const LikersModal = ({ uids, schoolId, onClose }) => {
    const [likers, setLikers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNames = async () => {
            if (!uids || uids.length === 0) {
                setLikers([]);
                setLoading(false);
                return;
            }

            const results = [];
            for (let uid of uids) {
                let finalName = 'Unknown User';
                let role = '';
                let studentContext = null;
                let found = false;

                // 1. Check Principal / School Admin
                if (!found) {
                    try {
                        const userDoc = await getDoc(doc(db, `schools/${schoolId}/users/${uid}`));
                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            finalName = data.displayName || data.name || 'Principal';
                            const rawRole = (data.role || '').toUpperCase();
                            role = (rawRole === 'SCHOOL ADMIN' || rawRole === 'ADMIN') ? 'Admin' : 'Principal';
                            found = true;
                        }
                    } catch (e) { }
                }

                // 2. Check Teacher
                if (!found) {
                    try {
                        const teacherDoc = await getDoc(doc(db, `schools/${schoolId}/teachers/${uid}`));
                        if (teacherDoc.exists()) {
                            const data = teacherDoc.data();
                            finalName = data.name || data.displayName || 'Teacher';
                            role = 'Teacher';
                            found = true;
                        }
                    } catch (e) { }
                }

                // 3. Check Parent
                if (!found) {
                    try {
                        const parentDoc = await getDoc(doc(db, `schools/${schoolId}/parents/${uid}`));
                        if (parentDoc.exists()) {
                            const data = parentDoc.data();
                            finalName = data.parentName || data.name || 'Parent';
                            role = 'Parent';
                            found = true;

                            try {
                                const q = query(collection(db, 'global_students_group'), where('parentDetails.parentId', '==', uid), limit(1));
                                // Wait, the collectionGroup syntax in web v9 is different
                                // We can use collectionGroup('students')
                            } catch(e){}
                            
                            try {
                                // Proper collectionGroup for web
                                const { collectionGroup } = await import('firebase/firestore');
                                const kidsQ = query(collectionGroup(db, 'students'), where('parentDetails.parentId', '==', uid), limit(1));
                                const kidsSnap = await getDocs(kidsQ);
                                if (!kidsSnap.empty) {
                                    const classMap = {};
                                    try {
                                        const classesSnap = await getDocs(collection(db, `schools/${schoolId}/classes`));
                                        classesSnap.forEach(c => {
                                            classMap[c.id] = c.data().name || 'Class';
                                        });
                                    } catch (e) { }

                                    const kidDoc = kidsSnap.docs[0];
                                    const kidData = kidDoc.data();
                                    const kidName = kidData.name || [kidData.firstName, kidData.lastName].filter(Boolean).join(' ') || 'Child';
                                    
                                    // Path is schools/{schoolId}/classes/{classId}/students/{studentId}
                                    // Reconstruct classId from ref
                                    const pathSegments = kidDoc.ref.path.split('/');
                                    let classId = null;
                                    if (pathSegments.length >= 4 && pathSegments[2] === 'classes') {
                                        classId = pathSegments[3];
                                    }
                                    
                                    const kidClass = (classId && classMap[classId]) ? classMap[classId] : 'Parent';
                                    studentContext = `${kidName}'s Parent`;
                                    role = kidClass;
                                }
                            } catch (e) { console.error(e); }
                        }
                    } catch (e) { }
                }

                // 4. Fallback to global_users
                if (!found) {
                    try {
                        const globalDoc = await getDoc(doc(db, `global_users/${uid}`));
                        if (globalDoc.exists()) {
                            const data = globalDoc.data();
                            finalName = data.name || data.displayName || 'Unknown User';
                            const roleRaw = (data.role || '').toLowerCase();

                            if (roleRaw === 'parent') {
                                role = 'Parent';
                            } else {
                                role = roleRaw ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1) : 'Teacher';
                            }
                            found = true;
                        }
                    } catch (e) { }
                }

                results.push({
                    uid,
                    name: finalName,
                    role,
                    studentContext
                });
            }

            setLikers(results);
            setLoading(false);
        };

        fetchNames();
    }, [uids, schoolId]);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '16px', width: '100%', maxWidth: '400px',
                maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }} onClick={e => e.stopPropagation()}>
                
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#1e293b' }}>Reaction Details</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '1rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading...</div>
                    ) : likers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No reactions found.</div>
                    ) : (
                        likers.map((user, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', flexShrink: 0 }}>
                                    <User size={18} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', color: '#1e293b' }}>{user.name}</h4>
                                    {(user.studentContext || user.role) && (
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            {user.studentContext && (
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{user.studentContext}</span>
                                            )}
                                            {user.role && (
                                                <span style={{ fontSize: '0.7rem', color: '#3b82f6', background: '#eff6ff', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                                                    {user.role}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default LikersModal;
