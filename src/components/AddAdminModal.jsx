import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Save, Shield, Check, Loader2, CheckCheck, Square, 
    ChevronDown, ChevronUp, Sparkles, Sliders, DollarSign, 
    Smartphone, LayoutGrid, Users as UsersIcon, ShieldAlert,
    Wallet, FileText, CheckCircle2
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, functions } from '../firebase';
import { PERMISSIONS_LIST, DEFAULT_ADMIN_PERMISSIONS, FEE_SUB_PERMISSIONS } from '../constants/permissions';

const normalizePermissions = (rawPerms) => {
    if (!rawPerms) return { ...DEFAULT_ADMIN_PERMISSIONS };
    const normalized = { ...DEFAULT_ADMIN_PERMISSIONS };

    PERMISSIONS_LIST.forEach(perm => {
        if (typeof rawPerms[perm.id] === 'boolean') {
            normalized[perm.id] = rawPerms[perm.id];
        } else {
            // Legacy fallbacks only when the new key is not defined at all
            if (perm.id === 'canManageCollections') {
                normalized.canManageCollections = rawPerms.canEditFees === true;
            } else if (perm.id === 'canManageClasses') {
                normalized.canManageClasses = rawPerms.canEditClasses === true || rawPerms.canEditStudents === true;
            } else if (perm.id === 'canManageTeachers') {
                normalized.canManageTeachers = rawPerms.canEditTeachers === true;
            }
        }
    });

    const hasAnySubExplicit = FEE_SUB_PERMISSIONS.some(sub => typeof rawPerms[sub.id] === 'boolean');
    FEE_SUB_PERMISSIONS.forEach(sub => {
        if (typeof rawPerms[sub.id] === 'boolean') {
            normalized[sub.id] = rawPerms[sub.id];
        } else if (!hasAnySubExplicit && normalized.canManageCollections) {
            // Legacy admin that had full collections access before sub-perms were introduced
            normalized[sub.id] = true;
        } else {
            normalized[sub.id] = sub.isDefaultCashier && normalized.canManageCollections;
        }
    });

    return normalized;
};

