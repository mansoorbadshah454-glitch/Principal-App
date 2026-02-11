import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Mail, Lock, ArrowRight, Loader2, Layout, UserCheck, Users, Zap, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { functions } from '../firebase';

const InfoCard = ({ icon: Icon, title, description, color }) => (
    <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '20px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        transition: 'all 0.3s ease',
        cursor: 'default'
    }} className="hover-lift">
        <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: `0 8px 16px -4px ${color}66`
        }}>
            <Icon size={22} />
        </div>
        <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'white', marginBottom: '0.25rem' }}>{title}</h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5' }}>{description}</p>
        </div>
    </div>
);

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const normalizedEmail = email.toLowerCase().trim();

            // Step 1: Attempt standard Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
            const user = userCredential.user;

            // Secure Claim Check
            const tokenResult = await user.getIdTokenResult();
            const claims = tokenResult.claims;

            if (claims.role === 'principal' || claims.role === 'super_admin') {
                const schoolId = claims.schoolId;

                if (!schoolId) {
                    await auth.signOut();
                    setError('Security Error: No School ID associated with this account.');
                    return;
                }

                // Check school status
                const schoolSnap = await getDoc(doc(db, "schools", schoolId));
                if (schoolSnap.exists() && schoolSnap.data().status === 'suspended') {
                    await auth.signOut();
                    setError('System Access Denied: Your school system has been suspended. Please contact support.');
                    return;
                }

                localStorage.setItem('manual_session', JSON.stringify({
                    uid: user.uid,
                    schoolId: schoolId,
                    role: claims.role,
                    email: user.email,
                    isManual: false
                }));

                navigate('/');
                return;
            } else {
                await auth.signOut();
                setError('Access Denied: Not a Principal account.');
                return;
            }
        } catch (authErr) {
            console.log("Auth failed, checking for manual bypass...");
            const normalizedEmail = email.toLowerCase().trim();

            try {
                const q = query(collection(db, "global_users"), where("email", "==", normalizedEmail));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const userData = querySnapshot.docs[0].data();
                    const schoolId = userData.schoolId;
                    const uid = userData.uid;

                    const schoolUserRef = doc(db, `schools/${schoolId}/users`, uid);
                    const schoolUserDoc = await getDoc(schoolUserRef);

                    if (schoolUserDoc.exists()) {
                        const storedManualPassword = schoolUserDoc.data().manualPassword;

                        if (storedManualPassword && storedManualPassword === password) {
                            const schoolSnap = await getDoc(doc(db, "schools", schoolId));
                            if (schoolSnap.exists() && schoolSnap.data().status === 'suspended') {
                                setError('System Access Denied: Your school system has been suspended.');
                                return;
                            }

                            localStorage.setItem('manual_session', JSON.stringify({
                                uid: uid,
                                schoolId: schoolId,
                                role: 'principal',
                                email: normalizedEmail,
                                isManual: true
                            }));
                            window.location.href = '/';
                            return;
                        }
                    }
                }
            } catch (fallbackErr) {
                console.error("Fallback check failed:", fallbackErr);
            }

            setError("Invalid credentials. Please verify your email and password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page" style={{
            minHeight: '100vh',
            width: '100vw',
            background: '#020617',
            fontFamily: "'Outfit', sans-serif",
            display: 'flex',
            color: 'white',
            overflowX: 'hidden'
        }}>
            {/* Background Decorations */}
            <div style={{ position: 'fixed', top: '-10%', left: '-5%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(79, 70, 229, 0.1) 0%, transparent 70%)', zIndex: 1 }} />
            <div style={{ position: 'fixed', bottom: '-10%', right: '-5%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%)', zIndex: 1 }} />

            {/* Left Content: Info Section (Desktop) */}
            <div style={{
                flex: 1.2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '4rem 6rem',
                zIndex: 10,
                background: 'rgba(2, 6, 23, 0.5)',
                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                position: 'relative'
            }} className="desktop-info-section">
                <div style={{ maxWidth: '640px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 1.25rem',
                        background: 'rgba(79, 70, 229, 0.1)',
                        border: '1px solid rgba(79, 70, 229, 0.2)',
                        borderRadius: '100px',
                        marginBottom: '2rem',
                        color: '#818cf8',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                    }}>
                        <Zap size={16} fill="currentColor" />
                        Next-Gen School Management Ecosystem
                    </div>

                    <h1 style={{ fontSize: '3.5rem', fontWeight: '800', lineHeight: '1.2', marginBottom: '1.5rem', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Empowering Digital <br /> Educational <span style={{ background: 'linear-gradient(to right, #6366f1, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Excellence</span>
                    </h1>

                    <p style={{ fontSize: '1.1rem', color: '#94a3b8', marginBottom: '3.5rem', lineHeight: '1.7' }}>
                        A comprehensive PRIME professional suite bridging Principals, Teachers, and Parents for a seamless academic experience.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <InfoCard
                            icon={Layout}
                            title="Principal Portal"
                            description="Deep analytical insights, automated finance tracking, and strategic academic oversight."
                            color="#4f46e5"
                        />
                        <InfoCard
                            icon={UserCheck}
                            title="Teacher App"
                            description="Digital attendance reports, instant exam processing, and daily teaching feeds."
                            color="#8b5cf6"
                        />
                        <InfoCard
                            icon={Users}
                            title="Parents App"
                            description="Real-time performance tracking, history fees ledger, and direct branding."
                            color="#06b6d4"
                        />
                        <InfoCard
                            icon={Award}
                            title="Premium Branding"
                            description="Professional ecosystem customized for your school's unique identity."
                            color="#ec4899"
                        />
                    </div>
                </div>
            </div>

            {/* Right Content: Login Section */}
            <div style={{
                flex: 0.8,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '2rem',
                zIndex: 10,
                background: '#020617'
            }} className="login-form-section">
                <div style={{ width: '100%', maxWidth: '400px' }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2.5rem',
                        marginBottom: '6rem'
                    }}>
                        <svg
                            width="380"
                            height="200"
                            viewBox="0 0 320 160"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <defs>
                                <linearGradient id="iconGradient" x1="160" y1="5" x2="160" y2="85" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#818cf8" />
                                    <stop offset="1" stopColor="#4f46e5" />
                                </linearGradient>
                            </defs>

                            {/* Modern Prime Emblem (Centered at 160) */}
                            {/* Outer Structure */}
                            <path
                                d="M160 5L195 25V65L160 85L125 65V25L160 5Z"
                                stroke="url(#iconGradient)"
                                strokeWidth="3"
                                strokeLinejoin="round"
                                opacity="0.6"
                            />

                            {/* Depth Lines */}
                            <path d="M160 5V45L195 25" stroke="white" strokeWidth="1.2" strokeOpacity="0.1" />
                            <path d="M160 85V45L125 65" stroke="white" strokeWidth="1.2" strokeOpacity="0.1" />
                            <path d="M125 25L160 45L195 65" stroke="white" strokeWidth="1.2" strokeOpacity="0.1" />

                            {/* Central Nexus Core */}
                            <path
                                d="M160 25L180 37V53L160 65L140 53V37L160 25Z"
                                fill="white"
                                style={{ filter: 'drop-shadow(0 0 10px rgba(129, 140, 248, 0.5))' }}
                            />
                            <path
                                d="M160 32L173 39V51L160 58L147 51V39L160 32Z"
                                fill="#020617"
                            />
                            <circle cx="160" cy="45" r="4" fill="#818cf8" />

                            {/* Typography: MAI SMS */}
                            <text
                                x="160"
                                y="132"
                                fill="white"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontWeight: '900',
                                    fontSize: '46px',
                                    letterSpacing: '0.12em'
                                }}
                                textAnchor="middle"
                            >
                                MAI SMS
                            </text>

                            {/* Typography: Subtitle */}
                            <text
                                x="160"
                                y="158"
                                fill="#94a3b8"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontWeight: '600',
                                    fontSize: '11px',
                                    letterSpacing: '0.5em',
                                    textTransform: 'uppercase'
                                }}
                                textAnchor="middle"
                            >
                                School Management System
                            </text>
                        </svg>

                        <div style={{ textAlign: 'center' }}>
                            <h2 style={{ fontSize: '2.25rem', fontWeight: '800', color: 'white', marginBottom: '0.25rem' }}>Principal Access</h2>
                            <p style={{ color: '#64748b', fontSize: '1rem' }}>Securely login to your management portal</p>
                        </div>
                    </div>

                    {error && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            padding: '1rem',
                            borderRadius: '16px',
                            marginBottom: '2rem',
                            fontSize: '0.9rem',
                            display: 'flex',
                            gap: '0.75rem'
                        }}>
                            <div style={{ fontWeight: '700' }}>!</div>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ position: 'relative' }}>
                            <Mail style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} size={20} />
                            <input
                                type="email"
                                style={{
                                    width: '100%',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '16px',
                                    padding: '1.1rem 1.1rem 1.1rem 3.5rem',
                                    color: 'white',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.3s ease'
                                }}
                                className="login-input"
                                placeholder="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div style={{ position: 'relative' }}>
                            <Lock style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} size={20} />
                            <input
                                type="password"
                                style={{
                                    width: '100%',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '16px',
                                    padding: '1.1rem 1.1rem 1.1rem 3.5rem',
                                    color: 'white',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.3s ease'
                                }}
                                className="login-input"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                background: 'linear-gradient(to right, #4f46e5, #6366f1)',
                                border: 'none',
                                borderRadius: '16px',
                                padding: '1.1rem',
                                color: 'white',
                                fontSize: '1.05rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.75rem',
                                boxShadow: '0 10px 20px -6px rgba(79, 70, 229, 0.5)',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={24} /> : (
                                <>
                                    Sign In Portal
                                    <ArrowRight size={20} />
                                </>
                            )}
                        </button>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                        <p style={{ color: '#64748b' }}>
                            System issues? <a href="mailto:support@school.com" style={{ color: '#818cf8', fontWeight: '700', textDecoration: 'none' }}>Contact Support</a>
                        </p>
                    </div>
                </div>
            </div>

            {/* Custom Styles */}
            <style>
                {`
                    @media (max-width: 1024px) {
                        .desktop-info-section { display: none !important; }
                        .login-form-section { flex: 1 !important; }
                    }
                    .hover-lift:hover {
                        transform: translateY(-8px);
                        background: rgba(255, 255, 255, 0.05) !important;
                        border-color: rgba(255, 255, 255, 0.1) !important;
                    }
                    .login-input:focus {
                        border-color: rgba(99, 102, 241, 0.5) !important;
                        background: rgba(255, 255, 255, 0.04) !important;
                        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .animate-fade-in-up {
                        animation: slideUp 0.6s ease-out forwards;
                    }
                `}
            </style>
        </div>
    );
};

export default Login;
