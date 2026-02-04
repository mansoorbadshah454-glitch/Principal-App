import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { db, auth } from '../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { LogOut, ShieldAlert, X, Bell, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const MainLayout = () => {
    const [isSuspended, setIsSuspended] = React.useState(false);
    const [loading, setLoading] = React.useState(true);
    const [announcement, setAnnouncement] = React.useState(null);
    const [schoolId, setSchoolId] = React.useState('');

    React.useEffect(() => {
        const session = localStorage.getItem('manual_session');
        let currentSchoolId = '';
        if (session) {
            currentSchoolId = JSON.parse(session).schoolId;
            setSchoolId(currentSchoolId);
        }

        if (currentSchoolId) {
            // Listen for status
            const unsubStatus = onSnapshot(doc(db, "schools", currentSchoolId), (docSnap) => {
                if (docSnap.exists() && docSnap.data().status === 'suspended') {
                    setIsSuspended(true);
                } else {
                    setIsSuspended(false);
                }
                setLoading(false);
            });

            // Listen for announcements
            const unsubAnnounce = onSnapshot(doc(db, `schools/${currentSchoolId}/announcements`, 'global_broadcast'), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const sessionData = localStorage.getItem('manual_session');
                    const uid = sessionData ? JSON.parse(sessionData).uid : null;

                    if (data.active && (!data.dismissedBy || !data.dismissedBy.includes(uid))) {
                        setAnnouncement(data);
                    } else {
                        setAnnouncement(null);
                    }
                } else {
                    setAnnouncement(null);
                }
            });

            return () => {
                unsubStatus();
                unsubAnnounce();
            };
        } else {
            setLoading(false);
        }
    }, []);

    const dismissAnnouncement = async () => {
        if (!announcement || !schoolId) return;
        try {
            const sessionData = localStorage.getItem('manual_session');
            const uid = sessionData ? JSON.parse(sessionData).uid : null;
            if (uid) {
                await updateDoc(doc(db, `schools/${schoolId}/announcements`, 'global_broadcast'), {
                    dismissedBy: arrayUnion(uid)
                });
                setAnnouncement(null);
            }
        } catch (error) {
            console.error("Error dismissing:", error);
            setAnnouncement(null);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('manual_session');
        auth.signOut();
        window.location.href = '/login';
    };

    if (loading) return null;

    if (isSuspended) {
        return (
            <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '2rem' }}>
                <div className="card glass" style={{ maxWidth: '500px', textAlign: 'center', padding: '3rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ width: '80px', height: '80px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                        <ShieldAlert size={40} color="#f87171" />
                    </div>
                    <h2 style={{ fontSize: '1.75rem', color: 'white', marginBottom: '1rem' }}>System Access Suspended</h2>
                    <p style={{ color: '#94a3b8', marginBottom: '2.5rem', lineHeight: '1.6' }}>
                        Your school's access to the administrative portal has been temporarily stopped by the Super Admin.
                        This usually happens due to pending monthly fees or system maintenance.
                    </p>
                    <button onClick={handleLogout} className="btn" style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', color: 'white' }}>
                        <LogOut size={18} />
                        Logout Session
                    </button>
                    <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--primary)' }}>Please contact Super Administration for support.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            {announcement && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    padding: '0.75rem 2rem',
                    background: announcement.type === 'warning' ? '#f59e0b' : announcement.type === 'success' ? '#10b981' : '#6366f1',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    animation: 'slideInDown 0.5s ease-out'
                }}>
                    <style>{`
                        @keyframes slideInDown {
                            from { transform: translateY(-100%); }
                            to { transform: translateY(0); }
                        }
                    `}</style>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, justifyContent: 'center' }}>
                        {announcement.type === 'warning' ? <AlertTriangle size={20} /> : announcement.type === 'success' ? <CheckCircle size={20} /> : <Bell size={20} />}
                        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{announcement.message}</span>
                    </div>
                    <button
                        onClick={dismissAnnouncement}
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', transition: 'all 0.2s' }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
            <Sidebar />
            <main className="main-content" style={{ paddingTop: announcement ? '50px' : '0' }}>
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