const AddAdminModal = ({ onClose, userToEdit, schoolId }) => {
    const [formData, setFormData] = useState({
        displayName: userToEdit?.displayName || userToEdit?.name || '',
        email: userToEdit?.email || '',
        password: '', // Only for new users
        permissions: normalizePermissions(userToEdit?.permissions)
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showFeeSubOptions, setShowFeeSubOptions] = useState(true);

    const handlePermissionChange = (permId) => {
        const nextState = !formData.permissions[permId];
        const updatedPerms = {
            ...formData.permissions,
            [permId]: nextState
        };

        // If toggling Fee Collections
        if (permId === 'canManageCollections') {
            if (nextState) {
                // If toggled ON, and all sub-permissions are currently false, default to Cashier preset
                const anySubActive = FEE_SUB_PERMISSIONS.some(sub => formData.permissions[sub.id]);
                if (!anySubActive) {
                    FEE_SUB_PERMISSIONS.forEach(sub => {
                        updatedPerms[sub.id] = sub.isDefaultCashier;
                    });
                }
            } else {
                // If toggled OFF, disable all sub-permissions
                FEE_SUB_PERMISSIONS.forEach(sub => {
                    updatedPerms[sub.id] = false;
                });
            }
        }

        setFormData(prev => ({
            ...prev,
            permissions: updatedPerms
        }));
    };

    const handleSubPermissionChange = (subId) => {
        const nextSubState = !formData.permissions[subId];
        const updatedPerms = {
            ...formData.permissions,
            [subId]: nextSubState
        };

        // If turning a sub-permission ON, ensure master collections permission is ON
        if (nextSubState) {
            updatedPerms.canManageCollections = true;
        } else {
            // If turning OFF, check if any remaining sub-permission is still ON
            const hasOtherActive = FEE_SUB_PERMISSIONS.some(sub => sub.id !== subId && updatedPerms[sub.id]);
            if (!hasOtherActive) {
                // Optional: keep canManageCollections or set to false
                // If no tabs are allowed, turn off master collections
                updatedPerms.canManageCollections = false;
            }
        }

        setFormData(prev => ({
            ...prev,
            permissions: updatedPerms
        }));
    };

    const applyFeePreset = (presetType) => {
        const updated = {
            ...formData.permissions,
            canManageCollections: true
        };

        if (presetType === 'cashier') {
            updated.canViewFeeDailyWorkflow = true;
            updated.canViewFeeOnlineSubmissions = true;
            updated.canViewFeeMatrix = false;
            updated.canViewFeeFinances = false;
            updated.canViewFeePayroll = false;
        } else if (presetType === 'cashier_matrix') {
            updated.canViewFeeDailyWorkflow = true;
            updated.canViewFeeOnlineSubmissions = true;
            updated.canViewFeeMatrix = true;
            updated.canViewFeeFinances = false;
            updated.canViewFeePayroll = false;
        } else if (presetType === 'full') {
            updated.canViewFeeDailyWorkflow = true;
            updated.canViewFeeOnlineSubmissions = true;
            updated.canViewFeeMatrix = true;
            updated.canViewFeeFinances = true;
            updated.canViewFeePayroll = true;
        }

        setFormData(prev => ({
            ...prev,
            permissions: updated
        }));
    };

    const handleSelectAll = (select) => {
        const updated = {};
        PERMISSIONS_LIST.forEach(p => {
            updated[p.id] = select;
        });
        FEE_SUB_PERMISSIONS.forEach(s => {
            updated[s.id] = select;
        });
        setFormData(prev => ({
            ...prev,
            permissions: updated
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!schoolId) {
            setError("School ID is missing. Cannot proceed.");
            setLoading(false);
            return;
        }

        try {
            // 1. EDIT MODE
            if (userToEdit) {
                const userRef = doc(db, `schools/${schoolId}/admin_users`, userToEdit.id);
                await updateDoc(userRef, {
                    displayName: formData.displayName,
                    permissions: formData.permissions,
                    updatedAt: serverTimestamp()
                });

                // Password Reset Logic
                if (formData.password && formData.password.length >= 6) {
                    const updatePasswordFn = httpsCallable(functions, 'updateSchoolUserPassword');
                    await updatePasswordFn({
                        targetUid: userToEdit.id,
                        newPassword: formData.password,
                        schoolId: schoolId
                    });
                }
            }
            // 2. CREATE MODE (Via Cloud Function)
            else {
                if (!formData.password || formData.password.length < 6) {
                    throw new Error("Password must be at least 6 characters");
                }

                const createSchoolUserFn = httpsCallable(functions, 'createSchoolUser');

                await createSchoolUserFn({
                    email: formData.email,
                    password: formData.password,
                    name: formData.displayName,
                    role: 'school Admin',
                    schoolId: schoolId,
                    permissions: formData.permissions
                });
            }

            onClose(true); // Close and refresh
        } catch (err) {
            console.error("Error saving admin:", err);
            // Handle specific Cloud Function errors if wrapped
            if (err.message.includes('email-already-in-use') || err.code === 'already-exists') {
                setError("An account with this email already exists.");
            } else {
                setError(err.message || "Failed to save admin user");
            }
        } finally {
            setLoading(false);
        }
    };

    const isCollectionsChecked = !!formData.permissions.canManageCollections;
    const activeFeeSubCount = FEE_SUB_PERMISSIONS.filter(s => formData.permissions[s.id]).length;

    // Use React Portal to render the modal at the document body level
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Shield className="text-indigo-600" size={24} />
                            {userToEdit ? 'Edit Admin Profile' : 'New Admin Account'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Configure access rights and granular tab permissions</p>
                    </div>
                    <button
                        onClick={() => onClose(false)}
                        className="p-2 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all shadow-sm"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar bg-[#f8fafc]/50">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-3 shadow-sm">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <Shield className="size-5 text-red-500" />
                            </div>
                            <span className="font-medium">{error}</span>
                        </div>
                    )}

                    <form id="admin-form" onSubmit={handleSubmit} autoComplete="off" className="space-y-6">

                        {/* Basic Info Section */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className="w-1 h-4 bg-indigo-500 rounded-full"></span>
                                Account Details
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Display Name</label>
                                    <input
                                        type="text"
                                        name="admin_display_name"
                                        autoComplete="off"
                                        required
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-700 placeholder:text-slate-400"
                                        placeholder="e.g. Sarah Connor"
                                        value={formData.displayName}
                                        onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Email Address</label>
                                    <input
                                        type="email"
                                        name="admin_email_address"
                                        autoComplete="new-email"
                                        required
                                        disabled={!!userToEdit}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-700 placeholder:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
                                        placeholder="e.g. admin@school.com"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>

                                {!userToEdit ? (
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-sm font-semibold text-slate-700">Password</label>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                name="admin_account_password"
                                                autoComplete="new-password"
                                                required
                                                minLength={6}
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-700 placeholder:text-slate-400"
                                                placeholder="Set a strong temporary password"
                                                value={formData.password}
                                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1 pl-1">Min. 6 characters.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                Password Reset
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Optional</span>
                                            </label>
                                        </div>

                                        <input
                                            type="password"
                                            name="admin_reset_password"
                                            autoComplete="new-password"
                                            minLength={6}
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-700 placeholder:text-slate-400"
                                            placeholder="Enter new password to reset (leave empty to keep current)"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        />
                                        <p className="text-xs text-slate-400">Only enter if you requested a password reset for this admin.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Permissions Section */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                                    Access Control & Page Permissions
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleSelectAll(true)}
                                        className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold transition-colors flex items-center gap-1"
                                    >
                                        <CheckCheck size={14} />
                                        Select All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSelectAll(false)}
                                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold transition-colors flex items-center gap-1"
                                    >
                                        <Square size={12} />
                                        Clear All
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {PERMISSIONS_LIST.map(perm => {
                                    const isChecked = !!formData.permissions[perm.id];
                                    const isCollectionsPerm = perm.id === 'canManageCollections';

                                    return (
                                        <React.Fragment key={perm.id}>
                                            <div
                                                className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 ${isChecked
                                                    ? 'bg-indigo-50/60 border-indigo-200 shadow-sm ring-1 ring-indigo-500/10'
                                                    : 'bg-slate-50/50 border-slate-200/80 hover:bg-white hover:border-slate-300 hover:shadow-sm'
                                                    } ${isCollectionsPerm && isChecked ? 'sm:col-span-2' : ''}`}
                                            >
                                                <div 
                                                    onClick={() => handlePermissionChange(perm.id)}
                                                    className={`mt-0.5 relative flex-shrink-0 w-5 h-5 rounded-md border-2 cursor-pointer transition-all duration-200 flex items-center justify-center ${isChecked
                                                        ? 'bg-indigo-600 border-indigo-600'
                                                        : 'bg-white border-slate-300 group-hover:border-indigo-400'
                                                        }`}
                                                >
                                                    <Check size={12} className={`text-white transition-transform duration-200 ${isChecked ? 'scale-100' : 'scale-0'}`} strokeWidth={3} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div 
                                                        onClick={() => handlePermissionChange(perm.id)}
                                                        className="flex items-center justify-between gap-1 cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-sm font-semibold transition-colors ${isChecked ? 'text-indigo-950' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                                                {perm.label}
                                                            </span>
                                                            {isCollectionsPerm && isChecked && (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                                                    {activeFeeSubCount}/5 Tabs Active
                                                                </span>
                                                            )}
                                                        </div>
                                                        {perm.category && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
                                                                {perm.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p 
                                                        onClick={() => handlePermissionChange(perm.id)}
                                                        className="text-xs text-slate-400 mt-0.5 cursor-pointer"
                                                    >
                                                        {perm.description}
                                                    </p>

                                                    {/* Nested Fee Sub-Permissions Box (Granular Tab Controls) */}
                                                    {isCollectionsPerm && isChecked && (
                                                        <div className="mt-3.5 pt-3 border-t border-indigo-100 bg-white/80 rounded-xl p-3 shadow-2xs border border-indigo-50">
                                                            {/* Sub Header & Presets */}
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                                                <div className="flex items-center gap-1.5">
                                                                    <Sliders size={13} className="text-indigo-600" />
                                                                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                                                        Fee Tabs & Sub-Permissions:
                                                                    </span>
                                                                </div>

                                                                {/* Quick Presets */}
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => applyFeePreset('cashier')}
                                                                        className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/70 transition-all"
                                                                        title="Only Daily Workflow & Online Submissions"
                                                                    >
                                                                        ⚡ Cashier Preset
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => applyFeePreset('cashier_matrix')}
                                                                        className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/70 transition-all"
                                                                        title="Daily Workflow + Online Submissions + Monthly Fee Matrix"
                                                                    >
                                                                        📊 Cashier + Matrix
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => applyFeePreset('full')}
                                                                        className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/70 transition-all"
                                                                        title="Unlock all 5 tabs including Finances & Staff Payroll"
                                                                    >
                                                                        💼 Full Finance
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* 5 Sub Toggles */}
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {FEE_SUB_PERMISSIONS.map(sub => {
                                                                    const isSubActive = !!formData.permissions[sub.id];
                                                                    const isSensitive = sub.id === 'canViewFeeFinances' || sub.id === 'canViewFeePayroll';

                                                                    return (
                                                                        <label
                                                                            key={sub.id}
                                                                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${isSubActive
                                                                                ? isSensitive 
                                                                                    ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/20' 
                                                                                    : 'bg-indigo-50/80 border-indigo-200 ring-1 ring-indigo-400/20'
                                                                                : 'bg-white border-slate-200/80 hover:bg-slate-50'
                                                                                }`}
                                                                        >
                                                                            <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border transition-all flex items-center justify-center ${isSubActive
                                                                                ? isSensitive ? 'bg-amber-600 border-amber-600' : 'bg-indigo-600 border-indigo-600'
                                                                                : 'bg-white border-slate-300'
                                                                                }`}>
                                                                                <Check size={10} className={`text-white transition-transform ${isSubActive ? 'scale-100' : 'scale-0'}`} strokeWidth={3} />
                                                                            </div>
                                                                            <input
                                                                                type="checkbox"
                                                                                className="hidden"
                                                                                checked={isSubActive}
                                                                                onChange={() => handleSubPermissionChange(sub.id)}
                                                                            />
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center justify-between gap-1">
                                                                                    <span className={`text-xs font-bold ${isSubActive ? 'text-slate-900' : 'text-slate-600'}`}>
                                                                                        {sub.label}
                                                                                    </span>
                                                                                    {isSensitive && (
                                                                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700">
                                                                                            Sensitive
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                                                                                    {sub.description}
                                                                                </p>
                                                                            </div>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>

                    </form>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
                    <button
                        type="button"
                        onClick={() => onClose(false)}
                        className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors text-sm"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="admin-form"
                        disabled={loading}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl transition-all shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                <span>{userToEdit ? 'Save Changes' : 'Create Admin Account'}</span>
                            </>
                        )}
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default AddAdminModal;
