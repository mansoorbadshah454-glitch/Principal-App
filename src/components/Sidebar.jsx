import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, UserPlus, Users, UserCheck, GraduationCap,
    Wallet, TrendingUp, UserCog, LogOut, Shield, Settings as SettingsIcon,
    FileText, Tv, FileCheck, Mail, Award, ShoppingBag, ChevronDown, Bus
} from 'lucide-react';
import { auth } from '../firebase';
import { useAuthPermissions } from '../context/AuthPermissionsContext';

const NAV_GROUPS = [
    {
        id: 'overview',
        label: 'Overview',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/', permission: 'canViewDashboard' },
            { icon: FileText, label: 'News Feeds', path: '/news-feed', permission: 'canManageNewsFeed' },
            { icon: UserPlus, label: 'New Admission', path: '/admission', permission: 'canManageAdmissions' }
        ]
    },
    {
        id: 'academics',
        label: 'Academics',
        items: [
            { icon: GraduationCap, label: 'Classes & Students', path: '/classes', permission: 'canManageClasses' },
            { icon: Award, label: 'Exams & Results', path: '/exams', permission: 'canManageExams' },
            { icon: FileCheck, label: 'Paper Generator', path: '/paper-generator', permission: 'canManagePaperGenerator' },
            { icon: TrendingUp, label: 'Promotions', path: '/promotions', permission: 'canManagePromotions' }
        ]
    },
    {
        id: 'finance_store',
        label: 'Finance & Logistics',
        items: [
            { icon: Wallet, label: 'Fee Collections', path: '/collections', permission: 'canManageCollections' },
            { icon: ShoppingBag, label: 'Store & Inventory', path: '/store', permission: 'canManageStore' },
            { icon: Bus, label: 'Transport & Fleet', path: '/transport', permission: 'canManageTransport', isNew: true }
        ]
    },
    {
        id: 'hr_staff',
        label: 'HR & Staff',
        items: [
            { icon: Users, label: 'Teachers & Payroll', path: '/teachers', permission: 'canManageTeachers' },
            { icon: UserCheck, label: 'Parents Directory', path: '/parents', permission: 'canManageParents' },
            { icon: UserCog, label: 'User Admin', path: '/users', permission: 'canManageUsers' }
        ]
    },
    {
        id: 'administration',
        label: 'Campus & Admin',
        items: [
            { icon: Tv, label: 'Live Surveillance', path: '/surveillance', permission: 'canManageSurveillance' },
            { icon: Mail, label: 'Inbox', path: '/inbox', permission: 'canManageInbox' },
            { icon: SettingsIcon, label: 'Settings', path: '/settings', permission: 'canManageSettings' }
        ]
    }
];

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { hasAccess, isPrincipal } = useAuthPermissions();

    const [openGroups, setOpenGroups] = useState({
        overview: true,
        academics: true,
        finance_store: true,
        hr_staff: true,
        administration: true
    });

    const toggleGroup = (groupId) => {
        setOpenGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    // Auto expand the group of current route
    useEffect(() => {
        NAV_GROUPS.forEach(group => {
            const hasActiveRoute = group.items.some(item => 
                location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
            );
            if (hasActiveRoute && !openGroups[group.id]) {
                setOpenGroups(prev => ({ ...prev, [group.id]: true }));
            }
        });
    }, [location.pathname]);

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
        <aside style={{
            width: '280px',
            height: '100vh',
            background: '#0f172a',
            color: '#ffffff',
            position: 'fixed',
            left: 0,
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100,
            boxShadow: '4px 0 20px rgba(0, 0, 0, 0.25)',
            borderRight: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
            {/* Header / Brand */}
            <div style={{
                padding: '1.25rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
                <div style={{
                    width: '42px',
                    height: '42px',
                    background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
                    flexShrink: 0
                }}>
                    <Shield color="white" size={24} />
                </div>
                <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: '800', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
                        MAI <span style={{ color: '#818cf8' }}>SMS</span>
                    </h2>
                    <p style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, fontWeight: '600' }}>
                        Principal Portal
                    </p>
                </div>
            </div>

            {/* Scrollable Navigation */}
            <nav style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0.85rem 0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
            }}>
                <style>{`
                    nav::-webkit-scrollbar {
                        width: 4px;
                    }
                    nav::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.15);
                        border-radius: 4px;
                    }
                    nav::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 0.3);
                    }
                `}</style>

                {NAV_GROUPS.map((group) => {
                    const accessibleItems = group.items.filter(item => {
                        if (isPrincipal) return true;
                        return hasAccess(item.permission);
                    });

                    if (accessibleItems.length === 0) return null;

                    const isOpen = openGroups[group.id] !== false;

                    return (
                        <div key={group.id} style={{ marginBottom: '0.25rem' }}>
                            {/* Group Header */}
                            <button
                                onClick={() => toggleGroup(group.id)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.4rem 0.6rem',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#64748b',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    cursor: 'pointer',
                                    borderRadius: '6px',
                                    transition: 'color 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#94a3b8'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                            >
                                <span>{group.label}</span>
                                <ChevronDown
                                    size={14}
                                    style={{
                                        transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                        transition: 'transform 0.25s ease'
                                    }}
                                />
                            </button>

                            {/* Group Links */}
                            {isOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.2rem' }}>
                                    {accessibleItems.map((item) => {
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
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    padding: '0.65rem 0.85rem',
                                                    color: isActive ? '#ffffff' : '#94a3b8',
                                                    background: isActive ? 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' : 'transparent',
                                                    textDecoration: 'none',
                                                    borderRadius: '10px',
                                                    fontWeight: isActive ? '600' : '500',
                                                    fontSize: '0.88rem',
                                                    boxShadow: isActive ? '0 4px 12px rgba(79, 70, 229, 0.35)' : 'none',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isActive) {
                                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                                                        e.currentTarget.style.color = '#ffffff';
                                                        e.currentTarget.style.transform = 'translateX(3px)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isActive) {
                                                        e.currentTarget.style.background = 'transparent';
                                                        e.currentTarget.style.color = '#94a3b8';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                    }
                                                }}
                                            >
                                                <item.icon size={18} color={isActive ? '#ffffff' : '#818cf8'} />
                                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                                                {item.isNew && (
                                                    <span style={{
                                                        fontSize: '0.62rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '9999px',
                                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                                        color: 'white',
                                                        fontWeight: '700',
                                                        letterSpacing: '0.04em',
                                                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)'
                                                    }}>
                                                        NEW
                                                    </span>
                                                )}
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* Footer / User & Logout */}
            <div style={{
                padding: '0.85rem 1rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(15, 23, 42, 0.6)'
            }}>
                <button
                    onClick={handleLogout}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.65rem 0.85rem',
                        color: '#f87171',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '10px',
                        fontWeight: '600',
                        fontSize: '0.86rem',
                        width: '100%',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)';
                        e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                        e.currentTarget.style.color = '#f87171';
                    }}
                >
                    <LogOut size={18} />
                    <span>Logout Session</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
