import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { checkPermission, PERMISSIONS_LIST, checkFeeTabAccess } from '../constants/permissions';

const AuthPermissionsContext = createContext(null);

export const AuthPermissionsProvider = ({ children }) => {
    const [sessionData, setSessionData] = useState(() => {
        try {
            const raw = localStorage.getItem('manual_session');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    });

    const [userProfile, setUserProfile] = useState(() => {
        try {
            const raw = localStorage.getItem('cached_user_profile');
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    });
    const [permissions, setPermissions] = useState(() => {
        try {
            const raw = localStorage.getItem('cached_admin_perms');
            return raw ? JSON.parse(raw) : {};
        } catch (_) { return {}; }
    });
    const [schoolData, setSchoolData] = useState(() => {
        try {
            const raw = localStorage.getItem('cached_school_data');
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    });
    const [loading, setLoading] = useState(false);

    const schoolId = sessionData?.schoolId;
    const uid = sessionData?.uid;
    const role = userProfile?.role || sessionData?.role || 'principal';

    useEffect(() => {
        // Sync local session on storage changes
        const handleStorageChange = () => {
            try {
                const raw = localStorage.getItem('manual_session');
                setSessionData(raw ? JSON.parse(raw) : null);
            } catch (e) {
                setSessionData(null);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Listen to Auth State to keep session synchronized
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                try {
                    const tokenResult = await currentUser.getIdTokenResult();
                    const claims = tokenResult.claims;
                    if (claims.schoolId) {
                        setSessionData(prev => {
                            const updated = {
                                ...(prev || {}),
                                uid: currentUser.uid,
                                schoolId: claims.schoolId,
                                role: claims.role || prev?.role || 'principal',
                                email: currentUser.email
                            };
                            try {
                                localStorage.setItem('manual_session', JSON.stringify(updated));
                            } catch (e) {}
                            return updated;
                        });
                    }
                } catch (e) {
                    console.warn("Error checking auth token claims in context:", e);
                }
            }
        });
        return () => unsubAuth();
    }, []);

    // Listen to School document for SaaS Subscription package & modules
    useEffect(() => {
        if (!schoolId) {
            setSchoolData(null);
            return;
        }

        const schoolDocRef = doc(db, 'schools', schoolId);
        const unsub = onSnapshot(schoolDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSchoolData(data);
                try {
                    localStorage.setItem('cached_school_data', JSON.stringify(data));
                } catch (_) {}
                console.log("🏫 Real-time School Plan Updated:", data.package, data.modules);
            }
        }, (err) => {
            console.warn("School doc listener notice (safe offline):", err);
        });

        return () => unsub();
    }, [schoolId]);

    useEffect(() => {
        if (!schoolId || !uid) {
            setPermissions({});
            setLoading(false);
            return;
        }

        const normalizedRole = (sessionData?.role || '').toLowerCase().replace(/[-_ ]/g, '');
        if (normalizedRole === 'principal' || normalizedRole === 'superadmin') {
            // Principal has access to everything
            setPermissions({});
            setLoading(false);
            return;
        }

        // For school Admin, listen to real-time updates in admin_users collection
        const adminDocRef = doc(db, `schools/${schoolId}/admin_users`, uid);
        const unsub = onSnapshot(adminDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserProfile(data);
                setPermissions(data.permissions || {});
                try {
                    localStorage.setItem('cached_user_profile', JSON.stringify(data));
                    localStorage.setItem('cached_admin_perms', JSON.stringify(data.permissions || {}));
                } catch (_) {}
            } else {
                // Fallback check in users collection
                const userDocRef = doc(db, `schools/${schoolId}/users`, uid);
                getDoc(userDocRef).then((uSnap) => {
                    if (uSnap.exists()) {
                        const uData = uSnap.data();
                        setUserProfile(uData);
                        setPermissions(uData.permissions || {});
                        try {
                            localStorage.setItem('cached_user_profile', JSON.stringify(uData));
                            localStorage.setItem('cached_admin_perms', JSON.stringify(uData.permissions || {}));
                        } catch (_) {}
                    }
                }).catch(console.error);
            }
            setLoading(false);
        }, (err) => {
            console.warn("Permissions listener notice (safe offline):", err);
            setLoading(false);
        });

        return () => unsub();
    }, [schoolId, uid, sessionData?.role]);

    const hasAccess = (permKey) => {
        return checkPermission(role, permissions, permKey);
    };

    const schoolPackage = (schoolData?.package || 'standard').toLowerCase();
    const schoolModules = schoolData?.modules || {
        transport: schoolPackage === 'premium',
        surveillance: schoolPackage === 'premium',
        paperGenerator: schoolPackage === 'premium',
        store: schoolPackage === 'premium',
    };

    const hasModule = (moduleKey) => {
        if (!moduleKey) return true;
        if (schoolPackage === 'premium') return true;
        return Boolean(schoolModules?.[moduleKey]);
    };

    const isPrincipal = (() => {
        const nr = (role || '').toLowerCase().replace(/[-_ ]/g, '');
        return nr === 'principal' || nr === 'superadmin';
    })();

    const hasFeeTabAccess = (tabKey) => {
        return checkFeeTabAccess(role, permissions, tabKey);
    };

    const value = {
        role,
        schoolId,
        uid,
        permissions,
        hasAccess,
        hasFeeTabAccess,
        isPrincipal,
        loading,
        userProfile: userProfile || sessionData,
        schoolData,
        schoolPackage,
        schoolModules,
        hasModule
    };

    return (
        <AuthPermissionsContext.Provider value={value}>
            {children}
        </AuthPermissionsContext.Provider>
    );
};

export const useAuthPermissions = () => {
    const context = useContext(AuthPermissionsContext);
    if (!context) {
        // Safe fallback if used outside provider
        return {
            role: 'principal',
            isPrincipal: true,
            hasAccess: () => true,
            hasFeeTabAccess: () => true,
            permissions: {},
            loading: false
        };
    }
    return context;
};
