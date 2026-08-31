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
    canManageStore: false,
    canManageTransport: false,
    canManagePaperGenerator: true,
    canManageExams: true,
    canManagePromotions: false,
    canManageSurveillance: false,
    canManageInbox: true,
    canManageUsers: false,
    canManageSettings: false
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
