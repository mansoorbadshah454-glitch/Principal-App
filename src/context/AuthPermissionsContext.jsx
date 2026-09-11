import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { checkPermission, PERMISSIONS_LIST } from '../constants/permissions';

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

    const [userProfile, setUserProfile] = useState(null);
    const [permissions, setPermissions] = useState({});
    const [schoolData, setSchoolData] = useState(null);
    const [loading, setLoading] = useState(true);

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

    // Listen to School document for SaaS Subscription package & modules
    useEffect(() => {
        if (!schoolId) {
            setSchoolData(null);
            return;
        }

        const schoolDocRef = doc(db, 'schools', schoolId);
        const unsub = onSnapshot(schoolDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setSchoolData(docSnap.data());
            } else {
                setSchoolData(null);
            }
        }, (err) => {
            console.warn("School doc listener error:", err);
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
            } else {
                // Fallback check in users collection
                const userDocRef = doc(db, `schools/${schoolId}/users`, uid);
                getDoc(userDocRef).then((uSnap) => {
                    if (uSnap.exists()) {
                        const uData = uSnap.data();
                        setUserProfile(uData);
                        setPermissions(uData.permissions || {});
                    }
                }).catch(console.error);
            }
            setLoading(false);
        }, (err) => {
            console.warn("Permissions listener error:", err);
            setLoading(false);
        });

        return () => unsub();
    }, [schoolId, uid, sessionData?.role]);

    const hasAccess = (permKey) => {
        return checkPermission(role, permissions, permKey);
    };

    const schoolPackage = schoolData?.package || 'standard';
    const schoolModules = schoolData?.modules || {
        transport: schoolPackage === 'premium',
        surveillance: schoolPackage === 'premium',
        paperGenerator: schoolPackage === 'premium',
        store: schoolPackage === 'premium',
    };

    const hasModule = (moduleKey) => {
        if (!moduleKey) return true;
        if (schoolPackage === 'premium') return true;
        return schoolModules[moduleKey] === true;
    };

    const isPrincipal = (() => {
        const nr = (role || '').toLowerCase().replace(/[-_ ]/g, '');
        return nr === 'principal' || nr === 'superadmin';
    })();

    const value = {
        role,
        schoolId,
        uid,
        permissions,
        hasAccess,
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
            permissions: {},
            loading: false
        };
    }
    return context;
};
