import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Shield, Check, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, functions } from '../firebase';

const PERMISSIONS_LIST = [
    { id: 'canManageAdmissions', label: 'New Admissions' },
    { id: 'canEditStudents', label: 'Manage Students' },
    { id: 'canEditTeachers', label: 'Manage Teachers' },
    { id: 'canManageParents', label: 'Manage Parents' },
    { id: 'canEditFees', label: 'Manage Fees & Collections' },
    { id: 'canEditClasses', label: 'Manage Classes' },
    { id: 'canManagePromotions', label: 'Promotions' },
    { id: 'canManageNewsFeed', label: 'News Feed' },
    { id: 'canViewReports', label: 'View Reports' },
    { id: 'canManageSettings', label: 'System Settings' }
];

const AddAdminModal = ({ onClose, userToEdit, schoolId }) => {
    const [formData, setFormData] = useState({
        displayName: userToEdit?.displayName || '',
        email: userToEdit?.email || '',
        password: '', // Only for new users
        permissions: userToEdit?.permissions || {
            canManageAdmissions: true,
            canEditStudents: true,
            canEditTeachers: false,
            canManageParents: false,
            canEditFees: false,
            canEditClasses: false,
            canManagePromotions: false,
            canManageNewsFeed: false,
            canViewReports: true,
            canManageSettings: false
        }
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handlePermissionChange = (permId) => {
        setFormData(prev => ({
            ...prev,
            permissions: {
                ...prev.permissions,
                [permId]: !prev.permissions[permId]
            }
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
                        <p className="text-xs text-slate-500 mt-1">Configure access rights and user details</p>
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

                    <form id="admin-form" onSubmit={handleSubmit} className="space-y-6">

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
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                                Access Control
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {PERMISSIONS_LIST.map(perm => (
                                    <label
                                        key={perm.id}
                                        className={`group flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${formData.permissions[perm.id]
                                            ? 'bg-indigo-50/50 border-indigo-200 shadow-sm'
                                            : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:border-slate-300 hover:shadow-sm'
                                            }`}
                                    >
                                        <div className={`relative flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center ${formData.permissions[perm.id]
                                            ? 'bg-indigo-600 border-indigo-600'
                                            : 'bg-white border-slate-300 group-hover:border-indigo-400'
                                            }`}>
                                            <Check size={12} className={`text-white transition-transform duration-200 ${formData.permissions[perm.id] ? 'scale-100' : 'scale-0'}`} strokeWidth={3} />
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={!!formData.permissions[perm.id]}
                                            onChange={() => handlePermissionChange(perm.id)}
                                        />
                                        <span className={`text-sm font-medium transition-colors ${formData.permissions[perm.id] ? 'text-indigo-900' : 'text-slate-600 group-hover:text-slate-900'
                                            }`}>
                                            {perm.label}
                                        </span>
                                    </label>
                                ))}
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
