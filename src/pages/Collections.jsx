import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Users, ChevronRight, Ban, CheckCircle, Plus, Trash2, X, CheckSquare, Square } from 'lucide-react';
import { db, auth } from '../firebase';
import {
    collection, onSnapshot, query, doc, updateDoc, deleteField, setDoc, getDoc, deleteDoc
} from 'firebase/firestore';

// --- Components ---

const ActionModal = ({ isOpen, onClose, onSave, classes }) => {
    if (!isOpen) return null;

    const [name, setName] = useState('');
    const [targetAll, setTargetAll] = useState(true);
    const [selectedClasses, setSelectedClasses] = useState([]);

    const handleSubmit = () => {
        if (!name.trim()) return;
        onSave({
            name: name.trim(),
            targetAll,
            targetClasses: targetAll ? [] : selectedClasses
        });
        setName('');
        setTargetAll(true);
        setSelectedClasses([]);
        onClose();
    };

    const toggleClass = (classId) => {
        setSelectedClasses(prev =>
            prev.includes(classId)
                ? prev.filter(id => id !== classId)
                : [...prev, classId]
        );
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
            <div className="card" style={{
                width: '90%', maxWidth: '500px', background: 'white', borderRadius: '24px',
                padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>New Collection Action</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Action Name</label>
                    <input
                        type="text"
                        placeholder="e.g. App Payment, Uniform Fee, Fine"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
                            border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none',
                            transition: 'border-color 0.2s',
                            background: '#f8fafc'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Target Classes</label>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button
                            onClick={() => setTargetAll(true)}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid',
                                borderColor: targetAll ? 'var(--primary)' : '#e2e8f0',
                                background: targetAll ? 'var(--primary)' : 'white',
                                color: targetAll ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                            }}
                        >
                            All Classes
                        </button>
                        <button
                            onClick={() => setTargetAll(false)}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid',
                                borderColor: !targetAll ? 'var(--primary)' : '#e2e8f0',
                                background: !targetAll ? 'var(--primary)' : 'white',
                                color: !targetAll ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                            }}
                        >
                            Select Classes
                        </button>
                    </div>

                    {!targetAll && (
                        <div style={{
                            maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0',
                            borderRadius: '12px', padding: '0.5rem'
                        }}>
                            {classes.map(cls => (
                                <div
                                    key={cls.id}
                                    onClick={() => toggleClass(cls.id)}
                                    style={{
                                        padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        cursor: 'pointer', borderRadius: '8px',
                                        background: selectedClasses.includes(cls.id) ? '#eff6ff' : 'transparent'
                                    }}
                                >
                                    {selectedClasses.includes(cls.id) ? (
                                        <CheckSquare size={20} color="var(--primary)" />
                                    ) : (
                                        <Square size={20} color="#cbd5e1" />
                                    )}
                                    <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>{cls.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none',
                            background: '#f1f5f9', color: 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        style={{
                            padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none',
                            background: 'var(--primary)', color: 'white', fontWeight: '600', cursor: 'pointer',
                            opacity: name.trim() ? 1 : 0.5
                        }}
                    >
                        Create Action
                    </button>
                </div>
            </div>
        </div>
    );
};

const CollectionClassCard = ({ cls, currentAction, schoolId }) => {
    const navigate = useNavigate();
    const [monthlyStats, setMonthlyStats] = useState({ paid: 0, unpaid: 0, total: 0, loading: true });
    const [actionStats, setActionStats] = useState({ paid: 0, unpaid: 0, total: 0, loading: true });

    // Is this class targeted by the current action?
    const isTargeted = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(cls.id)));

    // Fetch Real-time Stats from Database
    useEffect(() => {
        if (!schoolId || !cls.id) {
            setMonthlyStats({ paid: 0, unpaid: 0, total: 0, loading: false });
            setActionStats({ paid: 0, unpaid: 0, total: 0, loading: false });
            return;
        }

        const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let monthlyPaid = 0;
            let monthlyUnpaid = 0;
            let actionPaid = 0;
            let actionUnpaid = 0;

            snapshot.docs.forEach(doc => {
                const data = doc.data();

                // Count Monthly Fee Status
                const monthlyStatus = data.monthlyFeeStatus || 'unpaid';
                if (monthlyStatus === 'paid') {
                    monthlyPaid++;
                } else {
                    monthlyUnpaid++;
                }

                // Count Action Fee Status (if targeted)
                if (isTargeted && currentAction) {
                    const actionStatus = data.customPayments?.[currentAction.name]?.status;
                    if (actionStatus === 'paid') {
                        actionPaid++;
                    } else {
                        actionUnpaid++;
                    }
                }
            });

            setMonthlyStats({
                paid: monthlyPaid,
                unpaid: monthlyUnpaid,
                total: snapshot.size,
                loading: false
            });

            setActionStats({
                paid: actionPaid,
                unpaid: actionUnpaid,
                total: snapshot.size,
                loading: false
            });
        });

        return () => unsubscribe();
    }, [schoolId, cls.id, currentAction, isTargeted]);


    // Dynamic Theme Color
    const seed = cls.id.charCodeAt(0) || 123;
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? 'var(--primary)' : 'var(--secondary)';

    const StatsRow = ({ label, paid, unpaid, colorOverride }) => (
        <div style={{
            display: 'flex', gap: '0', padding: '0',
            background: 'white', borderRadius: '12px', border: '1px solid #dbeafe',
            overflow: 'hidden'
        }}>
            <div style={{ flex: 1, padding: '0.75rem', borderRight: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                    <CheckCircle size={16} />
                </div>
                <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>
                        {label} Paid
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                        {paid}
                    </span>
                </div>
            </div>
            <div style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                    <Ban size={16} />
                </div>
                <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>
                        {label} Unpaid
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                        {unpaid}
                    </span>
                </div>
            </div>
        </div>
    );

    return (
        <div
            onClick={() => navigate(`/collections/${cls.id}`)}
            className="card" style={{
                padding: '0',
                overflow: 'hidden',
                border: isTargeted ? '2px solid var(--primary)' : '1px solid #dbeafe',
                position: 'relative',
                background: '#eff6ff',
                boxShadow: isTargeted ? '0 10px 20px -5px rgba(99, 102, 241, 0.2)' : '0 4px 6px -1px rgba(59, 130, 246, 0.1)',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
            }}>
            {/* Decoration Strip */}
            <div style={{ height: '6px', width: '100%', background: `linear-gradient(90deg, ${themeColor}, transparent)` }} />

            <div style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>{cls.name}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{cls.teacher || 'No Teacher'}</p>
                    </div>
                    {isTargeted ? (
                        <div style={{
                            padding: '0.25rem 0.75rem', background: 'var(--primary)', borderRadius: '20px',
                            fontSize: '0.7rem', fontWeight: '600', color: 'white',
                            boxShadow: '0 2px 4px rgba(99, 102, 241, 0.3)'
                        }}>
                            Action Active
                        </div>
                    ) : (
                        <div style={{
                            padding: '0.25rem 0.75rem', background: 'white', borderRadius: '20px',
                            fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)',
                            border: '1px solid #e2e8f0'
                        }}>
                            Standard
                        </div>
                    )}
                </div>

                {/* Total Students Badge */}
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.75rem', background: 'white',
                        borderRadius: '8px', border: '1px solid #e2e8f0',
                        fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)'
                    }}>
                        <Users size={16} color="var(--primary)" />
                        <span>Total Students: {monthlyStats.total}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* 1. Monthly Fee Stats */}
                    <StatsRow label="Monthly Fee" paid={monthlyStats.paid} unpaid={monthlyStats.unpaid} />

                    {/* 2. Action Stats (Calculated & Stacked) */}
                    {isTargeted && (
                        <div className="animate-fade-in-up">
                            <StatsRow label={currentAction.name} paid={actionStats.paid} unpaid={actionStats.unpaid} />
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                        fontSize: '0.8rem', color: themeColor, fontWeight: '600',
                        display: 'flex', alignItems: 'center', gap: '0.25rem'
                    }}>
                        View Details <ChevronRight size={16} />
                    </span>
                </div>
            </div>
        </div>
    );
};

