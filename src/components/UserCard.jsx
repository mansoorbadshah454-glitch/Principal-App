import React from 'react';
import { User, Trash2, Edit2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

const UserCard = ({ user, onDelete, onEdit }) => {
    return (
        <div className="card hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-slate-100 bg-white overflow-hidden group relative">
            {/* Top decorative gradient line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

            <div className="p-5">
                <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform duration-300">
                                {(user.name || user.displayName) ? (user.name || user.displayName).charAt(0).toUpperCase() : <User size={28} />}
                            </div>
                            {/* Role Badge overlapping profile */}
                            <div className="absolute -bottom-2 -right-2 bg-white px-2 py-0.5 rounded-md shadow-sm border border-slate-100">
                                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                                    Admin
                                </span>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-bold text-slate-800 text-lg leading-tight group-hover:text-indigo-600 transition-colors">
                                {user.name || user.displayName || 'Admin User'}
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                                {user.email}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                            onClick={() => onEdit(user)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Edit Permissions"
                        >
                            <Edit2 size={18} />
                        </button>
                        <button
                            onClick={() => onDelete(user.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Remove Admin"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>

                <div className="border-t border-slate-50 pt-4 mt-2">
                    <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck size={14} className="text-indigo-500" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Active Permissions</span>
                    </div>

                    <div className="flex flex-wrap gap-2 min-h-[40px]">
                        {user.permissions && Object.entries(user.permissions).map(([key, value]) => {
                            if (!value) return null;
                            // Format the key for display
                            // e.g. 'canEditStudents' -> 'Students'
                            let label = key.replace(/^can(Edit|Manage|View)?/, '').replace(/([A-Z])/g, ' $1').trim();

                            // Fallback/Custom adjustment
                            if (key === 'canManageNewsFeed') label = 'News Feed';
                            if (key === 'canManageSettings') label = 'Settings';
                            if (key === 'canViewReports') label = 'Reports';
                            if (key === 'canManageAdmissions') label = 'Admissions';
                            if (key === 'canManageParents') label = 'Parents';
                            if (key === 'canManagePromotions') label = 'Promotions';

                            if (!label) label = key; // Safety

                            return (
                                <span key={key} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                                    {label}
                                </span>
                            );
                        })}
                        {(!user.permissions || Object.values(user.permissions).every(v => !v)) && (
                            <span className="text-xs text-slate-400 italic flex items-center gap-1 pl-1">
                                <ShieldAlert size={12} />
                                No specific permissions
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-slate-50/80 px-5 py-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 font-medium">
                <span>Joined</span>
                <span>{user.createdAt?.toDate().toLocaleDateString() || 'N/A'}</span>
            </div>
        </div>
    );
};

export default UserCard;
