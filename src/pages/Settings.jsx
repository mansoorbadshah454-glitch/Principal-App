

import React, { useState, useEffect, useMemo } from 'react';
import {
    Camera, Save, Loader2, Shield, Copy, CheckCircle2, Clock, Building, Briefcase,
    Plus, Trash2, Users, Info, BookOpen, Sparkles, Bot, Key, ExternalLink,
    CreditCard, Landmark, Upload, Eye, FileText, AlertCircle, AlertTriangle, ArrowRight,
    Smartphone, RefreshCw, X, Check, Search, Calendar, LayoutGrid, ListFilter,
    CheckCheck, Ban, ArrowUpRight
} from 'lucide-react';
import { db, storage, auth } from '../firebase';
import {
    doc, getDoc, setDoc, onSnapshot, collection, query, where, addDoc, serverTimestamp, deleteDoc, writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import BulkUploadCard from '../components/BulkUploadCard';
import UploadSyllabusTab from '../components/UploadSyllabusTab';
import CachedImage from '../components/CachedImage';
import { compressImage } from '../utils/imageCompressor';
import PaymentMethodLogo, { getPaymentMethodTheme } from '../components/PaymentLogos';

const Settings = () => {
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [activeTab, setActiveTab] = useState(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const tabParam = params.get('tab');
            if (tabParam && ['details', 'timing', 'accounts', 'ai', 'billing', 'import', 'syllabus'].includes(tabParam)) {
                return tabParam;
            }
        } catch (e) {}
        return 'details';
    });

    // Monthly Due Date & Suspension Policy from Super Admin
    const [billingPolicy, setBillingPolicy] = useState({
        dueDay: 5,
        graceDays: 2,
        enabled: true,
        customMessage: ''
    });
    
    const [schoolData, setSchoolData] = useState({
        name: '',
        profileImage: '',
        address: '',
        email: '',
        phone: '',
        landline: '',
        emergencyContact: '',
        aboutText: '',
        teacherStartTime: '08:00',
        teacherEndTime: '14:00',
        breakStartTime: '10:30',
        breakEndTime: '11:00',
        schoolStartTime: '08:00',
        schoolEndTime: '14:00'
    });
    
    const [bankAccounts, setBankAccounts] = useState([]);
    const [previewImage, setPreviewImage] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [feeSettings, setFeeSettings] = useState({ dueDate: '', penaltyAmount: '' });
    const [aiSettings, setAiSettings] = useState({ apiKey: '', botName: 'Principal AI Copilot' });
    const [savingAi, setSavingAi] = useState(false);
    const [aiSavedSuccess, setAiSavedSuccess] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errors, setErrors] = useState({});
    const [fetchError, setFetchError] = useState(false);

    // Subscription & SaaS Billing States
    const [subscriptionInfo, setSubscriptionInfo] = useState({
        monthlyFee: 5000,
        yearlyFee: 50000,
        billingCycle: 'monthly',
        paymentStatus: 'unpaid',
        paidUntil: null,
        status: 'active'
    });
    const [officialPlatformAccounts, setOfficialPlatformAccounts] = useState([]);
    const [billingSubmissions, setBillingSubmissions] = useState([]);
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const [slipFile, setSlipFile] = useState(null);
    const [slipPreview, setSlipPreview] = useState(null);
    const [trxId, setTrxId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [selectedCycle, setSelectedCycle] = useState('monthly');
    const [copiedField, setCopiedField] = useState(null);
    const [viewingSlipModalUrl, setViewingSlipModalUrl] = useState(null);

    // Dynamically extract official receiving accounts as selectable payment methods
    const availablePaymentMethods = useMemo(() => {
        if (!officialPlatformAccounts || officialPlatformAccounts.length === 0) {
            return [{ id: 'Bank Transfer', name: 'Bank Transfer' }];
        }
        return officialPlatformAccounts
            .filter(acc => acc && acc.bankName && acc.bankName.trim() !== '')
            .map(acc => ({
                id: acc.bankName.trim(),
                name: acc.bankName.trim(),
                accountTitle: acc.accountTitle || '',
                accountNumber: acc.accountNumber || ''
            }));
    }, [officialPlatformAccounts]);

    // Ensure paymentMethod is automatically synchronized with available accounts
    useEffect(() => {
        if (availablePaymentMethods.length > 0) {
            const exists = availablePaymentMethods.some(
                m => m.id.toLowerCase() === (paymentMethod || '').toLowerCase()
            );
            if (!exists) {
                setPaymentMethod(availablePaymentMethods[0].id);
            }
        }
    }, [availablePaymentMethods, paymentMethod]);

    // Dedicated Sub-Tab & History Filtering States
    const [billingSubTab, setBillingSubTab] = useState('pay'); // 'pay' | 'history'
    const [historyYearFilter, setHistoryYearFilter] = useState('all');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all'); // 'all' | 'approved' | 'pending' | 'rejected'
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [historyViewMode, setHistoryViewMode] = useState('cards'); // 'cards' | 'table'

    // Dynamically extract all years from submissions (e.g. 2026, 2025...)
    const availableYears = useMemo(() => {
        const years = new Set();
        billingSubmissions.forEach(sub => {
            let dateObj = null;
            if (sub.submittedAt?.toDate) {
                dateObj = sub.submittedAt.toDate();
            } else if (sub.submittedAt) {
                dateObj = new Date(sub.submittedAt);
            }
            if (dateObj && !isNaN(dateObj.getFullYear())) {
                years.add(dateObj.getFullYear().toString());
            }
        });
        years.add(new Date().getFullYear().toString());
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [billingSubmissions]);

    // Computed filtered submissions
    const filteredSubmissions = useMemo(() => {
        return billingSubmissions.filter(sub => {
            let dateObj = null;
            if (sub.submittedAt?.toDate) {
                dateObj = sub.submittedAt.toDate();
            } else if (sub.submittedAt) {
                dateObj = new Date(sub.submittedAt);
            }
            const subYear = dateObj && !isNaN(dateObj.getFullYear()) ? dateObj.getFullYear().toString() : '';

            // Year filter
            if (historyYearFilter !== 'all' && subYear !== historyYearFilter) {
                return false;
            }

            // Status filter
            if (historyStatusFilter !== 'all') {
                if (historyStatusFilter === 'pending' && sub.status !== 'pending') return false;
                if (historyStatusFilter === 'approved' && sub.status !== 'approved') return false;
                if (historyStatusFilter === 'rejected' && sub.status !== 'rejected') return false;
            }

            // Search query filter
            if (historySearchQuery.trim()) {
                const q = historySearchQuery.trim().toLowerCase();
                const tid = (sub.transactionId || '').toLowerCase();
                const method = (sub.paymentMethod || '').toLowerCase();
                const cycle = (sub.cycle || '').toLowerCase();
                if (!tid.includes(q) && !method.includes(q) && !cycle.includes(q)) {
                    return false;
                }
            }

            return true;
        });
    }, [billingSubmissions, historyYearFilter, historyStatusFilter, historySearchQuery]);

    // Financial KPI stats for history tab
    const historyStats = useMemo(() => {
        let totalPaid = 0;
        let approvedCount = 0;
        let pendingCount = 0;
        let rejectedCount = 0;

        billingSubmissions.forEach(sub => {
            if (sub.status === 'approved') {
                totalPaid += Number(sub.amount || 0);
                approvedCount++;
            } else if (sub.status === 'rejected') {
                rejectedCount++;
            } else {
                pendingCount++;
            }
        });

        return { totalPaid, approvedCount, pendingCount, rejectedCount, totalCount: billingSubmissions.length };
    }, [billingSubmissions]);

    const handleCopy = () => {
        if (schoolId) {
            navigator.clipboard.writeText(schoolId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleCopyField = (text, key) => {
        if (text) {
            navigator.clipboard.writeText(text);
            setCopiedField(key);
            setTimeout(() => setCopiedField(null), 2000);
        }
    };

    // Demo Account Detection & Injection States
    const [injectingDemo, setInjectingDemo] = useState(false);
    const [clearingDemo, setClearingDemo] = useState(false);

    // Is this a demo account? Check local link (localhost/127.0.0.1), schoolId, schoolData.name, or session flags
    const isDemoAccount = useMemo(() => {
        // 1. Local environment check (localhost, 127.0.0.1, dev server port, local IP)
        const isLocalHost = typeof window !== 'undefined' && (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '[::1]' ||
            window.location.hostname.includes('192.168.') ||
            window.location.hostname.includes('10.') ||
            window.location.port !== ''
        );

        const sId = (schoolId || '').toLowerCase();
        const sName = (schoolData.name || '').toLowerCase();
        const sEmail = (schoolData.email || '').toLowerCase();
        const forceDemo = typeof window !== 'undefined' && (
            localStorage.getItem('force_demo_billing_mode') === 'true' ||
            localStorage.getItem('demo_mode') === 'true'
        );
        const isDemoDoc = Boolean(schoolData.isDemo || schoolData.isDemoSchool || schoolData.accountType === 'demo');

        return (
            isLocalHost ||
            forceDemo ||
            isDemoDoc ||
            sId.includes('demo') ||
            sName.includes('demo') ||
            sEmail.includes('demo') ||
            sId === 'demo_school' ||
            sId === 'demo' ||
            sId.includes('test')
        );
    }, [schoolId, schoolData.name, schoolData.email, schoolData.isDemo, schoolData.isDemoSchool, schoolData.accountType]);

    // Handle Dummy Data Injection for Demo Account
    const handleInjectDemoBillingData = async () => {
        let activeSchoolId = schoolId;
        if (!activeSchoolId) {
            try {
                const session = JSON.parse(localStorage.getItem('manual_session') || '{}');
                activeSchoolId = session.schoolId;
            } catch (e) {}
        }
        if (!activeSchoolId) activeSchoolId = 'demo_school';

        setInjectingDemo(true);
        try {
            const subsCol = collection(db, 'platform_subscriptions');
            const monthlyAmount = Number(subscriptionInfo.monthlyFee || 5000);
            const yearlyAmount = Number(subscriptionInfo.yearlyFee || 50000);

            // Switch to History sub-tab so principal immediately sees the records
            setBillingSubTab('history');

            // Realistic multi-year demo records
            const dummyRecords = [
                {
                    id: 'demo_rec_2026_1',
                    schoolId: activeSchoolId,
                    schoolName: schoolData.name || 'Demo Model School',
                    amount: monthlyAmount,
                    cycle: 'monthly',
                    paymentMethod: 'JazzCash',
                    transactionId: 'JC-98241052',
                    proofUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=900&auto=format&fit=crop&q=80',
                    status: 'approved',
                    reviewedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    reviewedBy: 'Super Admin',
                    submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    isDemoData: true
                },
                {
                    id: 'demo_rec_2026_2',
                    schoolId: activeSchoolId,
                    schoolName: schoolData.name || 'Demo Model School',
                    amount: monthlyAmount,
                    cycle: 'monthly',
                    paymentMethod: 'EasyPaisa',
                    transactionId: 'EP-44120931',
                    proofUrl: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=900&auto=format&fit=crop&q=80',
                    status: 'pending',
                    submittedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                    isDemoData: true
                },
                {
                    id: 'demo_rec_2025_1',
                    schoolId: activeSchoolId,
                    schoolName: schoolData.name || 'Demo Model School',
                    amount: yearlyAmount,
                    cycle: 'yearly',
                    paymentMethod: 'Meezan Bank',
                    transactionId: 'MB-77192834',
                    proofUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=900&auto=format&fit=crop&q=80',
                    status: 'approved',
                    reviewedAt: new Date('2025-11-15T10:30:00').toISOString(),
                    reviewedBy: 'Super Admin',
                    submittedAt: new Date('2025-11-14T14:20:00').toISOString(),
                    isDemoData: true
                },
                {
                    id: 'demo_rec_2025_2',
                    schoolId: activeSchoolId,
                    schoolName: schoolData.name || 'Demo Model School',
                    amount: monthlyAmount,
                    cycle: 'monthly',
                    paymentMethod: 'HBL',
                    transactionId: 'HBL-11029384',
                    proofUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=900&auto=format&fit=crop&q=80',
                    status: 'rejected',
                    rejectReason: 'Slip picture is blurry and transaction reference digits did not match bank statement.',
                    reviewedAt: new Date('2025-08-05T12:00:00').toISOString(),
                    reviewedBy: 'Super Admin',
                    submittedAt: new Date('2025-08-04T16:45:00').toISOString(),
                    isDemoData: true
                },
                {
                    id: 'demo_rec_2024_1',
                    schoolId: activeSchoolId,
                    schoolName: schoolData.name || 'Demo Model School',
                    amount: monthlyAmount,
                    cycle: 'monthly',
                    paymentMethod: 'JazzCash',
                    transactionId: 'JC-32091482',
                    proofUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=900&auto=format&fit=crop&q=80',
                    status: 'approved',
                    reviewedAt: new Date('2024-12-28T11:00:00').toISOString(),
                    reviewedBy: 'Super Admin',
                    submittedAt: new Date('2024-12-27T09:15:00').toISOString(),
                    isDemoData: true
                }
            ];

            // 1. Immediately cache in localStorage for 100% offline & permission-safe access
            localStorage.setItem(`demo_billing_subs_${activeSchoolId}`, JSON.stringify(dummyRecords));

            // 2. Immediately update state so UI renders instantly
            setBillingSubmissions(prev => {
                const nonDemo = prev.filter(p => !p.isDemoData && !p.id?.startsWith('demo_rec_'));
                return [...dummyRecords, ...nonDemo];
            });

            // 3. Try to sync to Firestore; if Firestore rules reject on cloud, catch gracefully!
            try {
                const subsCol = collection(db, 'platform_subscriptions');
                for (const rec of dummyRecords) {
                    const { id: _, ...dataToSave } = rec;
                    await addDoc(subsCol, {
                        ...dataToSave,
                        submittedAt: new Date(rec.submittedAt),
                        reviewedAt: rec.reviewedAt ? new Date(rec.reviewedAt) : null
                    });
                }
            } catch (fsErr) {
                console.warn('Firestore cloud sync notice (using local demo cache):', fsErr.message);
            }

            alert('✨ Demo Invoices & Slips successfully injected! You can now filter by year and inspect verification slips.');
        } catch (err) {
            console.error('Error injecting demo records:', err);
            alert('Failed to inject demo data: ' + err.message);
        } finally {
            setInjectingDemo(false);
        }
    };

    // Handle Clearing Injected Demo Records
    const handleClearDemoBillingData = async () => {
        let activeSchoolId = schoolId;
        if (!activeSchoolId) {
            try {
                const session = JSON.parse(localStorage.getItem('manual_session') || '{}');
                activeSchoolId = session.schoolId;
            } catch (e) {}
        }
        if (!activeSchoolId) activeSchoolId = 'demo_school';

        const confirmClear = window.confirm('Are you sure you want to remove all injected demo payment records?');
        if (!confirmClear) return;

        setClearingDemo(true);
        try {
            // 1. Clear local cache
            localStorage.removeItem(`demo_billing_subs_${activeSchoolId}`);

            // 2. Clear state immediately
            setBillingSubmissions(prev => prev.filter(s => !s.isDemoData && !s.id?.startsWith('demo_rec_')));

            // 3. Try to delete any Firestore demo documents
            try {
                const demoItems = billingSubmissions.filter(s => s.isDemoData && !s.id?.startsWith('demo_rec_'));
                for (const item of demoItems) {
                    await deleteDoc(doc(db, 'platform_subscriptions', item.id));
                }
            } catch (fsErr) {
                console.warn('Firestore clear notice:', fsErr.message);
            }

            alert('🧹 Injected demo payment records cleared successfully.');
        } catch (err) {
            console.error('Error clearing demo data:', err);
            alert('Failed to clear demo data: ' + err.message);
        } finally {
            setClearingDemo(false);
        }
    };

    useEffect(() => {
        const session = localStorage.getItem('manual_session');
        if (!session) {
            setInitialLoading(false);
            return;
        }

        const { schoolId: id } = JSON.parse(session);
        setSchoolId(id);

        let isMounted = true;

        // Fetch profile settings from settings/profile using onSnapshot
        const profileRef = doc(db, `schools/${id}/settings`, 'profile');
        const unsubProfile = onSnapshot(profileRef, async (profileSnap) => {
            if (!isMounted) return;
            
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                setSchoolData(prev => ({
                    ...prev,
                    ...data,
                    address: data.address || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    landline: data.landline || '',
                    emergencyContact: data.emergencyContact || '',
                    aboutText: data.aboutText || '',
                    teacherStartTime: data.teacherStartTime || '08:00',
                    teacherEndTime: data.teacherEndTime || '14:00',
                    breakStartTime: data.breakStartTime || '10:30',
                    breakEndTime: data.breakEndTime || '11:00',
                    schoolStartTime: data.schoolStartTime || '08:00',
                    schoolEndTime: data.schoolEndTime || '14:00'
                }));
                setFetchError(false);
            } else {
                // NEVER write to the DB automatically here to avoid cache wipe race conditions on deployment.
                // Just map safe local defaults to the UI. The DB will safely update when they press "Save".
                const defaultData = { 
                    name: 'My School', 
                    profileImage: '', 
                    aboutText: '', 
                    teacherStartTime: '08:00', 
                    teacherEndTime: '14:00', 
                    breakStartTime: '10:30', 
                    breakEndTime: '11:00', 
                    schoolStartTime: '08:00', 
                    schoolEndTime: '14:00' 
                };
                setSchoolData(prev => ({ ...prev, ...defaultData }));
                setFetchError(false);
            }
            setInitialLoading(false);
        }, (err) => {
            console.error("Error fetching profile settings:", err);
            setFetchError(true);
            setInitialLoading(false);
        });

        // Fetch banking settings from settings/banking using onSnapshot
        const bankingRef = doc(db, `schools/${id}/settings`, 'banking');
        const unsubBanking = onSnapshot(bankingRef, (bankingSnap) => {
            if (!isMounted) return;
            
            if (bankingSnap.exists()) {
                setBankAccounts(bankingSnap.data().accounts || []);
            }
        }, (err) => {
            console.error("Error fetching banking settings:", err);
        });

        // Fetch fee settings using onSnapshot
        const feeSettingsRef = doc(db, `schools/${id}/settings`, 'feeSettings');
        const unsubFeeSettings = onSnapshot(feeSettingsRef, (feeSnap) => {
            if (!isMounted) return;
            
            if (feeSnap.exists()) {
                setFeeSettings({
                    dueDate: feeSnap.data().dueDate || '',
                    penaltyAmount: feeSnap.data().penaltyAmount || ''
                });
            }
        }, (err) => {
            console.error("Error fetching fee settings:", err);
        });


        // Fetch AI settings using onSnapshot
        const aiRef = doc(db, `schools/${id}/settings`, 'ai');
        const unsubAi = onSnapshot(aiRef, (aiSnap) => {
            if (!isMounted) return;
            if (aiSnap.exists()) {
                const data = aiSnap.data();
                setAiSettings({
                    apiKey: data.apiKey || '',
                    botName: data.botName || 'Principal AI Copilot'
                });
            }
        }, (err) => {
            console.warn("AI settings listener warning:", err);
        });

        // 5. Fetch school subscription info & pricing terms
        const schoolDocRef = doc(db, 'schools', id);
        const unsubSchool = onSnapshot(schoolDocRef, (snap) => {
            if (!isMounted) return;
            if (snap.exists()) {
                const data = snap.data();
                setSubscriptionInfo({
                    monthlyFee: data.monthlySubscriptionFee ?? 5000,
                    yearlyFee: data.yearlySubscriptionFee ?? 50000,
                    billingCycle: data.billingCycle || 'monthly',
                    paymentStatus: data.paymentStatus || 'unpaid',
                    paidUntil: data.paidUntil || null,
                    status: data.status || 'active'
                });
                setSelectedCycle(data.billingCycle || 'monthly');
            }
        }, (err) => console.warn("School subscription doc notice:", err));

        // 6. Fetch official platform receiving accounts & due date policy (from Super Admin)
        const platformBillingRef = doc(db, 'system_configs', 'platform_billing');
        const unsubPlatformBilling = onSnapshot(platformBillingRef, (snap) => {
            if (!isMounted) return;
            if (snap.exists()) {
                const data = snap.data();
                setOfficialPlatformAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
                if (data?.policy) {
                    setBillingPolicy(prev => ({
                        ...prev,
                        ...data.policy
                    }));
                }
            } else {
                setOfficialPlatformAccounts([]);
            }
        }, (err) => console.warn("Platform billing accounts notice:", err));

        // 7. Fetch school's past payment slip submissions
        const subsRef = collection(db, 'platform_subscriptions');
        const qSubs = query(subsRef, where('schoolId', '==', id));
        const unsubSubs = onSnapshot(qSubs, (snap) => {
            if (!isMounted) return;
            const list = [];
            snap.forEach(d => {
                list.push({ id: d.id, ...d.data() });
            });

            // Merge local demo records if present
            try {
                const localDemoRaw = localStorage.getItem(`demo_billing_subs_${id}`);
                if (localDemoRaw) {
                    const localDemo = JSON.parse(localDemoRaw);
                    localDemo.forEach(ld => {
                        if (!list.some(item => item.transactionId === ld.transactionId)) {
                            list.push(ld);
                        }
                    });
                }
            } catch (e) {}

            list.sort((a, b) => {
                const timeA = a.submittedAt?.toDate ? a.submittedAt.toDate().getTime() : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);
                const timeB = b.submittedAt?.toDate ? b.submittedAt.toDate().getTime() : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0);
                return timeB - timeA;
            });
            setBillingSubmissions(list);
        }, (err) => {
            console.warn("Billing submissions notice:", err);
            // Fallback: If Firestore cloud rules block read, load local demo records
            try {
                const localDemoRaw = localStorage.getItem(`demo_billing_subs_${id}`);
                if (localDemoRaw && isMounted) {
                    setBillingSubmissions(JSON.parse(localDemoRaw));
                }
            } catch (e) {}
        });

        // 7b. Central Pool Real-Time Listener (Guaranteed Permission in Firestore)
        const poolRef = doc(db, 'system_configs', 'platform_submissions');
        const unsubPool = onSnapshot(poolRef, (poolSnap) => {
            if (!isMounted) return;
            if (poolSnap.exists()) {
                const allPool = poolSnap.data()?.submissions || [];
                const schoolPool = allPool.filter(s => s.schoolId === id);
                if (schoolPool.length > 0) {
                    setBillingSubmissions(prev => {
                        const merged = [...prev];
                        schoolPool.forEach(p => {
                            const idx = merged.findIndex(m => m.transactionId === p.transactionId || m.id === p.id);
                            if (idx >= 0) {
                                merged[idx] = { ...merged[idx], ...p };
                            } else {
                                merged.push(p);
                            }
                        });
                        return merged;
                    });
                }
            }
        }, (pErr) => console.warn("Central pool listener notice:", pErr));

        return () => {
            isMounted = false;
            unsubProfile();
            unsubBanking();
            unsubFeeSettings();
            unsubAi();
            unsubSchool();
            unsubPlatformBilling();
            unsubSubs();
            unsubPool();
        };
    }, []);

    const handleSlipFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSlipFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setSlipPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmitPaymentProof = async (e) => {
        if (e) e.preventDefault();
        let currentSchoolId = schoolId || JSON.parse(localStorage.getItem('manual_session') || '{}')?.schoolId;
        if (!currentSchoolId) {
            alert("School ID not found. Please re-login.");
            return;
        }

        if (!slipFile) {
            alert("Please select and upload your payment slip / transfer screenshot.");
            return;
        }

        if (!trxId.trim()) {
            alert("Please enter the Transaction ID (TRX / TID) from your bank or wallet.");
            return;
        }

        setSubmittingPayment(true);
        try {
            // 1. Compress slip image for high performance upload
            const compressed = await compressImage(slipFile, { maxDimension: 1200, quality: 0.85 });
            let proofUrl = slipPreview; // Instant fallback data URL

            // 2. Try Firebase Storage upload
            try {
                const safeExt = compressed.type === 'image/webp' ? '.webp' : '.jpg';
                const storageRef = ref(storage, `schools/${currentSchoolId}/subscription_slips/${Date.now()}${safeExt}`);
                await uploadBytes(storageRef, compressed);
                proofUrl = await getDownloadURL(storageRef);
            } catch (storageErr) {
                console.warn("Storage upload notice (using optimized image data URL fallback):", storageErr);
                if (!proofUrl) {
                    proofUrl = await new Promise((resolve) => {
                        const r = new FileReader();
                        r.onload = () => resolve(r.result);
                        r.readAsDataURL(compressed);
                    });
                }
            }

            const amountToPay = selectedCycle === 'yearly'
                ? Number(subscriptionInfo.yearlyFee || 50000)
                : Number(subscriptionInfo.monthlyFee || 5000);

            const submissionId = 'sub_' + Date.now();
            const submissionRecord = {
                id: submissionId,
                schoolId: currentSchoolId,
                schoolName: schoolData.name || 'School',
                amount: amountToPay,
                cycle: selectedCycle,
                paymentMethod: paymentMethod || 'Bank Transfer',
                transactionId: trxId.trim(),
                proofUrl: proofUrl || '',
                status: 'pending',
                submittedAt: new Date().toISOString(),
                reviewedAt: null,
                reviewedBy: null,
                rejectReason: null
            };

            // 3. Attempt write to platform_subscriptions collection
            try {
                await addDoc(collection(db, 'platform_subscriptions'), {
                    ...submissionRecord,
                    submittedAt: serverTimestamp()
                });
            } catch (permErr) {
                console.warn("platform_subscriptions write notice, backing up to central pool:", permErr);
            }

            // 4. Central Pool Backup in system_configs (Guaranteed Permission in Firestore)
            try {
                const poolRef = doc(db, 'system_configs', 'platform_submissions');
                const poolSnap = await getDoc(poolRef);
                const existing = poolSnap.exists() && Array.isArray(poolSnap.data()?.submissions)
                    ? poolSnap.data().submissions
                    : [];
                await setDoc(poolRef, {
                    submissions: [submissionRecord, ...existing.filter(s => s.transactionId !== submissionRecord.transactionId)],
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } catch (poolErr) {
                console.warn("Central pool backup notice:", poolErr);
            }

            // 5. Update local storage for seamless immediate persistence
            try {
                const localKey = `demo_billing_subs_${currentSchoolId}`;
                const raw = localStorage.getItem(localKey);
                const localList = raw ? JSON.parse(raw) : [];
                localStorage.setItem(localKey, JSON.stringify([submissionRecord, ...localList.filter(s => s.transactionId !== submissionRecord.transactionId)]));
            } catch (e) {}

            // 6. Update local React state so History tab immediately updates
            setBillingSubmissions(prev => [submissionRecord, ...prev.filter(s => s.transactionId !== submissionRecord.transactionId)]);

            // 7. Defensively update school doc paymentStatus
            try {
                await setDoc(doc(db, 'schools', currentSchoolId), {
                    paymentStatus: 'pending_verification',
                    billingCycle: selectedCycle,
                    lastSubmissionTime: new Date().toISOString()
                }, { merge: true });
            } catch (schErr) {
                console.warn("School doc status update notice:", schErr);
            }

            setSlipFile(null);
            setSlipPreview(null);
            setTrxId('');
            alert("Payment proof submitted successfully! Super Admin will verify your receipt shortly.");
            setBillingSubTab('history');
        } catch (err) {
            console.error("Error submitting payment proof:", err);
            alert("Failed to submit payment proof: " + err.message);
        } finally {
            setSubmittingPayment(false);
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const addBankAccount = () => {
        setBankAccounts([...bankAccounts, { bankName: '', accountTitle: '', accountNumber: '', iban: '' }]);
    };

    const removeBankAccount = (index) => {
        const newAccounts = [...bankAccounts];
        newAccounts.splice(index, 1);
        setBankAccounts(newAccounts);
    };

    const handleBankChange = (index, field, value) => {
        const newAccounts = [...bankAccounts];
        newAccounts[index][field] = value;
        setBankAccounts(newAccounts);
    };

    const validateInputs = () => {
        const newErrors = {};
        const phoneRegex = /^\+?[0-9\s\-()]{10,20}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (schoolData.address && schoolData.address.trim().length < 5) {
            newErrors.address = "Address is too short. Minimum 5 characters.";
        }
        if (schoolData.email && !emailRegex.test(schoolData.email.trim())) {
            newErrors.email = "Invalid email format.";
        }
        if (schoolData.phone && !phoneRegex.test(schoolData.phone.trim())) {
            newErrors.phone = "Invalid phone format. Ensure at least 10 digits.";
        }
        if (schoolData.landline && !phoneRegex.test(schoolData.landline.trim())) {
            newErrors.landline = "Invalid landline format. Ensure at least 10 digits.";
        }
        if (schoolData.emergencyContact && !phoneRegex.test(schoolData.emergencyContact.trim())) {
            newErrors.emergencyContact = "Invalid emergency contact format. Ensure at least 10 digits.";
        }

        // Validate banks if partially filled
        bankAccounts.forEach((acc, idx) => {
            if (acc.bankName || acc.accountTitle || acc.accountNumber || acc.iban) {
                if (!acc.bankName || !acc.accountTitle || !acc.accountNumber) {
                    newErrors[`bank_${idx}`] = "Bank Name, Title, and Number are strictly required.";
                }
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (fetchError) {
            alert("Cannot save settings: Database read permission denied. Please refresh or re-login.");
            return;
        }

        // Run validations strictly before continuing
        if (!validateInputs()) {
            alert("Please fix the validation errors before saving.");
            return;
        }

        setLoading(true);

        const timeoutId = setTimeout(() => {
            console.warn("Save timeout - forcing loading state reset");
            setLoading(false);
        }, 15000);

        try {
            let currentSchoolId = schoolId || JSON.parse(localStorage.getItem('manual_session'))?.schoolId;

            if (!currentSchoolId || !auth.currentUser) {
                console.error("Not authenticated");
                alert("Security Session Expired. Please Logout and Login again to verify your identity.");
                clearTimeout(timeoutId);
                setLoading(false);
                return;
            }

            let imageUrl = schoolData.profileImage;

            if (imageFile) {
                const compressedImage = await compressImage(imageFile, { maxDimension: 800, quality: 0.8 });
                const safeExt = compressedImage.type === 'image/webp' ? '.webp' : '.jpg';
                const storageRef = ref(storage, `schools/${currentSchoolId}/profile_${Date.now()}${safeExt}`);
                await uploadBytes(storageRef, compressedImage);
                imageUrl = await getDownloadURL(storageRef);
            }

            const settingsData = {
                name: schoolData.name,
                profileImage: imageUrl,
                address: schoolData.address,
                email: schoolData.email,
                phone: schoolData.phone,
                landline: schoolData.landline,
                emergencyContact: schoolData.emergencyContact,
                aboutText: schoolData.aboutText,
                teacherStartTime: schoolData.teacherStartTime,
                teacherEndTime: schoolData.teacherEndTime,
                breakStartTime: schoolData.breakStartTime,
                breakEndTime: schoolData.breakEndTime,
                schoolStartTime: schoolData.schoolStartTime,
                schoolEndTime: schoolData.schoolEndTime
            };

            // 1. Profile document
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'profile'), settingsData, { merge: true });
            
            // 2. Banking document 
            // Avoid polluting `profile` and keep banking details encapsulated for better security and future separation
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'banking'), { accounts: bankAccounts }, { merge: true });

            // 3. Fee settings document
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'feeSettings'), feeSettings, { merge: true });

            setSchoolData(settingsData);
            setPreviewImage(null);
            setImageFile(null);

            clearTimeout(timeoutId);
            setLoading(false);
            alert('Settings saved successfully!');

        } catch (error) {
            console.error("Error saving settings:", error);
            clearTimeout(timeoutId);
            setLoading(false);
            alert(`Failed to save settings: ${error.message}`);
        }
    };

    const handleSaveAiSettings = async () => {
        let currentSchoolId = schoolId || JSON.parse(localStorage.getItem('manual_session') || '{}')?.schoolId;
        if (!currentSchoolId) {
            alert('School ID not found.');
            return;
        }

        setSavingAi(true);
        setAiSavedSuccess(false);

        try {
            // Save to Firestore
            const aiRef = doc(db, `schools/${currentSchoolId}/settings`, 'ai');
            await setDoc(aiRef, {
                apiKey: aiSettings.apiKey.trim(),
                botName: aiSettings.botName.trim() || 'Principal AI Copilot',
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // Also cache in localStorage for instant offline access
            localStorage.setItem(`gemini_api_key_${currentSchoolId}`, aiSettings.apiKey.trim());
            localStorage.setItem('gemini_api_key', aiSettings.apiKey.trim());

            setAiSavedSuccess(true);
            setTimeout(() => setAiSavedSuccess(false), 3000);
        } catch (err) {
            console.error('Error saving AI settings:', err);
            alert(`Could not save AI settings: ${err.message}`);
        } finally {
            setSavingAi(false);
        }
    };

    if (initialLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader2 className="animate-spin" size={32} color="var(--primary)" />
            </div>
        );
    }

    const inputStyle = (error) => ({
        width: '100%', padding: '0.6rem', borderRadius: '6px',
        border: `1px solid ${error ? '#ef4444' : '#e2e8f0'}`, outline: 'none',
        fontSize: '0.95rem'
    });

    const errorMsgStyle = { color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' };
    const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-secondary)' };

    return (
        <div className="settings-studio-container" style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 5rem)',
            maxHeight: 'calc(100vh - 5rem)',
            overflow: 'hidden',
            width: '100%',
            animation: 'fadeIn 0.4s ease-out'
        }}>
            {/* Top Header - Strictly Stationary */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.25rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid #f1f5f9',
                flexWrap: 'wrap',
                gap: '1rem',
                flexShrink: 0
            }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', margin: 0, color: '#0f172a' }}>Settings</h1>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                        Manage school profile, official timings, curricula, and subscription billing.
                    </p>
                </div>

                {/* School ID Badge (Preserved 100%) */}
                {schoolId && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem',
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        borderRadius: '12px', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                        color: 'white', border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                                School ID
                            </span>
                            <span style={{ fontSize: '1rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                {schoolId}
                            </span>
                        </div>
                        <button
                            onClick={handleCopy}
                            style={{
                                background: 'rgba(255, 255, 255, 0.15)', border: 'none', borderRadius: '8px',
                                padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', transition: 'all 0.2s', color: 'white'
                            }}
                            title="Copy School ID"
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        >
                            {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                        </button>
                    </div>
                )}
            </div>

            {/* 2-Column Grid Layout */}
            <div className="settings-studio-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(240px, 280px) 1fr',
                gap: '1.75rem',
                alignItems: 'start',
                width: '100%',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden'
            }}>
                {/* Left Studio Menu Bar - Strictly Stationary & Fixed */}
                <div style={{
                    background: '#ffffff',
                    padding: '0.85rem',
                    borderRadius: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    maxHeight: '100%',
                    overflowY: 'auto',
                    flexShrink: 0
                }}>
                    <div style={{ padding: '0.5rem 0.75rem 0.75rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
                            Settings
                        </span>
                    </div>

                    {[
                        { id: 'details', label: 'School Details', icon: Building, desc: 'Profile & contacts' },
                        { id: 'timing', label: 'School Timings', icon: Clock, desc: 'Class & duty hours' },
                        { id: 'about', label: 'About School', icon: Info, desc: 'Mission & vision' },
                        {
                            id: 'billing',
                            label: 'Billing & Payment',
                            icon: CreditCard,
                            desc: 'Invoices & slip submission',
                            badge: subscriptionInfo.paymentStatus === 'paid' ? 'PAID' : (subscriptionInfo.paymentStatus === 'pending_verification' ? 'PENDING' : 'DUE'),
                            badgeColor: subscriptionInfo.paymentStatus === 'paid' ? '#10b981' : (subscriptionInfo.paymentStatus === 'pending_verification' ? '#f59e0b' : '#ef4444')
                        },
                        { id: 'import', label: 'Import Students', icon: Users, desc: 'Excel / CSV bulk upload' },
                        { id: 'upload_syllabus', label: 'Upload Syllabus', icon: BookOpen, desc: 'Curricula scanner' },
                        { id: 'ai_assistant', label: 'AI Copilot', icon: Sparkles, desc: 'Gemini Copilot engine' }
                    ].map((tab) => {
                        const isActive = activeTab === tab.id;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.7rem 0.85rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    background: isActive ? 'var(--primary)' : 'transparent',
                                    color: isActive ? '#ffffff' : '#334155',
                                    textAlign: 'left',
                                    width: '100%'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: isActive ? 'rgba(255, 255, 255, 0.2)' : '#f1f5f9',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: isActive ? '#ffffff' : 'var(--primary)'
                                    }}>
                                        <Icon size={17} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: '700', lineHeight: 1.2 }}>
                                            {tab.label}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: isActive ? 'rgba(255, 255, 255, 0.8)' : '#94a3b8', marginTop: '2px' }}>
                                            {tab.desc}
                                        </div>
                                    </div>
                                </div>

                                {tab.badge && (
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: '800',
                                        padding: '2px 6px',
                                        borderRadius: '6px',
                                        background: `${tab.badgeColor}15`,
                                        color: tab.badgeColor,
                                        border: `1px solid ${tab.badgeColor}30`
                                    }}>
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Right Content Panel - Smooth Independent Scroll (Up / Down) */}
                <div
                    className="settings-scrollable-content"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        height: '100%',
                        overflowY: 'auto',
                        paddingRight: '0.65rem',
                        paddingBottom: '2.5rem'
                    }}
                >
                    {activeTab === 'details' && (
                        <div style={{
                            background: '#ffffff',
                            padding: '2rem',
                            borderRadius: '16px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2rem',
                            animation: 'fadeIn 0.3s ease-out'
                        }}>
                        
                        {/* Profile Section */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    width: '100px', height: '100px', borderRadius: '50%',
                                    background: '#f1f5f9', overflow: 'hidden',
                                    border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {previewImage || schoolData.profileImage ? (
                                        <CachedImage src={previewImage || schoolData.profileImage} alt="School Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Shield size={36} color="#cbd5e1" />
                                    )}
                                </div>
                                <label style={{
                                    position: 'absolute', bottom: '0', right: '0',
                                    background: 'var(--primary)', color: 'white', width: '32px', height: '32px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}>
                                    <Camera size={16} />
                                    <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                                </label>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>School Name</label>
                                <input
                                    type="text" value={schoolData.name} onChange={(e) => setSchoolData({ ...schoolData, name: e.target.value })}
                                    placeholder="Enter School Name" style={inputStyle()}
                                />
                            </div>
                        </div>

                        {/* Contact Info Section */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Address</label>
                                <textarea
                                    value={schoolData.address} onChange={(e) => { setSchoolData({ ...schoolData, address: e.target.value }); setErrors({...errors, address: null}); }}
                                    placeholder="Full School Address" rows={3} style={{ ...inputStyle(errors.address), resize: 'vertical' }}
                                />
                                {errors.address && <div style={errorMsgStyle}>{errors.address}</div>}
                            </div>
                            
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Email Address</label>
                                <input
                                    type="email" value={schoolData.email} onChange={(e) => { setSchoolData({ ...schoolData, email: e.target.value }); setErrors({...errors, email: null}); }}
                                    placeholder="info@school.com" style={inputStyle(errors.email)}
                                />
                                {errors.email && <div style={errorMsgStyle}>{errors.email}</div>}
                            </div>
                            
                            <div>
                                <label style={labelStyle}>Primary Phone Number</label>
                                <input
                                    type="text" value={schoolData.phone} onChange={(e) => { setSchoolData({ ...schoolData, phone: e.target.value }); setErrors({...errors, phone: null}); }}
                                    placeholder="+1 234 567 890" style={inputStyle(errors.phone)}
                                />
                                {errors.phone && <div style={errorMsgStyle}>{errors.phone}</div>}
                            </div>
                            <div>
                                <label style={labelStyle}>Landline Number</label>
                                <input
                                    type="text" value={schoolData.landline} onChange={(e) => { setSchoolData({ ...schoolData, landline: e.target.value }); setErrors({...errors, landline: null}); }}
                                    placeholder="(555) 123-4567" style={inputStyle(errors.landline)}
                                />
                                {errors.landline && <div style={errorMsgStyle}>{errors.landline}</div>}
                            </div>
                            <div>
                                <label style={labelStyle}>Emergency Contact</label>
                                <input
                                    type="text" value={schoolData.emergencyContact} onChange={(e) => { setSchoolData({ ...schoolData, emergencyContact: e.target.value }); setErrors({...errors, emergencyContact: null}); }}
                                    placeholder="Emergency Phone Number" style={inputStyle(errors.emergencyContact)}
                                />
                                {errors.emergencyContact && <div style={errorMsgStyle}>{errors.emergencyContact}</div>}
                            </div>
                        </div>

                        {/* Fee Configuration Section */}
                        <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b' }}>Fee Collection Settings</h3>
                            <div style={{
                                padding: '1rem', background: '#eff6ff', borderLeft: '4px solid #3b82f6',
                                borderRadius: '0 6px 6px 0', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem'
                            }}>
                                <strong>Note:</strong> Set the automated monthly fee deadline and penalty charges. These sync directly to the Parent's App Calendar.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <label style={labelStyle}>Due Date (e.g. 10th)</label>
                                    <input
                                        type="text" value={feeSettings.dueDate} onChange={(e) => setFeeSettings({...feeSettings, dueDate: e.target.value})}
                                        placeholder="e.g. 10th" style={inputStyle()}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Late Penalty Amount (Rs)</label>
                                    <input
                                        type="number" value={feeSettings.penaltyAmount} onChange={(e) => setFeeSettings({...feeSettings, penaltyAmount: e.target.value})}
                                        placeholder="e.g. 500" style={inputStyle()}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Banking Section */}
                        <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e293b', margin: 0 }}>
                                    <Briefcase size={20} color="var(--primary)" /> Bank Account Details
                                </h3>
                                <button
                                    onClick={addBankAccount}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                                        background: '#f8fafc', color: 'var(--primary)', border: '1px solid #e2e8f0', borderRadius: '6px',
                                        fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                >
                                    <Plus size={16} /> Add another bank account
                                </button>
                            </div>
                            
                            {/* Blue Info Badge */}
                            <div style={{
                                padding: '1rem', background: '#eff6ff', borderLeft: '4px solid #3b82f6',
                                borderRadius: '0 6px 6px 0', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <strong>Note:</strong> This banking information will be securely displayed in the Parent's App to facilitate fee remittances.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {bankAccounts.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
                                        No bank accounts added yet. Click "Add another bank account" to setup fee collections.
                                    </div>
                                )}
                                {bankAccounts.map((acc, index) => (
                                    <div key={index} style={{
                                        position: 'relative', padding: '1.5rem', background: '#f8fafc',
                                        borderRadius: '8px', border: errors[`bank_${index}`] ? '1px solid #ef4444' : '1px solid #e2e8f0',
                                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem'
                                    }}>
                                        <button
                                            onClick={() => removeBankAccount(index)}
                                            style={{
                                                position: 'absolute', top: '1rem', right: '1rem', background: 'transparent',
                                                border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px'
                                            }}
                                            title="Remove Account"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                        
                                        <div>
                                            <label style={labelStyle}>Bank / Wallet Method</label>
                                            <input
                                                type="text" value={acc.bankName} onChange={(e) => {handleBankChange(index, 'bankName', e.target.value); setErrors({...errors, [`bank_${index}`]: null});}}
                                                placeholder="e.g. EasyPaisa, JazzCash, Meezan Bank, HBL" style={inputStyle()}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Account Title</label>
                                            <input
                                                type="text" value={acc.accountTitle} onChange={(e) => {handleBankChange(index, 'accountTitle', e.target.value); setErrors({...errors, [`bank_${index}`]: null});}}
                                                placeholder="e.g. School Treasury" style={inputStyle()}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Account Number</label>
                                            <input
                                                type="text" value={acc.accountNumber} onChange={(e) => {handleBankChange(index, 'accountNumber', e.target.value); setErrors({...errors, [`bank_${index}`]: null});}}
                                                placeholder="Account #" style={inputStyle()}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>IBAN / Routing (Optional)</label>
                                            <input
                                                type="text" value={acc.iban} onChange={(e) => handleBankChange(index, 'iban', e.target.value)}
                                                placeholder="IBAN / Routing #" style={inputStyle()}
                                            />
                                        </div>
                                        {errors[`bank_${index}`] && <div style={{...errorMsgStyle, gridColumn: '1 / -1'}}>{errors[`bank_${index}`]}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleSave} disabled={loading} className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%', marginTop: '1rem'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Save School Details
                        </button>
                    </div>
                )}

                {activeTab === 'timing' && (
                    <div style={{
                        background: '#ffffff',
                        padding: '2rem',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2rem',
                        animation: 'fadeIn 0.3s ease-out'
                    }}>
                        
                        {/* Orange Info Badge */}
                        <div style={{
                            padding: '1rem', background: '#fff7ed', borderLeft: '4px solid #f97316',
                            borderRadius: '0 6px 6px 0', color: '#9a3412', fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <strong>Note:</strong> These official school timings will be consistently displayed across both the Teacher's App and Parent's App.
                        </div>

                        {/* Teachers duty time */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>Teachers Duty Time</h3>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Start Time</label>
                                    <input
                                        type="time" value={schoolData.teacherStartTime} onChange={(e) => setSchoolData({ ...schoolData, teacherStartTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>End Time</label>
                                    <input
                                        type="time" value={schoolData.teacherEndTime} onChange={(e) => setSchoolData({ ...schoolData, teacherEndTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Break Time */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>Break Time</h3>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Start Time</label>
                                    <input
                                        type="time" value={schoolData.breakStartTime} onChange={(e) => setSchoolData({ ...schoolData, breakStartTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>End Time</label>
                                    <input
                                        type="time" value={schoolData.breakEndTime} onChange={(e) => setSchoolData({ ...schoolData, breakEndTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* School time */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>School Time (Student Class Hours)</h3>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Start Time</label>
                                    <input
                                        type="time" value={schoolData.schoolStartTime} onChange={(e) => setSchoolData({ ...schoolData, schoolStartTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>End Time</label>
                                    <input
                                        type="time" value={schoolData.schoolEndTime} onChange={(e) => setSchoolData({ ...schoolData, schoolEndTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleSave} disabled={loading} className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Save Timings
                        </button>
                    </div>
                )}

                {activeTab === 'about' && (
                    <div style={{
                        background: '#ffffff',
                        padding: '2rem',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2rem',
                        animation: 'fadeIn 0.3s ease-out'
                    }}>
                        
                        {/* Blue Info Badge */}
                        <div style={{
                            padding: '1rem', background: '#eff6ff', borderLeft: '4px solid #3b82f6',
                            borderRadius: '0 6px 6px 0', color: '#1e3a8a', fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <strong>Note:</strong> This description will be dynamically shown in the "About" section of the Parent App.
                        </div>

                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>School Mission & Description</h3>
                            <textarea
                                value={schoolData.aboutText}
                                onChange={(e) => setSchoolData({ ...schoolData, aboutText: e.target.value })}
                                placeholder="Enter your school's mission, history, and core values here..."
                                rows={8}
                                style={{ ...inputStyle(), resize: 'vertical' }}
                            />
                        </div>

                        <button
                            onClick={handleSave} disabled={loading} className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Save About Details
                        </button>
                    </div>
                )}

                {/* BILLING & PAYMENT: 2 STUDIO SUB-TABS */}
                {activeTab === 'billing' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', animation: 'fadeIn 0.3s ease-out' }}>
                        
                        {/* 1. School Suspended High-Priority Action Notice */}
                        {(subscriptionInfo.status === 'suspended' || schoolData.status === 'suspended') && (
                            <div style={{
                                padding: '1.25rem 1.5rem',
                                borderRadius: '16px',
                                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                border: '2px solid #ef4444',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '1.25rem',
                                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.15)'
                            }}>
                                <div style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '12px',
                                    background: '#ef4444',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <AlertTriangle size={26} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '4px' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#991b1b' }}>
                                            ⚠️ School Management Access Temporarily Suspended
                                        </h3>
                                        <span style={{
                                            padding: '3px 10px',
                                            borderRadius: '999px',
                                            background: '#dc2626',
                                            color: 'white',
                                            fontSize: '0.72rem',
                                            fontWeight: '800',
                                            letterSpacing: '0.04em',
                                            textTransform: 'uppercase'
                                        }}>
                                            Payment Slip Required
                                        </span>
                                    </div>
                                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#7f1d1d', lineHeight: '1.5' }}>
                                        Your school portal has been temporarily paused by Super Administration due to pending monthly subscription dues. You have full access to view official accounts, make payment, and submit your receipt slip below.
                                    </p>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b', direction: 'rtl', lineHeight: '1.5', fontWeight: '600' }}>
                                        محترم پرنسپل صاحب، واجب الادا فیس کی عدم ادائیگی پر پورٹل کو عارضی طور پر روکا گیا ہے۔ برائے مہربانی نیچے دیے گئے اکاؤنٹس میں فیس جمع کروا کر سلپ اپلوڈ کریں۔ ایڈمن کی جانب سے تصدیق کے بعد سسٹم خود بخود فوری ان لاک ہو جائے گا۔
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* 2. Monthly Due Date & Suspension Policy Info Badge */}
                        {billingPolicy.enabled !== false && (() => {
                            const dueDay = billingPolicy.dueDay || 5;
                            const graceDays = billingPolicy.graceDays ?? 2;
                            const currentDay = new Date().getDate();
                            const isPaid = subscriptionInfo.paymentStatus === 'paid';
                            const isPending = subscriptionInfo.paymentStatus === 'pending_verification';

                            // Determine status
                            let statusType = 'normal'; // 'normal' | 'grace' | 'overdue'
                            if (!isPaid && !isPending) {
                                if (currentDay > dueDay + graceDays) {
                                    statusType = 'overdue';
                                } else if (currentDay > dueDay) {
                                    statusType = 'grace';
                                }
                            }

                            const theme = {
                                normal: {
                                    bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                    border: '#86efac',
                                    iconColor: '#16a34a',
                                    badgeBg: '#dcfce7',
                                    badgeText: '#15803d',
                                    titleColor: '#166534',
                                    textColor: '#14532d',
                                    badgeLabel: `Due Date: ${dueDay}th of every month`,
                                    title: `📅 Monthly Subscription Due Date Policy (Due: ${dueDay}th)`,
                                    message: billingPolicy.customMessage || `Monthly subscription fees are requested on or before the ${dueDay}th of each month. Submitting payment slips on time ensures 100% uninterrupted service for attendance, SMS alerts, and teacher/parent portals.`,
                                    urduText: `محترم پرنسپل صاحب، براہ کرم ہر ماہ کی ${dueDay} تاریخ تک فیس ادا کر کے رسید اپلوڈ فرمائیں تاکہ سکول پورٹل کی سروس بلا تعطل فعال رہے۔`
                                },
                                grace: {
                                    bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                                    border: '#fcd34d',
                                    iconColor: '#d97706',
                                    badgeBg: '#fef3c7',
                                    badgeText: '#92400e',
                                    titleColor: '#854d0e',
                                    textColor: '#713f12',
                                    badgeLabel: `Grace Period Active (Cutoff: ${dueDay + graceDays}th)`,
                                    title: `⚠️ Monthly Payment Reminder: Due Date (${dueDay}th) Passed`,
                                    message: billingPolicy.customMessage || `The monthly subscription due date (${dueDay}th) has passed. Grace period is currently active until the ${dueDay + graceDays}th. Please transfer fee and upload your payment slip at the earliest to prevent automated portal suspension.`,
                                    urduText: `ماہانہ فیس کی مقررہ تاریخ (${dueDay} تاریخ) گزر چکی ہے، عارضی رعایتی وقت جاری ہے۔ سسٹم معطلی سے بچنے کے لیے جلد رسید اپلوڈ فرمائیں۔`
                                },
                                overdue: {
                                    bg: 'linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)',
                                    border: '#fca5a5',
                                    iconColor: '#dc2626',
                                    badgeBg: '#fee2e2',
                                    badgeText: '#991b1b',
                                    titleColor: '#991b1b',
                                    textColor: '#7f1d1d',
                                    badgeLabel: `Immediate Action Required (Past ${dueDay + graceDays}th)`,
                                    title: `🚨 Overdue Notice: System Suspension Risk`,
                                    message: billingPolicy.customMessage || `Your monthly subscription is past the allowed grace period (${dueDay + graceDays}th). Unpaid accounts may experience automatic stoppage of portal services. Please submit payment proof below promptly.`,
                                    urduText: `فیس کی رعایتی مدت ختم ہو چکی ہے اور پورٹل بندش کے خطرے میں ہے۔ برائے مہربانی بلا تاخیر ادائیگی کر کے رسید اپلوڈ فرمائیں۔`
                                }
                            }[statusType];

                            return (
                                <div style={{
                                    padding: '1.15rem 1.4rem',
                                    borderRadius: '16px',
                                    background: theme.bg,
                                    border: `1.5px solid ${theme.border}`,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '1.1rem',
                                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)'
                                }}>
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '12px',
                                        background: 'rgba(255, 255, 255, 0.85)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: theme.iconColor,
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                                        flexShrink: 0
                                    }}>
                                        {statusType === 'overdue' ? <AlertCircle size={22} /> : (statusType === 'grace' ? <Clock size={22} /> : <Calendar size={22} />)}
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '4px' }}>
                                            <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '800', color: theme.titleColor }}>
                                                {theme.title}
                                            </h4>
                                            <span style={{
                                                padding: '3px 10px',
                                                borderRadius: '999px',
                                                background: theme.badgeBg,
                                                color: theme.badgeText,
                                                fontSize: '0.74rem',
                                                fontWeight: '800',
                                                border: `1px solid ${theme.border}`
                                            }}>
                                                {theme.badgeLabel}
                                            </span>
                                        </div>

                                        <p style={{ margin: '0 0 0.4rem', fontSize: '0.84rem', color: theme.textColor, lineHeight: '1.45' }}>
                                            {theme.message}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: theme.textColor, direction: 'rtl', lineHeight: '1.45', opacity: 0.9 }}>
                                            {theme.urduText}
                                        </p>

                                        {/* Quick policy info pills */}
                                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                                            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.7)', color: theme.textColor, fontWeight: '700' }}>
                                                📅 Monthly Cutoff: {dueDay}th
                                            </span>
                                            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.7)', color: theme.textColor, fontWeight: '700' }}>
                                                ⏳ Grace Period: {graceDays} Days
                                            </span>
                                            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.7)', color: theme.textColor, fontWeight: '700' }}>
                                                ⚡ Auto-Reactivation on Super Admin Approval
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Sub-Tab Navigation Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            flexWrap: 'wrap',
                            padding: '0.45rem',
                            background: '#f8fafc',
                            borderRadius: '14px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => setBillingSubTab('pay')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        padding: '0.65rem 1.25rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontWeight: '700',
                                        fontSize: '0.9rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        background: billingSubTab === 'pay' ? 'var(--primary)' : 'transparent',
                                        color: billingSubTab === 'pay' ? '#ffffff' : '#64748b',
                                        boxShadow: billingSubTab === 'pay' ? '0 4px 12px rgba(99, 102, 241, 0.25)' : 'none'
                                    }}
                                >
                                    <CreditCard size={18} />
                                    <span>Make Payment & Official Accounts</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setBillingSubTab('history')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        padding: '0.65rem 1.25rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontWeight: '700',
                                        fontSize: '0.9rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        background: billingSubTab === 'history' ? 'var(--primary)' : 'transparent',
                                        color: billingSubTab === 'history' ? '#ffffff' : '#64748b',
                                        boxShadow: billingSubTab === 'history' ? '0 4px 12px rgba(99, 102, 241, 0.25)' : 'none'
                                    }}
                                >
                                    <FileText size={18} />
                                    <span>Invoices & Payment History</span>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        fontSize: '0.72rem',
                                        fontWeight: '800',
                                        background: billingSubTab === 'history' ? 'rgba(255, 255, 255, 0.25)' : '#e2e8f0',
                                        color: billingSubTab === 'history' ? '#ffffff' : '#475569'
                                    }}>
                                        {billingSubmissions.length}
                                    </span>
                                </button>
                            </div>

                            {/* Status Pill Badge & Demo Quick Button */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', paddingRight: '0.5rem', flexWrap: 'wrap' }}>
                                {isDemoAccount && (
                                    <button
                                        type="button"
                                        onClick={handleInjectDemoBillingData}
                                        disabled={injectingDemo}
                                        style={{
                                            padding: '0.45rem 0.9rem',
                                            borderRadius: '999px',
                                            fontSize: '0.78rem',
                                            fontWeight: '800',
                                            border: '1px dashed #6366f1',
                                            background: '#eef2ff',
                                            color: '#4f46e5',
                                            cursor: injectingDemo ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            boxShadow: '0 1px 3px rgba(99, 102, 241, 0.15)'
                                        }}
                                        title="Local / Demo Mode: Click to inject sample invoice records"
                                    >
                                        {injectingDemo ? <Loader2 className="animate-spin" size={13} /> : <Sparkles size={13} color="#4f46e5" />}
                                        <span>{injectingDemo ? 'Injecting...' : '✨ Inject Demo Data'}</span>
                                    </button>
                                )}
                                <span style={{
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    padding: '4px 10px',
                                    borderRadius: '999px',
                                    background: subscriptionInfo.paymentStatus === 'paid' ? '#dcfce7' : (subscriptionInfo.paymentStatus === 'pending_verification' ? '#fef3c7' : '#fee2e2'),
                                    color: subscriptionInfo.paymentStatus === 'paid' ? '#15803d' : (subscriptionInfo.paymentStatus === 'pending_verification' ? '#b45309' : '#b91c1c'),
                                    border: `1px solid ${subscriptionInfo.paymentStatus === 'paid' ? '#bbf7d0' : (subscriptionInfo.paymentStatus === 'pending_verification' ? '#fde68a' : '#fecaca')}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                                    {subscriptionInfo.paymentStatus === 'paid' ? 'Active License' : (subscriptionInfo.paymentStatus === 'pending_verification' ? 'Under Review' : 'Payment Overdue')}
                                </span>
                            </div>
                        </div>

                        {/* SUB-TAB 1: MAKE PAYMENT & OFFICIAL ACCOUNTS */}
                        {billingSubTab === 'pay' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.25s ease-out' }}>
                                {/* Subscription Overview Card */}
                                <div style={{
                                    padding: '1.5rem',
                                    borderRadius: '16px',
                                    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                                    border: '1px solid rgba(99, 102, 241, 0.4)',
                                    boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)',
                                    color: 'white'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                                        <div>
                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#a5b4fc', letterSpacing: '0.06em' }}>
                                                Current Subscription Plan
                                            </span>
                                            <h2 style={{ fontSize: '1.6rem', fontWeight: '800', margin: '0.2rem 0', color: '#ffffff' }}>
                                                {selectedCycle === 'yearly' ? '⭐ Annual / Yearly Subscription' : '📅 Monthly Subscription'}
                                            </h2>
                                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                                                School SaaS Management Access & Multi-Portal License
                                            </p>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{
                                                padding: '0.4rem 0.9rem',
                                                borderRadius: '9999px',
                                                fontSize: '0.8rem',
                                                fontWeight: '800',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                background: subscriptionInfo.paymentStatus === 'paid'
                                                    ? 'rgba(16, 185, 129, 0.2)'
                                                    : (subscriptionInfo.paymentStatus === 'pending_verification' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                                                color: subscriptionInfo.paymentStatus === 'paid'
                                                    ? '#34d399'
                                                    : (subscriptionInfo.paymentStatus === 'pending_verification' ? '#fbbf24' : '#f87171'),
                                                border: subscriptionInfo.paymentStatus === 'paid'
                                                    ? '1px solid rgba(16, 185, 129, 0.4)'
                                                    : (subscriptionInfo.paymentStatus === 'pending_verification' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)')
                                            }}>
                                                {subscriptionInfo.paymentStatus === 'paid'
                                                    ? '✓ Paid & Active'
                                                    : (subscriptionInfo.paymentStatus === 'pending_verification' ? '⏱ Under Verification' : '⚠️ Payment Overdue')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Plan Pricing Details Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                        gap: '1rem',
                                        padding: '1rem',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', fontWeight: '600' }}>MONTHLY RATE</span>
                                            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff' }}>
                                                ₨ {Number(subscriptionInfo.monthlyFee || 5000).toLocaleString()}
                                                <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#94a3b8' }}> / month</span>
                                            </span>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', fontWeight: '600' }}>YEARLY RATE (DISCOUNTED)</span>
                                            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#fbbf24' }}>
                                                ₨ {Number(subscriptionInfo.yearlyFee || 50000).toLocaleString()}
                                                <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#94a3b8' }}> / year</span>
                                            </span>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', fontWeight: '600' }}>ACTIVE UNTIL / DUE DATE</span>
                                            <span style={{ fontSize: '1.05rem', fontWeight: '700', color: '#ffffff' }}>
                                                {subscriptionInfo.paidUntil?.toDate
                                                    ? subscriptionInfo.paidUntil.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : (subscriptionInfo.paidUntil ? new Date(subscriptionInfo.paidUntil).toLocaleDateString() : 'Due Immediately')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Cycle Selector Buttons */}
                                    <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '600' }}>Choose Payment Cycle:</span>
                                        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.1)', padding: '3px', borderRadius: '10px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCycle('monthly')}
                                                style={{
                                                    padding: '0.4rem 1rem',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: selectedCycle === 'monthly' ? '#ffffff' : 'transparent',
                                                    color: selectedCycle === 'monthly' ? '#0f172a' : '#cbd5e1',
                                                    fontWeight: '700',
                                                    fontSize: '0.82rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                Monthly (₨ {Number(subscriptionInfo.monthlyFee || 5000).toLocaleString()})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCycle('yearly')}
                                                style={{
                                                    padding: '0.4rem 1rem',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: selectedCycle === 'yearly' ? '#fbbf24' : 'transparent',
                                                    color: selectedCycle === 'yearly' ? '#0f172a' : '#cbd5e1',
                                                    fontWeight: '700',
                                                    fontSize: '0.82rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                Yearly (Save 15%+)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Official Platform Bank & Wallet Accounts */}
                                <div style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                        <Landmark size={22} color="var(--primary)" />
                                        <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#1e293b' }}>
                                            Official Receiving Accounts (1-Click Copy)
                                        </h3>
                                    </div>
                                    <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                                        Transfer your subscription fee to any verified official account below, then upload your deposit slip and enter the Transaction ID.
                                    </p>

                                    {officialPlatformAccounts.length === 0 ? (
                                        <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                                            <AlertCircle size={24} color="#f59e0b" style={{ margin: '0 auto 0.5rem auto' }} />
                                            Platform billing accounts are currently being configured by Super Admin. Please contact head office if needed.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                            {officialPlatformAccounts.map((acc, index) => {
                                                const theme = getPaymentMethodTheme(acc.bankName);
                                                return (
                                                    <div
                                                        key={index}
                                                        style={{
                                                            border: `1px solid ${theme.borderColor}40`,
                                                            borderTop: `4px solid ${theme.brandColor}`,
                                                            borderRadius: '14px',
                                                            padding: '1.25rem',
                                                            background: '#ffffff',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.85rem'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                                            <PaymentMethodLogo name={acc.bankName} size="md" />
                                                            <span style={{
                                                                fontSize: '0.7rem',
                                                                fontWeight: '800',
                                                                textTransform: 'uppercase',
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                background: theme.badgeBg,
                                                                color: theme.badgeText,
                                                                border: `1px solid ${theme.borderColor}30`
                                                            }}>
                                                                {acc.type === 'wallet' || theme.isWallet ? '⚡ Mobile Wallet' : '🏛️ Bank A/C'}
                                                            </span>
                                                        </div>

                                                    {/* Account Title */}
                                                    <div>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', fontWeight: '600' }}>ACCOUNT TITLE</span>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>
                                                            {acc.accountTitle}
                                                        </span>
                                                    </div>

                                                    {/* Account Number with 1-Click Copy */}
                                                    <div>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', fontWeight: '600' }}>ACCOUNT NUMBER / MOBILE #</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '2px' }}>
                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
                                                                {acc.accountNumber}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyField(acc.accountNumber, `acc_${index}`)}
                                                                style={{
                                                                    border: 'none',
                                                                    background: copiedField === `acc_${index}` ? '#dcfce7' : 'var(--primary)',
                                                                    color: copiedField === `acc_${index}` ? '#15803d' : '#ffffff',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '700',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    flexShrink: 0
                                                                }}
                                                            >
                                                                {copiedField === `acc_${index}` ? <Check size={13} /> : <Copy size={13} />}
                                                                {copiedField === `acc_${index}` ? 'Copied!' : 'Copy'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* IBAN with Copy */}
                                                    {acc.iban && (
                                                        <div>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', fontWeight: '600' }}>IBAN (OPTIONAL)</span>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '2px' }}>
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: '600', color: '#0f172a', wordBreak: 'break-all' }}>
                                                                    {acc.iban}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyField(acc.iban, `iban_${index}`)}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: copiedField === `iban_${index}` ? '#dcfce7' : '#e2e8f0',
                                                                        color: copiedField === `iban_${index}` ? '#15803d' : '#334155',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '700',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        flexShrink: 0,
                                                                        marginLeft: '4px'
                                                                    }}
                                                                >
                                                                    {copiedField === `iban_${index}` ? <Check size={13} /> : <Copy size={13} />}
                                                                    {copiedField === `iban_${index}` ? 'Copied' : 'Copy'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        </div>
                                    )}
                                </div>

                                {/* Submit Payment Proof Form */}
                                <div style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                        <Upload size={22} color="var(--primary)" />
                                        <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#1e293b' }}>
                                            Submit Payment Proof / Receipt
                                        </h3>
                                    </div>
                                    <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                                        After completing payment, select your receipt screenshot or deposit slip, enter the Transaction Reference (TRX ID), and submit for verification.
                                    </p>

                                    <form onSubmit={handleSubmitPaymentProof} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                                            {/* Amount Due (Read Only) */}
                                            <div>
                                                <label style={labelStyle}>Amount to Pay</label>
                                                <div style={{ ...inputStyle(), background: '#f8fafc', fontWeight: '800', fontSize: '1.1rem', color: '#0f172a' }}>
                                                    ₨ {selectedCycle === 'yearly' ? Number(subscriptionInfo.yearlyFee || 50000).toLocaleString() : Number(subscriptionInfo.monthlyFee || 5000).toLocaleString()}
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginLeft: '6px' }}>
                                                        ({selectedCycle === 'yearly' ? 'Yearly Plan' : 'Monthly Plan'})
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Payment Method Selector */}
                                            <div>
                                                <label style={labelStyle}>Payment Method Used</label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                                                    {availablePaymentMethods.map((item) => {
                                                        const isSelected = paymentMethod.toLowerCase() === item.id.toLowerCase();
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                onClick={() => setPaymentMethod(item.id)}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    padding: '5px 12px',
                                                                    borderRadius: '8px',
                                                                    cursor: 'pointer',
                                                                    border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                                                                    background: isSelected ? '#eef2ff' : '#ffffff',
                                                                    boxShadow: isSelected ? '0 2px 6px rgba(79, 70, 229, 0.15)' : 'none',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                <PaymentMethodLogo name={item.name} size="sm" />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <select
                                                    value={paymentMethod}
                                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                                    style={inputStyle()}
                                                >
                                                    {availablePaymentMethods.map((item) => (
                                                        <option key={item.id} value={item.id}>
                                                            {item.name} {item.accountNumber ? `(${item.accountNumber})` : ''}
                                                        </option>
                                                    ))}
                                                    <option value="Other Bank Transfer">Other Bank Transfer</option>
                                                </select>
                                            </div>

                                            {/* Transaction ID */}
                                            <div>
                                                <label style={labelStyle}>Transaction ID / TID / Ref #</label>
                                                <input
                                                    type="text"
                                                    value={trxId}
                                                    onChange={(e) => setTrxId(e.target.value)}
                                                    placeholder="e.g. 98214152"
                                                    style={{ ...inputStyle(), fontFamily: 'monospace' }}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {/* File Upload / Slip Selector */}
                                        <div>
                                            <label style={labelStyle}>Upload Transfer Slip / Screenshot</label>
                                            <div style={{
                                                border: '2px dashed #cbd5e1',
                                                borderRadius: '12px',
                                                padding: '1.5rem',
                                                textAlign: 'center',
                                                background: '#f8fafc',
                                                position: 'relative',
                                                cursor: 'pointer'
                                            }}>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleSlipFileChange}
                                                    style={{
                                                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                                        opacity: 0, cursor: 'pointer'
                                                    }}
                                                    required={!slipFile}
                                                />
                                                {slipPreview ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                                                        <img
                                                            src={slipPreview}
                                                            alt="Payment Slip Preview"
                                                            style={{ maxHeight: '160px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain', border: '1px solid #e2e8f0' }}
                                                        />
                                                        <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: '700' }}>
                                                            ✓ Slip Selected ({slipFile?.name}). Click to change.
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                                                        <Upload size={32} color="#94a3b8" />
                                                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Click or Drag & Drop payment receipt image here</span>
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Supports JPG, PNG, WEBP (Auto-optimized)</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={submittingPayment}
                                            className="btn-primary"
                                            style={{
                                                padding: '0.85rem',
                                                borderRadius: '10px',
                                                fontSize: '1rem',
                                                fontWeight: '700',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.5rem',
                                                width: '100%'
                                            }}
                                        >
                                            {submittingPayment ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                                            {submittingPayment ? 'Uploading & Submitting Proof...' : 'Submit Payment Proof to Super Admin'}
                                        </button>
                                    </form>
                                </div>

                                {/* Link to 2nd Tab */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '1.25rem 1.5rem',
                                    background: '#f8fafc',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                                            Need to review past payments & official receipts?
                                        </h4>
                                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                         Access your complete archive of verified invoices, receipts, and payment slips across all billing periods.
                                     </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setBillingSubTab('history')}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--primary)',
                                            background: '#ffffff',
                                            color: 'var(--primary)',
                                            fontSize: '0.85rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem'
                                        }}
                                    >
                                        View Payment History <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* SUB-TAB 2: INVOICES & PAYMENT RECEIPTS STUDIO */}
                        {billingSubTab === 'history' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.25s ease-out' }}>
                                
                                {/* Friendly Header Banner */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '1rem',
                                    padding: '1.25rem 1.5rem',
                                    borderRadius: '14px',
                                    background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                                    border: '1px solid #dbeafe'
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <FileText size={22} color="var(--primary)" />
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: '#1e293b' }}>
                                                Subscription Invoices & Receipts Studio
                                            </h3>
                                        </div>
                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                                         Comprehensive record of payment slips, transaction receipts, and Super Admin verification status.
                                     </p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                        {/* Demo Account Special Controls (Only visible on Demo accounts) */}
                                        {isDemoAccount && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleInjectDemoBillingData}
                                                    disabled={injectingDemo}
                                                    style={{
                                                        padding: '0.55rem 1rem',
                                                        borderRadius: '10px',
                                                        fontSize: '0.82rem',
                                                        fontWeight: '700',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.45rem',
                                                        border: '1px dashed #6366f1',
                                                        background: '#eef2ff',
                                                        color: '#4f46e5',
                                                        cursor: injectingDemo ? 'not-allowed' : 'pointer',
                                                        boxShadow: '0 1px 3px rgba(99, 102, 241, 0.1)'
                                                    }}
                                                    title="Only available on Demo Account: Inject realistic sample invoice receipts across JazzCash, EasyPaisa, and Meezan Bank"
                                                >
                                                    {injectingDemo ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} color="#4f46e5" />}
                                                    <span>{injectingDemo ? 'Injecting...' : 'Inject Demo Data'}</span>
                                                </button>

                                                {billingSubmissions.some(s => s.isDemoData) && (
                                                    <button
                                                        type="button"
                                                        onClick={handleClearDemoBillingData}
                                                        disabled={clearingDemo}
                                                        style={{
                                                            padding: '0.55rem 0.85rem',
                                                            borderRadius: '10px',
                                                            fontSize: '0.82rem',
                                                            fontWeight: '700',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.45rem',
                                                            border: '1px solid #fecaca',
                                                            background: '#fef2f2',
                                                            color: '#b91c1c',
                                                            cursor: clearingDemo ? 'not-allowed' : 'pointer'
                                                        }}
                                                        title="Remove injected demo records"
                                                    >
                                                        {clearingDemo ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                                                        <span>Clear Demo</span>
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => setBillingSubTab('pay')}
                                            className="btn-primary"
                                            style={{
                                                padding: '0.55rem 1.15rem',
                                                borderRadius: '10px',
                                                fontSize: '0.85rem',
                                                fontWeight: '700',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            <Plus size={16} /> Submit New Payment
                                        </button>
                                    </div>
                                </div>

                                {/* 4 Friendly Interactive KPI Mini-Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    {/* 1. Total Paid to Date */}
                                    <div style={{ background: '#ffffff', padding: '1.15rem', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Paid To Date</span>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#15803d' }}>
                                                <Landmark size={15} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a' }}>
                                            ₨ {historyStats.totalPaid.toLocaleString()}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: '600' }}>
                                            ✓ {historyStats.approvedCount} Approved Invoices
                                        </span>
                                    </div>

                                    {/* 2. Approved Invoices */}
                                    <div style={{ background: '#ffffff', padding: '1.15rem', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Verified Receipts</span>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338ca' }}>
                                                <CheckCheck size={15} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#4338ca' }}>
                                            {historyStats.approvedCount}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500' }}>
                                            100% Legit & Verified
                                        </span>
                                    </div>

                                    {/* 3. Under Verification */}
                                    <div style={{ background: '#ffffff', padding: '1.15rem', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Under Review</span>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                                                <Clock size={15} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#b45309' }}>
                                            {historyStats.pendingCount}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: '600' }}>
                                            {historyStats.pendingCount > 0 ? 'Super Admin inspecting' : 'No pending slips'}
                                        </span>
                                    </div>

                                    {/* 4. Active Validity */}
                                    <div style={{ background: '#ffffff', padding: '1.15rem', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Validity</span>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                                                <Calendar size={15} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                            {subscriptionInfo.paidUntil?.toDate
                                                ? subscriptionInfo.paidUntil.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                                                : (subscriptionInfo.paidUntil ? new Date(subscriptionInfo.paidUntil).toLocaleDateString() : 'Immediate Action')}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: subscriptionInfo.paymentStatus === 'paid' ? '#15803d' : '#ef4444', fontWeight: '600' }}>
                                            {subscriptionInfo.paymentStatus === 'paid' ? '● Protected' : '● Action Required'}
                                        </span>
                                    </div>
                                </div>

                                {/* Interactive Filter & Controls Bar */}
                                <div style={{
                                    background: '#ffffff',
                                    padding: '1.25rem',
                                    borderRadius: '16px',
                                    border: '1px solid #e2e8f0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                        {/* Year Filter Pill Selector */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748b', fontSize: '0.8rem', fontWeight: '700' }}>
                                                <Calendar size={15} />
                                                <span>YEAR:</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryYearFilter('all')}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        fontSize: '0.78rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        background: historyYearFilter === 'all' ? 'var(--primary)' : 'transparent',
                                                        color: historyYearFilter === 'all' ? '#ffffff' : '#64748b'
                                                    }}
                                                >
                                                    All Years
                                                </button>
                                                {availableYears.map(yr => (
                                                    <button
                                                        key={yr}
                                                        type="button"
                                                        onClick={() => setHistoryYearFilter(yr)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '8px',
                                                            border: 'none',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease',
                                                            background: historyYearFilter === yr ? 'var(--primary)' : 'transparent',
                                                            color: historyYearFilter === yr ? '#ffffff' : '#64748b'
                                                        }}
                                                    >
                                                        {yr}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* View Switcher: Cards vs Table */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setHistoryViewMode('cards')}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 10px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    background: historyViewMode === 'cards' ? '#ffffff' : 'transparent',
                                                    color: historyViewMode === 'cards' ? '#0f172a' : '#64748b',
                                                    boxShadow: historyViewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                                                }}
                                            >
                                                <LayoutGrid size={14} /> Cards
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setHistoryViewMode('table')}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 10px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    background: historyViewMode === 'table' ? '#ffffff' : 'transparent',
                                                    color: historyViewMode === 'table' ? '#0f172a' : '#64748b',
                                                    boxShadow: historyViewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                                                }}
                                            >
                                                <ListFilter size={14} /> Table
                                            </button>
                                        </div>
                                    </div>

                                    {/* Secondary Row: Status Pills & Search Box */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                                        {/* Status Filter Buttons */}
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            {[
                                                { id: 'all', label: 'All', count: billingSubmissions.length },
                                                { id: 'approved', label: 'Approved', count: historyStats.approvedCount, color: '#15803d' },
                                                { id: 'pending', label: 'Under Review', count: historyStats.pendingCount, color: '#b45309' },
                                                { id: 'rejected', label: 'Rejected', count: historyStats.rejectedCount, color: '#b91c1c' }
                                            ].map(st => (
                                                <button
                                                    key={st.id}
                                                    type="button"
                                                    onClick={() => setHistoryStatusFilter(st.id)}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        border: `1px solid ${historyStatusFilter === st.id ? 'var(--primary)' : '#e2e8f0'}`,
                                                        background: historyStatusFilter === st.id ? '#eef2ff' : '#ffffff',
                                                        color: historyStatusFilter === st.id ? 'var(--primary)' : '#475569',
                                                        fontSize: '0.76rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {st.label} ({st.count})
                                                </button>
                                            ))}
                                        </div>

                                        {/* Search Input */}
                                        <div style={{ position: 'relative', minWidth: '220px' }}>
                                            <input
                                                type="text"
                                                value={historySearchQuery}
                                                onChange={(e) => setHistorySearchQuery(e.target.value)}
                                                placeholder="Search TID or Method..."
                                                style={{
                                                    width: '100%',
                                                    padding: '0.45rem 0.6rem 0.45rem 2rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '0.8rem',
                                                    outline: 'none'
                                                }}
                                            />
                                            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
                                            {historySearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setHistorySearchQuery('')}
                                                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                                                >
                                                    <X size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Results View */}
                                {filteredSubmissions.length === 0 ? (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '3.5rem 1.5rem',
                                        background: '#ffffff',
                                        borderRadius: '16px',
                                        border: '1px dashed #cbd5e1',
                                        color: '#64748b'
                                    }}>
                                        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto', color: '#94a3b8' }}>
                                            <FileText size={26} />
                                        </div>
                                        <h4 style={{ fontSize: '1.05rem', fontWeight: '800', margin: '0 0 0.35rem 0', color: '#1e293b' }}>
                                            No payment records found
                                        </h4>
                                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: '#94a3b8', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                                            {historyYearFilter !== 'all'
                                                ? `Year ${historyYearFilter} ke liye koi payments nahi milay.`
                                                : 'Aapne abhi tak koi subscription payment slip upload nahi ki.'}
                                        </p>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                            {historyYearFilter !== 'all' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryYearFilter('all')}
                                                    style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' }}
                                                >
                                                    Show All Years
                                                </button>
                                            )}
                                            {isDemoAccount && (
                                                <button
                                                    type="button"
                                                    onClick={handleInjectDemoBillingData}
                                                    disabled={injectingDemo}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '8px',
                                                        fontSize: '0.82rem',
                                                        fontWeight: '700',
                                                        border: '1px dashed #6366f1',
                                                        background: '#eef2ff',
                                                        color: '#4f46e5',
                                                        cursor: injectingDemo ? 'not-allowed' : 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    {injectingDemo ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                                                    <span>Inject Demo Records</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setBillingSubTab('pay')}
                                                className="btn-primary"
                                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}
                                            >
                                                Submit New Payment Slip
                                            </button>
                                        </div>
                                    </div>
                                ) : historyViewMode === 'cards' ? (
                                    /* CARDS VIEW */
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                                        {filteredSubmissions.map((sub) => {
                                            const dateStr = sub.submittedAt?.toDate
                                                ? sub.submittedAt.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : (sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : 'Recent');

                                            return (
                                                <div
                                                    key={sub.id}
                                                    style={{
                                                        background: '#ffffff',
                                                        borderRadius: '16px',
                                                        border: '1px solid #e2e8f0',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                                        padding: '1.25rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '1rem',
                                                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                                                    }}
                                                >
                                                    {/* Card Header: Date & Status */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>
                                                            {dateStr}
                                                        </span>
                                                        {sub.status === 'approved' ? (
                                                            <span style={{
                                                                padding: '3px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800',
                                                                background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '3px'
                                                            }}>
                                                                <Check size={12} /> Approved
                                                            </span>
                                                        ) : sub.status === 'rejected' ? (
                                                            <span style={{
                                                                padding: '3px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800',
                                                                background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '3px'
                                                            }}>
                                                                <X size={12} /> Rejected
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                padding: '3px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800',
                                                                background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '3px'
                                                            }}>
                                                                <Clock size={12} /> Under Review
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Amount & Plan Cycle */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                                        <div>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' }}>Amount Paid</span>
                                                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a' }}>
                                                                ₨ {Number(sub.amount || 0).toLocaleString()}
                                                            </div>
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            fontWeight: '800',
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            background: sub.cycle === 'yearly' ? '#fef3c7' : '#e0e7ff',
                                                            color: sub.cycle === 'yearly' ? '#b45309' : '#4338ca'
                                                        }}>
                                                            {sub.cycle === 'yearly' ? '⭐ Yearly Plan' : '📅 Monthly Plan'}
                                                        </span>
                                                    </div>

                                                    {/* Method & TID with Copy */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Payment Method:</span>
                                                            <PaymentMethodLogo name={sub.paymentMethod} size="sm" />
                                                        </div>

                                                        <div>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Transaction ID (TID):</span>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: '800', color: '#0f172a' }}>
                                                                    {sub.transactionId}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyField(sub.transactionId, `tid_${sub.id}`)}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: copiedField === `tid_${sub.id}` ? '#dcfce7' : '#e2e8f0',
                                                                        color: copiedField === `tid_${sub.id}` ? '#15803d' : '#475569',
                                                                        padding: '2px 6px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '700',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px'
                                                                    }}
                                                                >
                                                                    {copiedField === `tid_${sub.id}` ? <Check size={11} /> : <Copy size={11} />}
                                                                    {copiedField === `tid_${sub.id}` ? 'Copied' : 'Copy'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Slip Proof Thumbnail Preview */}
                                                    {sub.proofUrl && (
                                                        <div>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Payment Proof Slip:</span>
                                                            <div
                                                                onClick={() => setViewingSlipModalUrl(sub.proofUrl)}
                                                                style={{
                                                                    position: 'relative',
                                                                    height: '110px',
                                                                    borderRadius: '8px',
                                                                    overflow: 'hidden',
                                                                    cursor: 'pointer',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: '#0f172a',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center'
                                                                }}
                                                            >
                                                                <img
                                                                    src={sub.proofUrl}
                                                                    alt="Payment Proof"
                                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                                />
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    bottom: 0,
                                                                    left: 0,
                                                                    right: 0,
                                                                    background: 'rgba(15, 23, 42, 0.75)',
                                                                    color: 'white',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '700',
                                                                    padding: '4px',
                                                                    textAlign: 'center',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <Eye size={12} /> Click to Inspect Full Slip
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Rejection alert box if rejected */}
                                                    {sub.status === 'rejected' && sub.rejectReason && (
                                                        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.6rem', fontSize: '0.75rem', color: '#991b1b' }}>
                                                            <strong>Admin Reason:</strong> {sub.rejectReason}
                                                        </div>
                                                    )}

                                                    {/* Card Actions Footer */}
                                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                                                        {sub.proofUrl && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setViewingSlipModalUrl(sub.proofUrl)}
                                                                style={{
                                                                    flex: 1,
                                                                    padding: '0.5rem',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: '#f8fafc',
                                                                    color: '#0f172a',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '700',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <Eye size={13} /> View Slip
                                                            </button>
                                                        )}
                                                        {sub.proofUrl && (
                                                            <a
                                                                href={sub.proofUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    padding: '0.5rem 0.75rem',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: '#ffffff',
                                                                    color: '#475569',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '700',
                                                                    textDecoration: 'none',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                                title="Download Original"
                                                            >
                                                                <ExternalLink size={13} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* TABLE VIEW */
                                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                                        <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: '700' }}>Date & Time</th>
                                                        <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: '700' }}>Cycle & Amount</th>
                                                        <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: '700' }}>Method & TID</th>
                                                        <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: '700' }}>Proof Slip</th>
                                                        <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: '700' }}>Approval Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredSubmissions.map((sub) => {
                                                        const dateStr = sub.submittedAt?.toDate
                                                            ? sub.submittedAt.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                            : (sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : 'Recent');

                                                        return (
                                                            <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '0.85rem 1rem', fontWeight: '600', color: '#0f172a' }}>
                                                                    {dateStr}
                                                                </td>
                                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                                    <div style={{ fontWeight: '800', color: '#0f172a' }}>₨ {Number(sub.amount || 0).toLocaleString()}</div>
                                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'capitalize' }}>{sub.cycle} Plan</div>
                                                                </td>
                                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                                    <div style={{ marginBottom: '4px' }}>
                                                                        <PaymentMethodLogo name={sub.paymentMethod} size="sm" />
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#f59e0b', fontWeight: '700' }}>{sub.transactionId}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleCopyField(sub.transactionId, `tbl_tid_${sub.id}`)}
                                                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '1px' }}
                                                                            title="Copy TID"
                                                                        >
                                                                            {copiedField === `tbl_tid_${sub.id}` ? <Check size={12} color="#15803d" /> : <Copy size={12} />}
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                                    {sub.proofUrl ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setViewingSlipModalUrl(sub.proofUrl)}
                                                                            style={{
                                                                                padding: '4px 10px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #cbd5e1',
                                                                                background: '#f8fafc',
                                                                                color: '#334155',
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: '600',
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}
                                                                        >
                                                                            <Eye size={13} /> View Slip
                                                                        </button>
                                                                    ) : (
                                                                        <span style={{ color: '#94a3b8' }}>-</span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                                    {sub.status === 'approved' ? (
                                                                        <span style={{
                                                                            padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800',
                                                                            background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0'
                                                                        }}>
                                                                            ✓ Approved
                                                                        </span>
                                                                    ) : sub.status === 'rejected' ? (
                                                                        <div>
                                                                            <span style={{
                                                                                padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800',
                                                                                background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca'
                                                                            }}>
                                                                                ✕ Rejected
                                                                            </span>
                                                                            {sub.rejectReason && (
                                                                                <div style={{ fontSize: '0.72rem', color: '#b91c1c', marginTop: '4px' }}>
                                                                                    {sub.rejectReason}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span style={{
                                                                            padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800',
                                                                            background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a'
                                                                        }}>
                                                                            ⏱ Under Review
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'import' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {schoolId ? <BulkUploadCard schoolId={schoolId} /> : <div>Generating School ID...</div>}
                    </div>
                )}

                {activeTab === 'upload_syllabus' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {schoolId ? <UploadSyllabusTab schoolId={schoolId} /> : <div>Generating School ID...</div>}
                    </div>
                )}

                {activeTab === 'ai_assistant' && (
                    <div style={{
                        background: '#ffffff',
                        padding: '2rem',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        animation: 'fadeIn 0.3s ease-out'
                    }}>
                        {/* Info Header Card */}
                        <div style={{
                            padding: '1.25rem', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)',
                            border: '1px solid #dbeafe', borderRadius: '12px',
                            display: 'flex', alignItems: 'flex-start', gap: '1rem'
                        }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: '#4f46e5', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: 'white', flexShrink: 0
                            }}>
                                <Bot size={22} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: '700', color: '#1e1b4b' }}>
                                    Principal AI Copilot Settings
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: '1.4' }}>
                                    Your AI Copilot provides answers grounded in live school data (Fees, Salaries, Exams, and Attendance). Connect your free <strong>Google Gemini API Key</strong> for advanced conversational intelligence.
                                </p>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div style={{
                            padding: '0.9rem 1.2rem', borderRadius: '10px',
                            background: aiSettings.apiKey ? '#f0fdf4' : '#f8fafc',
                            border: `1px solid ${aiSettings.apiKey ? '#bbf7d0' : '#e2e8f0'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div style={{
                                    width: '10px', height: '10px', borderRadius: '50%',
                                    background: aiSettings.apiKey ? '#22c55e' : '#3b82f6',
                                    boxShadow: aiSettings.apiKey ? '0 0 8px #22c55e' : '0 0 8px #3b82f6'
                                }} />
                                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: aiSettings.apiKey ? '#15803d' : '#334155' }}>
                                    {aiSettings.apiKey ? 'Google Gemini AI Connected (1,500 Free Requests/Day)' : 'Instant Smart Engine Active (100% Free & Unlimited)'}
                                </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', background: 'white', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: '600' }}>
                                Multi-Tenant BYOK
                            </span>
                        </div>

                        {/* Settings Form */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={labelStyle}>AI Assistant Name / Title</label>
                                <input
                                    type="text"
                                    value={aiSettings.botName}
                                    onChange={(e) => setAiSettings({ ...aiSettings, botName: e.target.value })}
                                    placeholder="e.g. Principal AI Copilot"
                                    style={inputStyle()}
                                />
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                    <label style={{ ...labelStyle, marginBottom: 0 }}>Google Gemini API Key (Optional)</label>
                                    <a
                                        href="https://aistudio.google.com/app/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            fontSize: '0.75rem', color: '#4f46e5', fontWeight: '600',
                                            display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none'
                                        }}
                                    >
                                        Get Free Key from Google AI Studio <ExternalLink size={12} />
                                    </a>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="password"
                                        value={aiSettings.apiKey}
                                        onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                                        placeholder="AIzaSy..."
                                        style={{ ...inputStyle(), fontFamily: 'monospace', paddingLeft: '2.5rem' }}
                                    />
                                    <Key size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)' }} />
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', margin: 0 }}>
                                    Yeh key aapke school ke database mein mehfooz rahegi. Agar blank chorenge toh system bina kisi API key ke built-in instant smart engine use karega.
                                </p>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveAiSettings}
                            disabled={savingAi}
                            className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%'
                            }}
                        >
                            {savingAi ? <Loader2 className="animate-spin" size={20} /> : (aiSavedSuccess ? <CheckCircle2 size={20} /> : <Save size={20} />)}
                            {savingAi ? 'Saving AI Settings...' : (aiSavedSuccess ? 'AI Settings Saved!' : 'Save AI Settings')}
                        </button>
                    </div>
                )}
            </div>
            </div>

            {/* View Slip Modal */}
            {viewingSlipModalUrl && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '1.5rem'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        maxWidth: '650px',
                        width: '100%',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                    }}>
                        <div style={{
                            padding: '1rem 1.25rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid #e2e8f0',
                            background: '#f8fafc'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={18} color="var(--primary)" />
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                                    Payment Receipt / Slip Preview
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setViewingSlipModalUrl(null)}
                                style={{
                                    border: 'none',
                                    background: '#e2e8f0',
                                    borderRadius: '8px',
                                    padding: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#475569'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', justifyContent: 'center', background: '#0f172a' }}>
                            <img
                                src={viewingSlipModalUrl}
                                alt="Payment Proof"
                                style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px' }}
                            />
                        </div>
                        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: '#f8fafc' }}>
                            <a
                                href={viewingSlipModalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary"
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                Open Full Size <ExternalLink size={14} />
                            </a>
                            <button
                                type="button"
                                onClick={() => setViewingSlipModalUrl(null)}
                                className="btn-primary"
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600' }}
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .settings-scrollable-content::-webkit-scrollbar {
                    width: 6px;
                }
                .settings-scrollable-content::-webkit-scrollbar-track {
                    background: transparent;
                }
                .settings-scrollable-content::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 999px;
                }
                .settings-scrollable-content::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
                @media (max-width: 768px) {
                    .settings-studio-container {
                        height: auto !important;
                        max-height: none !important;
                        overflow: visible !important;
                    }
                    .settings-studio-grid {
                        grid-template-columns: 1fr !important;
                        overflow: visible !important;
                    }
                    .settings-scrollable-content {
                        height: auto !important;
                        overflow-y: visible !important;
                        padding-right: 0 !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default Settings;
