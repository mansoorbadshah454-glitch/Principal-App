import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Shield, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
// import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

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
            console.log("Attempting standard login...");
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
                    setError('System Access Denied: Your school system has been stopped by the Super Admin. Please contact support.');
                    return;
                }

                // SAVE SESSION for persistence (Required for Parents.jsx and other modules)
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

            // Step 2: Fallback - Manual Bypass Check
            // Find user in global_users by email
            try {
                const q = query(collection(db, "global_users"), where("email", "==", normalizedEmail));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const userData = querySnapshot.docs[0].data();
                    const schoolId = userData.schoolId;
                    const uid = userData.uid;

                    // Now check the school registry for the manual password
                    const schoolUserRef = doc(db, `schools/${schoolId}/users`, uid);
                    const schoolUserDoc = await getDoc(schoolUserRef);

                    if (schoolUserDoc.exists()) {
                        const storedManualPassword = schoolUserDoc.data().manualPassword;

                        if (storedManualPassword && storedManualPassword === password) {
                            console.log("Manual Bypass Success!");
                            // Since we can't log in to Firebase Auth without the real password, 
                            // we'll use a local session flag for this session. 
                            // Note: For a real production app, you'd use a Cloud Function to handle this properly.
                            // Check school status before allowing manual bypass
                            const schoolSnap = await getDoc(doc(db, "schools", schoolId));
                            if (schoolSnap.exists() && schoolSnap.data().status === 'suspended') {
                                setError('System Access Denied: Your school system has been stopped by the Super Admin.');
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

    const handleMigration = async () => {
        alert("Migration disabled temporarily for debugging.");
        // if (!window.confirm("Run Account Migration? This will fix login for existing users.")) return;
        // setLoading(true);
        // try {
        //     const migrate = httpsCallable(functions, 'adminMigrateUsers');
        //     const result = await migrate({ secret: "migration_secret_123" });
        //     alert(`Migration Complete! Fixed ${result.data.migrated} accounts. You can now login.`);
        // } catch (err) {
        //     console.error(err);
        //     alert("Migration Failed: " + err.message);
        // } finally {
        //     setLoading(false);
        // }
    };

    return (
        <div className="login-page" style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            position: 'fixed',
            top: 0,
            left: 0,
            overflow: 'hidden',
            fontFamily: "'Outfit', sans-serif"
        }}>
            {/* Ambient Background Glows */}
            <div style={{ position: 'absolute', width: '400px', height: '400px', background: '#4f46e5', filter: 'blur(150px)', opacity: 0.15, top: '5%', left: '5%' }}></div>
            <div style={{ position: 'absolute', width: '400px', height: '400px', background: '#06b6d4', filter: 'blur(150px)', opacity: 0.15, bottom: '5%', right: '5%' }}></div>

            <div className="card animate-fade-in-up" style={{
                width: '90%',
                maxWidth: '420px',
                padding: '2.5rem',
                background: 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                position: 'relative',
                zIndex: 10
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div className="brand-icon" style={{ margin: '0 auto 1.25rem', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', borderRadius: '16px' }}>
                        <Shield color="white" size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: 'white' }}>Principal Portal</h1>
                    <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Welcome back! Please sign in.</p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        padding: '0.875rem',
                        borderRadius: '12px',
                        marginBottom: '1.5rem',
                        fontSize: '0.85rem',
                        textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#94a3b8', marginLeft: '0.2rem' }}>Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <Mail style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} size={18} />
                            <input
                                type="email"
                                className="input-field"
                                style={{
                                    width: '100%',
                                    padding: '0.8rem 1rem 0.8rem 3rem',
                                    background: 'rgba(15, 23, 42, 0.6)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    color: 'white',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.3s ease'
                                }}
                                placeholder="name@school.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#94a3b8', marginLeft: '0.2rem' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} size={18} />
                            <input
                                type="password"
                                className="input-field"
                                style={{
                                    width: '100%',
                                    padding: '0.8rem 1rem 0.8rem 3rem',
                                    background: 'rgba(15, 23, 42, 0.6)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    color: 'white',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.3s ease'
                                }}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                        style={{
                            width: '100%',
                            padding: '0.9rem',
                            marginTop: '0.5rem',
                            justifyContent: 'center',
                            borderRadius: '12px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            border: 'none',
                            color: 'white',
                            background: 'linear-gradient(135deg, #4f46e5, #4338ca)'
                        }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : (
                            <>
                                Sign In
                                <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                        Forgot password? <a href="#" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: '600' }}>Contact Support</a>
                    </p>
                    <button
                        onClick={handleMigration}
                        style={{ marginTop: '1rem', background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        (Admin) Fix Connection Issues
                    </button>
                    <div style={{ marginTop: '0.5rem', color: '#475569', fontSize: '0.7rem' }}>
                        ver: Blaze-Silo-1.0
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