const Collections = () => {
    const [classes, setClasses] = useState([]);
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentAction, setCurrentAction] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // Helper for Sort
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // 1. Init School ID
    // 1. Init School ID & Auth
    useEffect(() => {
        let isMounted = true;
        const resolveUser = async () => {
            // Priority 1: Firebase Auth (Real source of truth for DB permissions)
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (!isMounted) return;

                if (user) {
                    try {
                        const token = await user.getIdTokenResult();
                        if (token.claims.schoolId) {
                            console.log("Resolved School ID from Auth:", token.claims.schoolId);
                            setSchoolId(token.claims.schoolId);
                            setLoading(false);
                            return;
                        }
                    } catch (e) {
                        console.error("Claims error", e);
                    }
                }

                // Priority 2: Manual Session (Fallback/Dev)
                const manualSession = localStorage.getItem('manual_session');
                if (manualSession) {
                    try {
                        const userData = JSON.parse(manualSession);
                        if (userData.schoolId) {
                            console.log("Resolved School ID from Manual Session:", userData.schoolId);
                            setSchoolId(userData.schoolId);
                        }
                    } catch (e) {
                        console.error("Manual session parse error", e);
                    }
                }
                setLoading(false);
            });
            return () => unsubscribe();
        };
        resolveUser();
        return () => { isMounted = false; };
    }, []);

    // 2. Fetch Classes & Action
    useEffect(() => {
        if (!schoolId) return;

        // Listen to Classes
        const qClasses = query(collection(db, `schools/${schoolId}/classes`));
        const unsubClasses = onSnapshot(qClasses, (snapshot) => {
            const classesData = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                // Filter out the special settings document
                .filter(doc => doc.id !== 'action_metadata');

            classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(classesData);
            setLoading(false);
        });

        // Listen to Collection Action (Stored in 'classes' collection to fit existing Firestore Rules)
        const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
        const unsubAction = onSnapshot(actionRef, (docSnap) => {
            if (docSnap.exists()) {
                setCurrentAction(docSnap.data());
            } else {
                setCurrentAction(null);
            }
        }, (error) => {
            console.error("Error listening to action:", error);
        });

        return () => {
            unsubClasses();
            unsubAction();
        };

    }, [schoolId]);

    const handleSaveAction = async (actionData) => {
        // Check for Manual Bypass Isolation
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode.\n\nDatabase writes are disabled for security. Please initialize a real session (Login with standard Password) to create actions.");
                return;
            }
        }

        if (!schoolId || !auth.currentUser) {
            console.error("Auth User or School ID is missing");
            alert("Authentication Error: You must be logged in with a valid account (not a bypass) to perform this action.");
            return;
        }

        // Debug Log
        console.log("Attempting to save action:", actionData);
        console.log("Current SchoolID:", schoolId);
        console.log("Current Auth User:", auth.currentUser?.uid);

        try {
            // Write to 'classes' collection which is whitelisted for Principals
            const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
            await setDoc(actionRef, {
                ...actionData,
                type: 'system_action_metadata', // Flag to identify it if needed
                createdAt: new Date().toISOString()
            });
            console.log("Action saved successfully to classes/action_metadata");
        } catch (error) {
            console.error("Error creating action:", error);
            alert(`Failed to create action: ${error.message}\nCheck console for details.`);
        }
    };

    const handleDeleteAction = async () => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Writes are disabled.");
                return;
            }
        }

        if (!schoolId || !auth.currentUser) return;
        if (!window.confirm("Are you sure you want to delete this action? Past payment records will be preserved but hidden.")) return;

        try {
            const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
            await deleteDoc(actionRef);
        } catch (error) {
            console.error("Error deleting action:", error);
            alert("Failed to delete action");
        }
    };

    // 3. Global Stats Aggregation
    const [globalStats, setGlobalStats] = useState({
        monthlyPaid: 0,
        monthlyUnpaid: 0,
        actionPaid: 0,
        actionUnpaid: 0,
        loading: true
    });

    useEffect(() => {
        if (loading || !schoolId || classes.length === 0) {
            console.log("[Collections] Waiting for initialization - School:", schoolId, "Classes count:", classes.length);
            return;
        }

        console.log("[Collections] Starting Global Aggregation for school:", schoolId);

        const unsubscribers = [];
        const classStatsMap = new Map();

        const updateAggregates = () => {
            let mPaid = 0;
            let mUnpaid = 0;
            let aPaid = 0;
            let aUnpaid = 0;

            classStatsMap.forEach((stats, cid) => {
                mPaid += stats.monthlyPaid;
                mUnpaid += stats.monthlyUnpaid;
                aPaid += stats.actionPaid;
                aUnpaid += stats.actionUnpaid;
            });

            console.log(`[Collections] TOTAL Aggregated - Monthly Paid: ${mPaid}, Unpaid: ${mUnpaid}`);

            setGlobalStats({
                monthlyPaid: mPaid,
                monthlyUnpaid: mUnpaid,
                actionPaid: aPaid,
                actionUnpaid: aUnpaid,
                loading: false
            });
        };

        classes.forEach(cls => {
            const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsub = onSnapshot(q, (snapshot) => {
                let cMonthlyPaid = 0;
                let cMonthlyUnpaid = 0;
                let cActionPaid = 0;
                let cActionUnpaid = 0;

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const monthlyStatus = data.monthlyFeeStatus || 'unpaid';
                    if (monthlyStatus === 'paid') cMonthlyPaid++;
                    else cMonthlyUnpaid++;

                    if (currentAction) {
                        const isTargeted = currentAction.targetAll ||
                            (currentAction.targetClasses && currentAction.targetClasses.includes(cls.id));

                        if (isTargeted) {
                            const actionStatus = data.customPayments?.[currentAction.name]?.status;
                            if (actionStatus === 'paid') cActionPaid++;
                            else cActionUnpaid++;
                        }
                    }
                });

                console.log(`[Collections] Class ${cls.name} [${cls.id}] Snapshot: ${snapshot.size} students, Paid: ${cMonthlyPaid}`);

                classStatsMap.set(cls.id, {
                    monthlyPaid: cMonthlyPaid,
                    monthlyUnpaid: cMonthlyUnpaid,
                    actionPaid: cActionPaid,
                    actionUnpaid: cActionUnpaid
                });
                updateAggregates();
            });
            unsubscribers.push(unsub);
        });

        return () => {
            console.log("[Collections] Cleaning up global listeners");
            unsubscribers.forEach(unsub => unsub());
        };

    }, [classes, currentAction, schoolId, loading]);
    // Re-run if classes list or action changes



    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Fee Collections
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Overview of student fee payments across all classes</p>
                </div>

                {/* Action Controls */}
                <div>
                    {currentAction ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div>
                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Current Action</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--primary)' }}>{currentAction.name}</span>
                            </div>
                            <div style={{ height: '30px', width: '1px', background: '#e2e8f0' }} />
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                    {currentAction.targetAll ? 'All Classes' : `${currentAction.targetClasses?.length || 0} Classes`}
                                </span>
                            </div>
                            <button
                                onClick={handleDeleteAction}
                                style={{
                                    padding: '0.5rem', borderRadius: '50%', border: 'none',
                                    background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '0.5rem'
                                }}
                                title="Delete Action"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowModal(true)}
                            className="btn-primary" // Assuming global class exists, or use inline
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem', borderRadius: '12px',
                                background: 'var(--primary)', color: 'white', border: 'none',
                                fontWeight: '600', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
                            }}
                        >
                            <Plus size={20} />
                            New Action
                        </button>
                    )}
                </div>
            </div>

            {/* Global Stats Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                {/* Monthly Fee Cards */}
                <div className="card" style={{ padding: '1.25rem', border: '1px solid #dbeafe', background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#dcfce7', color: '#16a34a' }}>
                            <CheckCircle size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Monthly Fee Paid</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-main)', marginLeft: '0.25rem' }}>
                        {globalStats.monthlyPaid.toLocaleString()}
                    </span>
                </div>

                <div className="card" style={{ padding: '1.25rem', border: '1px solid #fee2e2', background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#fee2e2', color: '#dc2626' }}>
                            <Ban size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Monthly Fee Unpaid</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-main)', marginLeft: '0.25rem' }}>
                        {globalStats.monthlyUnpaid.toLocaleString()}
                    </span>
                </div>

                {/* Additional Action Fee Cards */}
                <div className="card" style={{ padding: '1.25rem', border: '1px solid #d1fae5', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: currentAction ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#059669', color: 'white' }}>
                            <Wallet size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#064e3b' }}>
                            {currentAction ? `${currentAction.name} Paid` : 'No Action Active'}
                        </span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#065f46', marginLeft: '0.25rem' }}>
                        {globalStats.actionPaid.toLocaleString()}
                    </span>
                </div>

                <div className="card" style={{ padding: '1.25rem', border: '1px solid #fecaca', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: currentAction ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#dc2626', color: 'white' }}>
                            <Wallet size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#7f1d1d' }}>
                            {currentAction ? `${currentAction.name} Unpaid` : 'No Action Active'}
                        </span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#991b1b', marginLeft: '0.25rem' }}>
                        {globalStats.actionUnpaid.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Classes Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading Classes...</div>
            ) : (
                <>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '1.5rem' }}>
                        {currentAction ? `Collection Status: ${currentAction.name}` : 'All Classes'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {classes.map(cls => (
                            <CollectionClassCard
                                key={cls.id}
                                cls={cls}
                                currentAction={currentAction}
                                schoolId={schoolId}
                            />
                        ))}
                    </div>
                </>
            )}

            <ActionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleSaveAction}
                classes={classes}
            />
        </div>
    );
};

export default Collections;
