import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { useAuthPermissions } from '../context/AuthPermissionsContext';

const ProtectedRoute = ({ children, requiredPermission, pageName = 'this page' }) => {
    const { hasAccess, isPrincipal, loading } = useAuthPermissions();
    const navigate = useNavigate();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-indigo-600 border-t-transparent" />
            </div>
        );
    }

    // Full access for principal or if user has the specific permission
    if (isPrincipal || hasAccess(requiredPermission)) {
        return children;
    }

    return (
        <div className="min-h-[70vh] flex items-center justify-center p-6 animate-fade-in-up">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-xl p-8 md:p-12 max-w-lg text-center relative overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl" />

                <div className="w-20 h-20 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-rose-100/50">
                    <ShieldAlert className="text-rose-500" size={38} />
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-600 mb-4">
                    <Lock size={12} />
                    <span>Permission Required</span>
                </div>

                <h2 className="text-2xl font-bold text-slate-800 mb-2">
                    Access Restricted
                </h2>

                <p className="text-slate-500 text-sm leading-relaxed mb-8">
                    You do not have permission to view or manage <span className="font-semibold text-slate-700">{pageName}</span>. Please contact your School Principal to request access rights.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={() => navigate(-1)}
                        className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        <ArrowLeft size={16} />
                        Go Back
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="btn bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg transition-all text-sm"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProtectedRoute;
