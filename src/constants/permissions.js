export const PERMISSIONS_LIST = [
    {
        id: 'canViewDashboard',
        label: 'Dashboard Overview',
        description: 'View dashboard summary metrics and statistics',
        path: '/',
        category: 'Core'
    },
    {
        id: 'canManageNewsFeed',
        label: 'News Feeds',
        description: 'Create and manage school notices and posts',
        path: '/news-feed',
        category: 'Communication'
    },
    {
        id: 'canManageAdmissions',
        label: 'New Admissions',
        description: 'Register new students and view admission history',
        path: '/admission',
        category: 'Academic'
    },
    {
        id: 'canManageClasses',
        label: 'Classes & Students',
        description: 'Manage class sections, student profiles and enrollments',
        path: '/classes',
        category: 'Academic'
    },
    {
        id: 'canManageTeachers',
        label: 'Teachers & Payroll',
        description: 'Manage teaching staff and payroll records',
        path: '/teachers',
        category: 'Staff'
    },
    {
        id: 'canManageHRDocs',
        label: 'Official HR Documents',
        description: 'Generate appointment letters, experience certificates, and official HR contracts',
        path: '/hr-documents',
        category: 'Staff'
    },
    {
        id: 'canManageParents',
        label: 'Parents Directory',
        description: 'View parent directory and communication details',
        path: '/parents',
        category: 'Communication'
    },
    {
        id: 'canManageCollections',
        label: 'Fee Collections & Reports',
        description: 'Manage student fees, vouchers, defaulters and collection reports',
        path: '/collections',
        category: 'Finance'
    },
    {
        id: 'canManageStore',
        label: 'Store & Inventory',
        description: 'Manage school store, books, uniform inventory, and POS billing',
        path: '/store',
        category: 'Finance'
    },
    {
        id: 'canManageTransport',
        label: 'Transport & Van Fleet',
        description: 'Manage school vehicles, drivers, routes, student transport allocation, and fuel logs',
        path: '/transport',
        category: 'Operations'
    },
    {
        id: 'canManagePaperGenerator',
        label: 'Paper Generator',
        description: 'Generate question papers and test sheets',
        path: '/paper-generator',
        category: 'Academic'
    },
    {
        id: 'canManageExams',
        label: 'Exams & Results',
        description: 'Manage exam terms, class tabulation sheets, and print student DMC result cards',
        path: '/exams',
        category: 'Academic'
    },
    {
        id: 'canManagePromotions',
        label: 'Promotions',
        description: 'Process batch student promotions to next academic session',
        path: '/promotions',
        category: 'Academic'
    },
    {
        id: 'canManageSLC',
        label: 'School Leaving (SLC)',
        description: 'Issue official School Leaving Certificates and access 50-year digital archive vault',
        path: '/school-leaving',
        category: 'Academic'
    },
    {
        id: 'canManageSurveillance',
        label: 'Live Surveillance',
        description: 'View live camera surveillance and CCTV streams',
        path: '/surveillance',
        category: 'Security'
    },
    {
        id: 'canManageInbox',
        label: 'Inbox & Messaging',
        description: 'View and respond to internal school messages',
        path: '/inbox',
        category: 'Communication'
    },
    {
        id: 'canManageUsers',
        label: 'User Administration',
        description: 'Manage sub-admin accounts and grant system permissions',
        path: '/users',
        category: 'Administration'
    },
    {
        id: 'canManageSettings',
        label: 'System Settings',
        description: 'Configure school profile, session setup and general settings',
        path: '/settings',
        category: 'Administration'
    },
    {
        id: 'canUseAiAssistant',
        label: 'School AI Copilot',
        description: 'Access the smart AI Assistant for automated reports, student grades, and real-time school analytics',
        path: '#ai-assistant',
        category: 'Administration'
    }
];

