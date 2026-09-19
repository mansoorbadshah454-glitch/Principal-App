import React from 'react';
import { Landmark, Smartphone } from 'lucide-react';

export const getPaymentMethodTheme = (name = '') => {
    const n = (name || '').toLowerCase();
    if (n.includes('jazz')) {
        return {
            id: 'jazzcash',
            displayName: 'JazzCash',
            brandColor: '#ED1C24',
            accentColor: '#FFB800',
            bgColor: '#1c1917',
            textColor: '#ffffff',
            borderColor: '#dc2626',
            badgeBg: '#fee2e2',
            badgeText: '#991b1b',
            isWallet: true,
            logoSrc: '/logos/jazzcash.svg'
        };
    }
    if (n.includes('easy')) {
        return {
            id: 'easypaisa',
            displayName: 'EasyPaisa',
            brandColor: '#00A859',
            accentColor: '#00E676',
            bgColor: '#008544',
            textColor: '#ffffff',
            borderColor: '#10b981',
            badgeBg: '#dcfce7',
            badgeText: '#15803d',
            isWallet: true,
            logoSrc: '/logos/easypaisa.svg'
        };
    }
    if (n.includes('meezan')) {
        return {
            id: 'meezan',
            displayName: 'Meezan Bank',
            brandColor: '#005A36',
            accentColor: '#D4AF37',
            bgColor: '#004225',
            textColor: '#ffffff',
            borderColor: '#059669',
            badgeBg: '#ecfdf5',
            badgeText: '#065f46',
            isWallet: false,
            logoSrc: '/logos/meezan.svg'
        };
    }
    if (n.includes('hbl') || n.includes('habib')) {
        return {
            id: 'hbl',
            displayName: 'HBL',
            brandColor: '#008269',
            accentColor: '#ffffff',
            bgColor: '#00624f',
            textColor: '#ffffff',
            borderColor: '#0d9488',
            badgeBg: '#ccfbf1',
            badgeText: '#115e59',
            isWallet: false,
            logoSrc: '/logos/hbl.svg'
        };
    }
    return {
        id: 'bank',
        displayName: name || 'Bank Transfer',
        brandColor: '#4f46e5',
        accentColor: '#818cf8',
        bgColor: '#312e81',
        textColor: '#ffffff',
        borderColor: '#6366f1',
        badgeBg: '#e0e7ff',
        badgeText: '#3730a3',
        isWallet: false,
        logoSrc: null
    };
};

export const PaymentMethodLogo = ({ name = '', size = 'md', style = {} }) => {
    const theme = getPaymentMethodTheme(name);
    const n = (name || '').toLowerCase();

    // Sizing presets
    const dimensions = {
        sm: { width: 72, height: 26, iconSize: 14, fontSize: 11 },
        md: { width: 105, height: 34, iconSize: 18, fontSize: 13 },
        lg: { width: 130, height: 42, iconSize: 22, fontSize: 15 }
    }[size] || { width: 105, height: 34, iconSize: 18, fontSize: 13 };

    if (n.includes('jazz')) {
        return (
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0c0a09',
                    borderRadius: '8px',
                    padding: '3px 8px',
                    border: '1px solid rgba(237, 28, 36, 0.4)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    ...style
                }}
                title="JazzCash"
            >
                <img
                    src="/logos/jazzcash.svg"
                    alt="JazzCash"
                    style={{
                        height: `${dimensions.height - 8}px`,
                        maxWidth: `${dimensions.width}px`,
                        objectFit: 'contain'
                    }}
                    onError={(e) => {
                        // Fallback to inline SVG if image fails
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'inline-flex';
                    }}
                />
                <span style={{ display: 'none', alignItems: 'center', gap: '3px', fontWeight: '900', fontSize: `${dimensions.fontSize}px` }}>
                    <span style={{ color: '#ED1C24' }}>Jazz</span>
                    <span style={{ color: '#FFB800' }}>Cash</span>
                </span>
            </div>
        );
    }

    if (n.includes('easy')) {
        return (
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#00A859',
                    borderRadius: '8px',
                    padding: '3px 8px',
                    border: '1px solid rgba(0, 168, 89, 0.5)',
                    boxShadow: '0 2px 6px rgba(0, 168, 89, 0.2)',
                    ...style
                }}
                title="EasyPaisa"
            >
                <img
                    src="/logos/easypaisa.svg"
                    alt="EasyPaisa"
                    style={{
                        height: `${dimensions.height - 8}px`,
                        maxWidth: `${dimensions.width}px`,
                        objectFit: 'contain'
                    }}
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'inline-flex';
                    }}
                />
                <span style={{ display: 'none', alignItems: 'center', gap: '4px', fontWeight: '900', color: '#ffffff', fontSize: `${dimensions.fontSize}px` }}>
                    easypaisa
                </span>
            </div>
        );
    }

    if (n.includes('meezan')) {
        return (
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#005A36',
                    borderRadius: '8px',
                    padding: '3px 8px',
                    border: '1px solid rgba(212, 175, 55, 0.4)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                    ...style
                }}
                title="Meezan Bank"
            >
                <img
                    src="/logos/meezan.svg"
                    alt="Meezan Bank"
                    style={{
                        height: `${dimensions.height - 8}px`,
                        maxWidth: `${dimensions.width}px`,
                        objectFit: 'contain'
                    }}
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'inline-flex';
                    }}
                />
                <span style={{ display: 'none', color: '#ffffff', fontWeight: '800', fontSize: `${dimensions.fontSize}px` }}>
                    Meezan Bank
                </span>
            </div>
        );
    }

    if (n.includes('hbl') || n.includes('habib')) {
        return (
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#008269',
                    borderRadius: '8px',
                    padding: '3px 8px',
                    border: '1px solid rgba(0, 130, 105, 0.5)',
                    ...style
                }}
                title="HBL"
            >
                <img
                    src="/logos/hbl.svg"
                    alt="HBL"
                    style={{
                        height: `${dimensions.height - 8}px`,
                        maxWidth: `${dimensions.width}px`,
                        objectFit: 'contain'
                    }}
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'inline-flex';
                    }}
                />
                <span style={{ display: 'none', color: '#ffffff', fontWeight: '900', fontSize: `${dimensions.fontSize}px` }}>
                    HBL
                </span>
            </div>
        );
    }

    // Generic Bank Fallback
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '4px 10px',
                color: '#1e293b',
                fontWeight: '700',
                fontSize: `${dimensions.fontSize}px`,
                ...style
            }}
        >
            <Landmark size={dimensions.iconSize} color="#475569" />
            <span>{name || 'Bank Transfer'}</span>
        </div>
    );
};

export default PaymentMethodLogo;
