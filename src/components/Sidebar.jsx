import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, UserPlus, Users, UserCheck, GraduationCap,
    Wallet, TrendingUp, UserCog, LogOut, Shield, Settings as SettingsIcon, FileText, Tv, FileCheck, Mail
} from 'lucide-react';
import { auth } from '../firebase';
import { useAuthPermissions } from '../context/AuthPermissionsContext';

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { hasAccess, role, isPrincipal } = useAuthPermissions();

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/', permission: 'canViewDashboard' },
        { icon: FileText, label: 'News Feeds', path: '/news-feed', permission: 'canManageNewsFeed' },
        { icon: UserPlus, label: 'New Admission', path: '/admission', permission: 'canManageAdmissions' },
        { icon: GraduationCap, label: 'Classes', path: '/classes', permission: 'canManageClasses' },
        { icon: Users, label: 'Teachers', path: '/teachers', permission: 'canManageTeachers' },
        { icon: UserCheck, label: 'Parents', path: '/parents', permission: 'canManageParents' },
        { icon: Wallet, label: 'Collections', path: '/collections', permission: 'canManageCollections' },
        { icon: FileCheck, label: 'Paper Generator', path: '/paper-generator', permission: 'canManagePaperGenerator' },
        { icon: TrendingUp, label: 'Promotions', path: '/promotions', permission: 'canManagePromotions' },
        { icon: UserCog, label: 'User Admin', path: '/users', permission: 'canManageUsers' },
        { icon: Tv, label: 'Live Surveillance', path: '/surveillance', permission: 'canManageSurveillance' },
        { icon: SettingsIcon, label: 'Settings', path: '/settings', permission: 'canManageSettings' },
    ];

    const accessibleMenuItems = menuItems.filter(item => {
        if (isPrincipal) return true;
        return hasAccess(item.permission);
    });

    const handleLogout = async () => {
        localStorage.removeItem('manual_session');
        try {
            await auth.signOut();
        } catch (e) {
            console.log("Firebase signout skipped or failed");
        }
        window.location.href = '/login';
    };

    return (
        <div className="sidebar">
            <div className="sidebar-brand">
                <div className="brand-icon">
                    <Shield color="white" size={24} />
                </div>
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', lineHeight: '1.1' }}>MAI <span style={{ color: '#4f46e5' }}>SMS</span></h2>
                    <p style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Principal Access</p>
                </div>
            </div>

            <nav className="sidebar-nav">
                {accessibleMenuItems.map((item) => {
                    const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                    return (
                        <a
                            key={item.path}
                            href={item.path}
                            onClick={(e) => {
                                e.preventDefault();
                                if (location.pathname !== item.path) {
                                    navigate(item.path);
                                }
                            }}
                            className={`nav-link ${isActive ? 'active' : ''}`}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </a>
                    );
                })}
            </nav>

            <div style={{ padding: '1rem', marginTop: 'auto' }}>
                <button
                    onClick={handleLogout}
                    className="nav-link"
                    style={{ background: 'transparent', border: 'none', width: '100%', cursor: 'pointer' }}
                >
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
