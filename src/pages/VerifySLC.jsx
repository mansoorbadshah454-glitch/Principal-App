import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import {
    ShieldCheck, CheckCircle2, AlertTriangle, Building2, User, Calendar,
    Award, GraduationCap, Printer, Copy, Check, ExternalLink, Phone,
    Mail, MapPin, Search, ArrowLeft, Stamp, FileText, BadgeCheck, Clock,
    Sparkles, ShieldAlert
} from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

// Formal date in words helper for public page
function formatDateWords(dobStr) {
    if (!dobStr) return 'N/A';
    try {
        const parts = dobStr.split('-');
        if (parts.length !== 3) return dobStr;
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const ones = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
            'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth',
            'Twenty-First', 'Twenty-Second', 'Twenty-Third', 'Twenty-Fourth', 'Twenty-Fifth', 'Twenty-Sixth', 'Twenty-Seventh', 'Twenty-Eighth', 'Twenty-Ninth', 'Thirtieth', 'Thirty-First'];
        return `${ones[day] || day} of ${months[month]} ${year}`;
    } catch (e) {
        return dobStr;
    }
}

// Dynamic Multi-Source School Profile Resolver (settings/profile primary + schools/{id} secondary)
async function fetchLiveSchoolProfile(sId) {
    if (!sId) return null;
    try {
        let pData = null;
        try {
            const pDoc = await getDoc(doc(db, `schools/${sId}/settings`, 'profile'));
            if (pDoc.exists()) pData = pDoc.data();
        } catch (e) {}

        let rData = null;
        try {
            const rDoc = await getDoc(doc(db, 'schools', sId));
            if (rDoc.exists()) rData = rDoc.data();
        } catch (e) {}

        const name = pData?.name || pData?.schoolName || rData?.schoolName || rData?.name || '';
        const logo = pData?.profileImage || pData?.logo || pData?.logoUrl || rData?.profileImage || rData?.logoUrl || rData?.logo || '';
        const address = pData?.address || rData?.address || '';
        const phone = pData?.phone || pData?.landline || rData?.phone || rData?.contact || '';
        const email = pData?.email || rData?.email || '';

        return { name, logo, address, phone, email };
    } catch (e) {
        return null;
    }
}

