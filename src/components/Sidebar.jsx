import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, UserPlus, Users, UserCheck, GraduationCap,
    Wallet, TrendingUp, UserCog, LogOut, Shield
} from 'lucide-react';
import { auth } from '../firebase';

const Sidebar = () => {
    const navigate = useNavigate();

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: UserPlus, label: 'New Admission', path: '/admission' },
        { icon: GraduationCap, label: 'Classes', path: '/classes' },
        { icon: Users, label: 'Teachers', path: '/teachers' },
        { icon: UserCheck, label: 'Parents', path: '/parents' },
        { icon: Wallet, label: 'Collections', path: '/collections' },
        { icon: TrendingUp, label: 'Promotions', path: '/promotions' },
        { icon: UserCog, label: 'User Admin', path: '/users' },
    ];

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
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                        <item.icon size={20} />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
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
