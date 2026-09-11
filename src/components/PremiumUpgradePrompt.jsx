import React from 'react';
import { Crown, Sparkles, Lock, ArrowLeft, Phone, MessageSquare, CheckCircle2, Bus, Tv, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GalaxyBackground from './GalaxyBackground';

const MODULE_DETAILS = {
    transport: {
        title: 'Transport & Van Fleet Management Hub',
        badge: 'Enterprise Fleet Edition',
        icon: Bus,
        color: '#f59e0b',
        description: 'Complete live vehicle GPS tracking, driver management, student stop allocation, and automated parent arrival notifications.',
        features: [
            'Real-Time Live Van & Bus GPS tracking on map',
            'Dedicated Driver Mobile App with turn-by-turn route assist',
            '5-Minute Proximity Auto Alerts & Push Notifications to parents',
            'Student Boarding / Drop-off digital attendance verification',
            'Fuel expense logs, vehicle mileage, and driver payroll sync'
        ]
    },
    surveillance: {
        title: 'Live CCTV Surveillance & Security Hub',
        badge: 'Campus Security Edition',
        icon: Tv,
        color: '#6366f1',
        description: 'Centralized live CCTV camera streams and surveillance monitoring directly from your Principal Dashboard.',
        features: [
            'Multi-Camera Grid View with instant live stream feeds',
            'Classroom, Entrance Gate, and Playground zone monitoring',
            'Zero-lag HD RTSP/WebRTC camera streaming integration',
            'Security incident logs & instant alert dispatch',
            'Role-based surveillance access controls for staff'
        ]
    }
};

const PremiumUpgradePrompt = ({ moduleKey = 'transport', moduleName = 'This Module' }) => {
    const navigate = useNavigate();
    const config = MODULE_DETAILS[moduleKey] || {
        title: moduleName,
        badge: 'Premium Add-on',
        icon: Crown,
        color: '#f59e0b',
        description: 'Unlock enterprise-grade school automation and management capabilities.',
        features: [
            'Advanced automation and reporting',
            'High-priority multi-channel parent alerts',
            'Dedicated 24/7 MAI SMS engineering support'
        ]
    };

    const Icon = config.icon;

    const handleWhatsApp = () => {
        const text = encodeURIComponent(`Hello MAI SMS Team, I want to upgrade our school system to the Premium Package to unlock "${config.title}". Please assist us with the upgrade process.`);
        window.open(`https://wa.me/923000000000?text=${text}`, '_blank');
    };

    const handleCall = () => {
        window.location.href = 'tel:+923000000000';
    };

    return (
        <div
            className="fixed md:left-[280px] left-0 top-0 right-0 bottom-0 z-20 flex items-center justify-center p-4 md:p-8 overflow-y-auto"
            style={{
                background: 'linear-gradient(180deg, #090d16 0%, #0c1222 50%, #080c18 100%)'
            }}
        >
            {/* Infinite Cosmic Galaxy Animation Layer */}
            <GalaxyBackground />
            <div className="relative w-full max-w-3xl bg-slate-900/90 backdrop-blur-xl border border-amber-500/30 rounded-3xl p-6 md:p-10 shadow-2xl shadow-amber-500/10 overflow-hidden text-white">
                {/* Background Ambient Glows */}
                <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

                {/* Header Badge */}
                <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider">
                        <Crown size={14} className="text-amber-400" />
                        <span>{config.badge}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Lock size={13} className="text-amber-400" />
                        <span>Premium Package Exclusive</span>
                    </div>
                </div>

                {/* Main Heading & Notice */}
                <div className="flex flex-col md:flex-row items-start md:items-center gap-5 mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
                        <Icon size={32} className="text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                            {config.title}
                        </h2>
                        <p className="text-amber-300/90 font-medium text-sm md:text-base mt-1">
                            "This module is part of Premium Package. Contact MAI SMS Team to upgrade."
                        </p>
                    </div>
                </div>

                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    {config.description}
                </p>

                {/* Features Included List */}
                <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/60 mb-8">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                        <Sparkles size={14} className="text-amber-400" />
                        What You Get with this Upgrade:
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {config.features.map((feat, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 text-xs md:text-sm text-slate-200">
                                <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                                <span>{feat}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
                    <button
                        onClick={() => navigate('/')}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold flex items-center justify-center gap-2 transition-all border border-slate-700"
                    >
                        <ArrowLeft size={16} />
                        Back to Dashboard
                    </button>

                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleCall}
                            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all border border-slate-700 shadow-md"
                        >
                            <Phone size={16} className="text-emerald-400" />
                            Call MAI SMS Team
                        </button>
                        <button
                            onClick={handleWhatsApp}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/50"
                        >
                            <MessageSquare size={16} />
                            WhatsApp MAI SMS Team
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PremiumUpgradePrompt;
