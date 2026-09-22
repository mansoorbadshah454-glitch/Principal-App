import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from '../components/Sidebar';
import { db, auth, messaging } from '../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { LogOut, ShieldAlert, X, Bell, AlertTriangle, CheckCircle, Info, CreditCard } from 'lucide-react';
import PrincipalAiAssistant from '../components/PrincipalAiAssistant/PrincipalAiAssistant';

const MainLayout = () => {
    const [isSuspended, setIsSuspended] = useState(false);
    const [loading, setLoading] = useState(true);
    const [announcement, setAnnouncement] = useState(null);
    const [schoolId, setSchoolId] = useState('');
    const location = useLocation();
    const mainContentRef = useRef(null);
    const isUserInteractingRef = useRef(false);
    const prevLocationRef = useRef(location.pathname);
    const restorationTimerRef = useRef(null);

    // Track real user interactions to distinguish deliberate scrolling from programmatic resets
    useEffect(() => {
        const markUserInteraction = () => {
            isUserInteractingRef.current = true;
        };

        window.addEventListener('wheel', markUserInteraction, { passive: true });
        window.addEventListener('touchmove', markUserInteraction, { passive: true });
        window.addEventListener('keydown', markUserInteraction, { passive: true });
        window.addEventListener('pointerdown', markUserInteraction, { passive: true });

        return () => {
            window.removeEventListener('wheel', markUserInteraction);
            window.removeEventListener('touchmove', markUserInteraction);
            window.removeEventListener('keydown', markUserInteraction);
            window.removeEventListener('pointerdown', markUserInteraction);
        };
    }, []);

    // Global Scroll Memory & Seamless Restoration Engine
    useEffect(() => {
        // 1. Save scroll position of the previous page before switching
        if (prevLocationRef.current && prevLocationRef.current !== location.pathname) {
            const currentY = window.scrollY || document.documentElement.scrollTop || (mainContentRef.current ? mainContentRef.current.scrollTop : 0);
            if (currentY > 0) {
                sessionStorage.setItem(`page_scroll_${prevLocationRef.current}`, currentY.toString());
            }
        }
        prevLocationRef.current = location.pathname;

        // 2. Read saved scroll for the current page
        const savedScroll = sessionStorage.getItem(`page_scroll_${location.pathname}`);
        const targetY = savedScroll ? parseInt(savedScroll, 10) : 0;
        
        let isRestoring = targetY > 0;
        isUserInteractingRef.current = false;

        // 3. Continuous Multi-Frame Restoration (waits for async Firestore data to expand the DOM)
        if (isRestoring) {
            let attempts = 0;
            const maxAttempts = 35; // 35 * 80ms = 2.8 seconds maximum polling

            if (restorationTimerRef.current) {
                clearInterval(restorationTimerRef.current);
            }

            restorationTimerRef.current = setInterval(() => {
                attempts++;
                if (isUserInteractingRef.current || attempts > maxAttempts) {
                    clearInterval(restorationTimerRef.current);
                    isRestoring = false;
                    return;
                }

                const docHeight = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight,
                    mainContentRef.current ? mainContentRef.current.scrollHeight : 0
                );

                // If page has rendered enough height to scroll to target
                if (docHeight > targetY + 100 || attempts > 10) {
                    window.scrollTo({ top: targetY, behavior: 'instant' });
                    if (mainContentRef.current) mainContentRef.current.scrollTop = targetY;

                    const actualY = window.scrollY || document.documentElement.scrollTop;
                    if (Math.abs(actualY - targetY) < 15 && attempts > 5) {
                        clearInterval(restorationTimerRef.current);
                        isRestoring = false;
                    }
                }
            }, 80);
        }

        // 4. Save scroll changes made by user
        const handleScroll = () => {
            if (isRestoring && !isUserInteractingRef.current) return;
            const currentScroll = window.scrollY || document.documentElement.scrollTop || (mainContentRef.current ? mainContentRef.current.scrollTop : 0);
            sessionStorage.setItem(`page_scroll_${location.pathname}`, currentScroll.toString());
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        const contentEl = mainContentRef.current;
        if (contentEl) {
            contentEl.addEventListener('scroll', handleScroll, { passive: true });
        }

        return () => {
            if (restorationTimerRef.current) {
                clearInterval(restorationTimerRef.current);
            }
            window.removeEventListener('scroll', handleScroll);
            if (contentEl) contentEl.removeEventListener('scroll', handleScroll);
        };
    }, [location.pathname]);

    useEffect(() => {
        const session = localStorage.getItem('manual_session');
        let currentSchoolId = '';
        if (session) {
            currentSchoolId = JSON.parse(session).schoolId;
            setSchoolId(currentSchoolId);
        }

        if (currentSchoolId) {
            // Request push notification permissions
            const requestAdminNotificationPermission = async () => {
                if (!messaging) return;
                try {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        const token = await getToken(messaging);
                        if (token) {
                            const sessionData = localStorage.getItem('manual_session');
                            const uid = sessionData ? JSON.parse(sessionData).uid : null;
                            if (uid) {
                                await updateDoc(doc(db, `schools/${currentSchoolId}/users`, uid), {
                                    fcmToken: arrayUnion(token)
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.log('FCM Error (Web push might need VAPID key configuring in console):', err);
                }
            };
            requestAdminNotificationPermission();

            // Listen for status
            const unsubStatus = onSnapshot(doc(db, "schools", currentSchoolId), (docSnap) => {
                if (docSnap.exists()) {
                    if (docSnap.data().status === 'suspended') {
                        setIsSuspended(true);
                    } else {
                        setIsSuspended(false);
                    }
                    setLoading(false);
                } else {
                    console.warn("School document does not exist in snapshot!");
                    // Only redirect if definitely online and server verified non-existence
                    if (navigator.onLine) {
                        alert("School Not Found! Your access might have been revoked.");
                        localStorage.removeItem('manual_session');
                        window.location.href = '/login';
                    } else {
                        setLoading(false);
                    }
                }
            }, (error) => {
                console.warn("Status snapshot notice (safe when offline):", error);
                setLoading(false);
            });

            // Listen for announcements
            const unsubAnnounce = onSnapshot(doc(db, `schools/${currentSchoolId}/announcements`, 'global_broadcast'), (docSnap) => {
                // ... (existing logic)
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
            }, (error) => {
                console.warn("Announcement snapshot error (ignorable):", error);
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

    if (loading) {
        return (
            <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%' }} />
            </div>
        );
    }

    if (isSuspended && location.pathname !== '/settings') {
        return (
            <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '1.5rem' }}>
                <div className="card glass" style={{ maxWidth: '520px', width: '100%', textAlign: 'center', padding: '2.5rem 2rem', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}>
                    <div style={{ width: '76px', height: '76px', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                        <ShieldAlert size={38} color="#f87171" />
                    </div>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'white', marginBottom: '0.75rem' }}>System Access Stopped</h2>
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '0.5rem', lineHeight: '1.6' }}>
                        Your school's access to the management portal has been temporarily paused by Super Admin due to pending monthly subscription dues.
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '2rem', lineHeight: '1.6', direction: 'rtl' }}>
                        محترم پرنسپل صاحب، واجب الادا فیس جمع کروا کے سسٹم کو دوبارہ فعال کرنے کیلئے نیچے "Pay & Submit Slip" بٹن پر کلک کریں۔
                    </p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <a
                            href="/settings?tab=billing"
                            className="btn"
                            style={{
                                width: '100%',
                                justifyContent: 'center',
                                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                color: 'white',
                                padding: '0.85rem 1.5rem',
                                borderRadius: '12px',
                                fontWeight: '700',
                                fontSize: '0.95rem',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.4)'
                            }}
                        >
                            <CreditCard size={18} />
                            Pay & Submit Slip (Billing Tab)
                        </a>

                        <button onClick={handleLogout} className="btn" style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <LogOut size={18} />
                            Logout Session
                        </button>
                    </div>

                    <p style={{ marginTop: '1.5rem', fontSize: '0.82rem', color: '#818cf8', margin: '1.5rem 0 0' }}>
                        ⚡ Instant reactivation: Once verified by Super Admin, your portal automatically unlocks.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            {isSuspended && (
                <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 999,
                    background: 'linear-gradient(90deg, #b91c1c 0%, #dc2626 100%)',
                    color: 'white',
                    padding: '0.65rem 1.5rem',
                    textAlign: 'center',
                    fontWeight: '700',
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    boxShadow: '0 4px 12px rgba(185, 28, 28, 0.3)'
                }}>
                    <AlertTriangle size={18} />
                    <span>School portal is suspended. You have unrestricted access to Billing & Payment below to submit your payment proof.</span>
                </div>
            )}
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
            <main
                ref={mainContentRef}
                className="main-content"
                style={{
                    paddingTop: announcement ? '50px' : '0',
                    transition: 'none'
                }}
            >
                <style>{`
                    .main-content {
                        transition: none !important;
                    }
                    /* Harmonize page root animations so all routes share the identical ultra-fast GPU transition */
                    .main-content > div > .animate-fade-in-up,
                    .main-content > div > div.animate-fade-in-up,
                    .main-content > div > .settings-studio-container,
                    .main-content > div > div[style*="animation: 'fadeIn"],
                    .main-content > div > div[style*="animation: fadeIn"] {
                        animation: none !important;
                    }
                `}</style>
                <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        minHeight: '100%',
                        boxSizing: 'border-box',
                        willChange: 'transform, opacity'
                    }}
                >
                    <Outlet />
                </motion.div>
            </main>
            {schoolId && <PrincipalAiAssistant schoolId={schoolId} />}
        </div>
    );
};

export default MainLayout;