export const FEE_SUB_PERMISSIONS = [
    {
        id: 'canViewFeeDailyWorkflow',
        label: 'Daily Workflow',
        tabKey: 'workflow',
        description: 'Counter fee collection, voucher payments, sibling search & receipt printing',
        isDefaultCashier: true
    },
    {
        id: 'canViewFeeOnlineSubmissions',
        label: 'Online Submissions',
        tabKey: 'onlineSubmissions',
        description: 'Review and approve parent mobile payment slips and receipts',
        isDefaultCashier: true
    },
    {
        id: 'canViewFeeMatrix',
        label: 'Monthly Fee Matrix',
        tabKey: 'monthlyMatrix',
        description: 'School-wide monthly arrears matrix, class defaulter registers & analytics',
        isDefaultCashier: false
    },
    {
        id: 'canViewFeeFinances',
        label: 'Finances & Ledgers',
        tabKey: 'finances',
        description: 'School income, expense entries, bank ledger accounts & profit/loss',
        isDefaultCashier: false
    },
    {
        id: 'canViewFeePayroll',
        label: 'Staff Payroll',
        tabKey: 'payroll',
        description: 'Teacher & staff salary disbursements, salary slips & payroll summaries',
        isDefaultCashier: false
    }
];

export const DEFAULT_ADMIN_PERMISSIONS = {
    canViewDashboard: true,
    canManageNewsFeed: true,
    canManageAdmissions: true,
    canManageClasses: true,
    canManageTeachers: false,
    canManageHRDocs: true,
    canManageParents: true,
    canManageCollections: false,
    // Granular Fee Sub-Permissions
    canViewFeeDailyWorkflow: true,
    canViewFeeOnlineSubmissions: true,
    canViewFeeMatrix: false,
    canViewFeeFinances: false,
    canViewFeePayroll: false,
    canManageStore: false,
    canManageTransport: false,
    canManagePaperGenerator: true,
    canManageExams: true,
    canManagePromotions: false,
    canManageSurveillance: false,
    canManageInbox: true,
    canManageUsers: false,
    canManageSettings: false,
    canUseAiAssistant: false
};

/**
 * Checks if a user has access to a specific permission key.
 * Principals and Super Admins always have 100% access.
 * Legacy keys (e.g. canEditFees, canEditStudents, canEditClasses) are smoothly mapped.
 */
export const checkPermission = (role, permissions = {}, permKey) => {
    if (!role) return false;
    const normalizedRole = role.toLowerCase().replace(/[-_ ]/g, '');
    if (normalizedRole === 'principal' || normalizedRole === 'superadmin') {
        return true;
    }

    if (!permKey) return true;

    // Check if permKey is a Fee Sub-Permission
    const isFeeSub = FEE_SUB_PERMISSIONS.some(sub => sub.id === permKey);
    if (isFeeSub) {
        // Must have master Fee Collections permission first
        const hasMasterCollections = checkPermission(role, permissions, 'canManageCollections');
        if (!hasMasterCollections) return false;

        // If explicit boolean is set for this sub-permission
        if (typeof permissions[permKey] === 'boolean') {
            return permissions[permKey];
        }

        // Backward compatibility: If master is true but user was created before sub-permissions existed
        const hasAnySubExplicit = FEE_SUB_PERMISSIONS.some(sub => typeof permissions[sub.id] === 'boolean');
        if (!hasAnySubExplicit) {
            return true; // Full access for legacy admins until explicitly edited
        }

        return false;
    }

    // 1. Direct check if explicitly set as boolean (true or false)
    if (typeof permissions[permKey] === 'boolean') {
        return permissions[permKey];
    }

    // 2. Backward compatibility fallbacks ONLY when the new key is undefined
    if (permKey === 'canManageCollections') {
        if (typeof permissions.canEditFees === 'boolean') return permissions.canEditFees;
        return false;
    }
    if (permKey === 'canManageClasses') {
        if (typeof permissions.canEditClasses === 'boolean') return permissions.canEditClasses;
        if (typeof permissions.canEditStudents === 'boolean') return permissions.canEditStudents;
        return false;
    }
    if (permKey === 'canManageTeachers') {
        if (typeof permissions.canEditTeachers === 'boolean') return permissions.canEditTeachers;
        return false;
    }

    return false;
};

/**
 * Helper to check access by tab key in Collections page
 */
export const checkFeeTabAccess = (role, permissions = {}, tabKey) => {
    const sub = FEE_SUB_PERMISSIONS.find(s => s.tabKey === tabKey);
    if (!sub) return true;
    return checkPermission(role, permissions, sub.id);
};
