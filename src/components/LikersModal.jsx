import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { X, User } from 'lucide-react';

const getClassLevel = (className) => {
    if (!className) return 999;
    const name = className.toLowerCase();
    
    // Assign numerical values to common lower classes
    if (name.includes('play')) return -3;
    if (name.includes('nur')) return -2;
    if (name.includes('prep')) return -1;
    if (name.includes('kg')) return 0;
    
    // Extract the first number found in the string
    const match = name.match(/\d+/);
    if (match) return parseInt(match[0], 10);
    
    return 999; // Default for unknown/uncategorized text classes
};

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

            // Pre-fetch all classes for quick mapping, but don't await it here to avoid blocking liker queries
            const classMapPromise = getDocs(collection(db, `schools/${schoolId}/classes`))
                .then(snap => {
                    const map = {};
                    snap.forEach(c => map[c.id] = c.data().name || 'Class');
                    return map;
                })
                .catch(e => {
                    console.error("Error fetching classes", e);
                    return {};
                });

            const fetchLiker = async (uid) => {
                let finalName = 'Unknown User';
                let role = '';
                let studentContext = null;

                // Fire all DB queries concurrently for maximum speed
                const pTeacher = getDoc(doc(db, `schools/${schoolId}/teachers/${uid}`)).catch(() => null);
                const pAdmin = getDoc(doc(db, `schools/${schoolId}/users/${uid}`)).catch(() => null);
                const pParent = getDoc(doc(db, `schools/${schoolId}/parents/${uid}`)).catch(() => null);
                const pGlobal = getDoc(doc(db, `global_users/${uid}`)).catch(() => null);
                
                // Fetch ALL kids belonging to this parent using collectionGroup to catch legacy students in class subcollections
                const { collectionGroup } = await import('firebase/firestore');
                const pKids = getDocs(
                    query(collectionGroup(db, 'students'), where('parentDetails.parentId', '==', uid))
                ).catch(() => null);

                const [teacherDoc, adminDoc, parentDoc, globalDoc, kidsSnap] = await Promise.all([
                    pTeacher, pAdmin, pParent, pGlobal, pKids
                ]);

                // 1. Check if Teacher
                if (teacherDoc && teacherDoc.exists()) {
                    const data = teacherDoc.data();
                    finalName = data.name || data.displayName || 'Teacher';
                    role = 'Teacher';
                } 
                // 2. Check if Principal/Admin
                else if (adminDoc && adminDoc.exists()) {
                    const data = adminDoc.data();
                    finalName = data.displayName || data.name || 'Principal';
                    const rawRole = (data.role || '').toUpperCase();
                    role = (rawRole === 'SCHOOL ADMIN' || rawRole === 'ADMIN') ? 'School Admin' : (data.role ? data.role.charAt(0).toUpperCase() + data.role.slice(1) : 'Principal');
                } 
                // 3. Check if Parent (has a parent doc OR has children linked)
                else if ((parentDoc && parentDoc.exists()) || (kidsSnap && !kidsSnap.empty)) {
                    if (parentDoc && parentDoc.exists()) {
                        finalName = parentDoc.data().parentName || parentDoc.data().name || 'Parent';
                    } else if (globalDoc && globalDoc.exists()) {
                        finalName = globalDoc.data().name || globalDoc.data().displayName || 'Parent';
                    } else {
                        finalName = 'Parent';
                    }
                    role = 'Parent';

                    if (kidsSnap && !kidsSnap.empty) {
                        // Parent has kids, find the one in the lowest class
                        let lowestKid = null;
                        let lowestLevel = Infinity;
                        
                        const classMap = await classMapPromise; // Wait for classMap only when needed

                        kidsSnap.forEach(doc => {
                            // Ensure the kid belongs to this school
                            if (!doc.ref.path.includes(`schools/${schoolId}`)) return;

                            const kidData = doc.data();
                            
                            // Try to extract classId from path if missing in data
                            let fallbackClassId = kidData.classId;
                            if (!fallbackClassId) {
                                const pathSegments = doc.ref.path.split('/');
                                if (pathSegments.length >= 4 && pathSegments[2] === 'classes') {
                                    fallbackClassId = pathSegments[3];
                                }
                            }
                            
                            const kidClass = kidData.className || classMap[fallbackClassId] || kidData.admissionClass || 'Class';
                            const level = getClassLevel(kidClass);

                            if (level < lowestLevel) {
                                lowestLevel = level;
                                lowestKid = {
                                    name: kidData.name || [kidData.firstName, kidData.lastName].filter(Boolean).join(' ') || 'Child',
                                    className: kidClass
                                };
                            }
                        });

                        if (lowestKid) {
                            studentContext = `Kid: ${lowestKid.name} (${lowestKid.className})`;
                        }
                    }
                } 
                // 4. Fallback to global users
                else if (globalDoc && globalDoc.exists()) {
                    const data = globalDoc.data();
                    finalName = data.name || data.displayName || 'Unknown User';
                    const roleRaw = (data.role || '').toLowerCase();
                    if (roleRaw === 'parent') {
                        role = 'Parent';
                    } else {
                        role = roleRaw ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1) : '';
                    }
                }

                return { uid, name: finalName, role, studentContext };
            };

            try {
                // Fetch all likers in parallel
                const results = await Promise.all(uids.map(uid => fetchLiker(uid)));
                setLikers(results);
            } catch (err) {
                console.error("Error fetching likers:", err);
            }
            
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