export default function VerifySLC() {
    const [searchParams] = useSearchParams();
    const routeParams = useParams();

    const certId = routeParams.certId || searchParams.get('id') || searchParams.get('certId') || '';
    const schoolId = searchParams.get('schoolId') || '';
    const previewPayloadStr = searchParams.get('p') || searchParams.get('d') || '';

    const [loading, setLoading] = useState(true);
    const [record, setRecord] = useState(null);
    const [isInvalid, setIsInvalid] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let isMounted = true;

        // Auto-hydrate record with live School Logo and identity from Firestore if missing or generic
        async function hydrateRecord(raw) {
            if (!raw) return raw;
            const targetSchoolId = raw.schoolId || schoolId;
            if (!targetSchoolId) return raw;

            if (!raw.schoolLogo || !raw.schoolName || raw.schoolName === 'OFFICIAL SCHOOL REGISTRY' || raw.schoolName === 'Official School Registry') {
                const liveProfile = await fetchLiveSchoolProfile(targetSchoolId);
                if (liveProfile) {
                    return {
                        ...raw,
                        schoolId: targetSchoolId,
                        schoolName: liveProfile.name || raw.schoolName || 'Official School Registry',
                        schoolLogo: liveProfile.logo || raw.schoolLogo || '',
                        schoolAddress: liveProfile.address || raw.schoolAddress || '',
                        schoolPhone: liveProfile.phone || raw.schoolPhone || '',
                        schoolEmail: liveProfile.email || raw.schoolEmail || ''
                    };
                }
            }
            return raw;
        }

        async function fetchVerification() {
            setLoading(true);
            setIsInvalid(false);

            // 1. Check if real-time live canvas preview data was supplied in URL
            if (previewPayloadStr) {
                try {
                    const decoded = JSON.parse(decodeURIComponent(atob(previewPayloadStr)));
                    if (decoded && (decoded.certificateNo || decoded.studentName)) {
                        const hydrated = await hydrateRecord({
                            ...decoded,
                            isPreview: true,
                            status: 'LIVE_PREVIEW'
                        });
                        if (isMounted) {
                            setRecord(hydrated);
                            setLoading(false);
                        }
                        return;
                    }
                } catch (e) {
                    console.warn("[VerifySLC] Preview payload decode error, checking Firestore...", e);
                }
            }

            if (!certId) {
                if (isMounted) {
                    setIsInvalid(true);
                    setLoading(false);
                }
                return;
            }

            try {
                const cleanId = certId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

                // 2. Multi-Tenant Lookup: Check with schoolId prefix first to guarantee multi-school isolation
                if (schoolId) {
                    const tenantDocId = `${schoolId}_${cleanId}`;
                    const tenantRef = doc(db, 'public_certificates', tenantDocId);
                    const tenantSnap = await getDoc(tenantRef);
                    if (tenantSnap.exists()) {
                        const hydrated = await hydrateRecord(tenantSnap.data());
                        if (isMounted) {
                            setRecord(hydrated);
                            setLoading(false);
                        }
                        return;
                    }
                }

                // 3. Direct ID lookup in public_certificates
                const directRef = doc(db, 'public_certificates', cleanId);
                const directSnap = await getDoc(directRef);
                if (directSnap.exists()) {
                    const hydrated = await hydrateRecord(directSnap.data());
                    if (isMounted) {
                        setRecord(hydrated);
                        setLoading(false);
                    }
                    return;
                }

                // 4. Query public_certificates by certificateNo
                const queryConditions = [where('certificateNo', '==', certId.replace(/_/g, '/'))];
                if (schoolId) {
                    queryConditions.push(where('schoolId', '==', schoolId));
                }
                const pubQuery = query(collection(db, 'public_certificates'), ...queryConditions);
                const pubSnap = await getDocs(pubQuery);
                if (!pubSnap.empty) {
                    const hydrated = await hydrateRecord(pubSnap.docs[0].data());
                    if (isMounted) {
                        setRecord(hydrated);
                        setLoading(false);
                    }
                    return;
                }

                // 5. Query school internal slc_history subcollection if schoolId is known
                if (schoolId) {
                    try {
                        const histQuery = query(
                            collection(db, `schools/${schoolId}/slc_history`),
                            where('certificateNo', '==', certId.replace(/_/g, '/'))
                        );
                        const histSnap = await getDocs(histQuery);
                        if (!histSnap.empty) {
                            const hData = histSnap.docs[0].data();
                            const hydrated = await hydrateRecord({
                                ...hData,
                                schoolId: schoolId,
                                status: 'ACTIVE_AUTHENTIC'
                            });

                            if (isMounted) {
                                setRecord(hydrated);
                                setLoading(false);
                            }
                            return;
                        }
                    } catch (e) {}
                }

                // If not found anywhere, mark as invalid (No fake dummy data!)
                if (isMounted) {
                    setIsInvalid(true);
                    setLoading(false);
                }
            } catch (err) {
                console.error("[VerifySLC] Verification lookup error:", err);
                if (isMounted) {
                    setIsInvalid(true);
                    setLoading(false);
                }
            }
        }

        fetchVerification();

        return () => {
            isMounted = false;
        };
    }, [certId, schoolId, previewPayloadStr]);

    const handleCopyLink = () => {
        try {
            navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {}
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-slate-100 py-6 px-3 sm:px-6 flex flex-col items-center justify-center font-sans selection:bg-indigo-500 selection:text-white">
            <div className="w-full max-w-2xl bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
                
                {/* TOP OFFICIAL BANNER: 100% THE SCHOOL'S OWN IDENTITY */}
                <div className="bg-slate-900 text-white p-5 sm:p-6 border-b-4 border-emerald-500">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 text-center sm:text-left">
                            {record?.schoolLogo ? (
                                <img
                                    src={record.schoolLogo}
                                    alt="School Crest"
                                    className="w-14 h-14 rounded-2xl object-cover bg-white p-1 border border-slate-700 shadow-md flex-shrink-0"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        const fb = document.getElementById('slc-school-fallback-crest');
                                        if (fb) fb.style.display = 'flex';
                                    }}
                                />
                            ) : null}
                            <div
                                id="slc-school-fallback-crest"
                                style={{ display: record?.schoolLogo ? 'none' : 'flex' }}
                                className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white items-center justify-center font-black shadow-md border border-white/20 flex-shrink-0"
                            >
                                <Building2 size={26} />
                            </div>
                            <div>
                                <h1 className="text-base sm:text-lg font-black tracking-tight uppercase font-serif text-slate-100">
                                    {record?.schoolName || 'OFFICIAL SCHOOL CREDENTIAL REGISTRY'}
                                </h1>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                    {record?.schoolAddress || 'Official School Leaving & Character Certificate Registry'}
                                </p>
                                {record?.schoolPhone && (
                                    <p className="text-[11px] text-emerald-400 font-medium">
                                        Campus Desk: {record.schoolPhone}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Digital Emblem */}
                        <div className="flex flex-col items-center justify-center bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex-shrink-0">
                            <BadgeCheck size={18} className="text-emerald-400" />
                            <span>Official Archive</span>
                        </div>
                    </div>
                </div>

                {/* BODY CONTENT */}
                <div className="p-5 sm:p-8">
                    {loading ? (
                        <div className="py-16 text-center space-y-4">
                            <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <h3 className="text-base font-black text-slate-800">Verifying Digital Document...</h3>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                Querying School 50-Year Permanent Archive and validating multi-tenant cryptographic signatures.
                            </p>
                        </div>
                    ) : isInvalid || !record ? (
                        <div className="py-10 text-center space-y-5">
                            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                                <AlertTriangle size={36} />
                            </div>
                            <div className="space-y-1.5">
                                <span className="inline-block px-3 py-1 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black uppercase tracking-wider rounded-full">
                                    Unverified / Invalid Certificate
                                </span>
                                <h3 className="text-xl font-black text-slate-900">Record Not Found in Official Registry</h3>
                                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                                    The certificate reference <strong className="text-slate-900">"{certId || 'Unknown'}"</strong> could not be validated against the active or archived registry of {schoolId ? `School ID (${schoolId})` : 'this institution'}. This certificate may be altered, fake, or not yet officially issued by the Principal.
                                </p>
                            </div>
                            <div className="pt-3">
                                <Link
                                    to="/login"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs"
                                >
                                    <ArrowLeft size={14} />
                                    <span>Return to School Portal</span>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Verification Status Card */}
                            {record.isPreview ? (
                                <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border-2 border-amber-500 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                                    <div className="flex items-center gap-3.5 text-center sm:text-left">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md flex-shrink-0">
                                            <Sparkles size={26} />
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-center sm:justify-start gap-2">
                                                <span className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                                                    Real-Time Canvas Studio Preview
                                                </span>
                                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                                            </div>
                                            <p className="text-xs text-amber-800 font-medium mt-0.5">
                                                Active Session Preview from School Principal Desk
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-center sm:text-right bg-white/90 px-3.5 py-1.5 rounded-xl border border-amber-200 text-xs font-black text-slate-800 shadow-2xs">
                                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Certificate No</span>
                                        <span className="text-indigo-900 font-black text-sm">{record.certificateNo}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-500/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                                    <div className="flex items-center gap-3.5 text-center sm:text-left">
                                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md flex-shrink-0">
                                            <ShieldCheck size={28} />
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-center sm:justify-start gap-2">
                                                <span className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wide">
                                                    Official Record Verified & Authentic
                                                </span>
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                                            </div>
                                            <p className="text-xs text-emerald-800 font-medium mt-0.5">
                                                Issued by School Principal & Archived in Digital Vault
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-center sm:text-right bg-white/90 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-xs font-black text-slate-800 shadow-2xs">
                                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Certificate No</span>
                                        <span className="text-indigo-900 font-black text-sm">{record.certificateNo}</span>
                                    </div>
                                </div>
                            )}

                            {/* Student Information Dossier */}
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Pupil Full Name</span>
                                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                                            {record.studentName}
                                        </h2>
                                        <p className="text-xs text-slate-600 font-medium">
                                            Father's Name: <strong className="text-slate-900 uppercase">{record.fatherName || 'N/A'}</strong>
                                        </p>
                                    </div>
                                    <div className="flex sm:flex-col items-center sm:items-end gap-1.5">
                                        <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-xs font-black">
                                            G.R No: {record.grNo || 'N/A'}
                                        </span>
                                        {record.rollNo && (
                                            <span className="text-[11px] font-bold text-slate-500">
                                                Roll #{record.rollNo}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Class in which Studied</span>
                                        <span className="font-extrabold text-slate-900 mt-0.5 block">
                                            {record.classAtLeaving} {record.session ? `(Session: ${record.session})` : ''}
                                        </span>
                                    </div>

                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Date of Birth</span>
                                        <span className="font-extrabold text-slate-900 mt-0.5 block">{record.dob || 'N/A'}</span>
                                        <span className="text-[10px] text-indigo-700 italic font-medium block">
                                            {formatDateWords(record.dob)}
                                        </span>
                                    </div>

                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Date of First Admission</span>
                                        <span className="font-bold text-slate-800 mt-0.5 block">{record.admissionDate || 'N/A'}</span>
                                    </div>

                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Date of Leaving / Striking Off</span>
                                        <span className="font-bold text-slate-800 mt-0.5 block">{record.leavingDate || 'N/A'}</span>
                                    </div>

                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Promotion Standing</span>
                                        <span className="font-black text-emerald-700 mt-0.5 block">
                                            {record.academicStanding || 'Qualified for Promotion'}
                                        </span>
                                    </div>

                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">School Dues Status</span>
                                        <span className="font-black text-emerald-700 mt-0.5 block">
                                            {record.duesStatusLabel || 'All Dues Paid in Full (100% Cleared)'}
                                        </span>
                                    </div>

                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 sm:col-span-2">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Moral Conduct & Character</span>
                                        <span className="font-bold text-slate-900 mt-0.5 block">{record.conduct || 'Exemplary / Very Good'}</span>
                                    </div>

                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 sm:col-span-2">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Reason for Leaving</span>
                                        <span className="font-bold text-slate-800 mt-0.5 block">{record.reason || 'Completed Academic Course'}</span>
                                    </div>

                                    {record.remarks && (
                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 sm:col-span-2">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">General Remarks</span>
                                            <p className="font-medium text-slate-700 mt-0.5 italic">"{record.remarks}"</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Digital Multi-School Audit Footprint */}
                            <div className="p-3.5 bg-slate-100 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
                                <div className="flex items-center gap-1.5">
                                    <Building2 size={13} className="text-slate-400" />
                                    <span>School UID: <code className="font-mono text-slate-800 font-bold">{record.schoolId || schoolId || 'ACTIVE'}</code></span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Stamp size={13} className="text-indigo-600" />
                                    <span>Security Token: <code className="font-mono text-indigo-900 font-bold">{record.securityHash || 'SEC-VALID'}</code></span>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs"
                                >
                                    <Printer size={14} />
                                    <span>Print Verification Sheet</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer transition-all shadow-2xs"
                                >
                                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                    <span>{copied ? 'Link Copied!' : 'Copy Verification Link'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* OFFICIAL PLATFORM BRANDING FOOTER */}
                <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-5 border-t border-slate-800 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-black text-xs text-white shadow-xs">
                            M
                        </div>
                        <span className="text-xs sm:text-sm font-black tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-cyan-200">
                            MAI SMS : The AI-Powered School Management System
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                        Official Multi-School Digital Verification & 50-Year Student Credential Archive Desk.
                    </p>
                    <div className="text-[10px] text-slate-500 font-mono pt-1">
                        Issued for: <strong className="text-slate-300">{record?.schoolName || 'Certified Educational Institution'}</strong> • Anti-Fraud Cryptographic Protocol Active
                    </div>
                </div>
            </div>
        </div>
    );
}
