// Centralized Curriculum Database Module for School Management & Exam Generation
// Standard Matric / Secondary & Primary Curriculum Data

export const SUBJECT_CHAPTERS = {
    'Physics': {
        '9': [
            { num: 1, name: 'Physical Quantities and Measurement' },
            { num: 2, name: 'Kinematics' },
            { num: 3, name: 'Dynamics' },
            { num: 4, name: 'Turning Effect of Forces' },
            { num: 5, name: 'Gravitation' },
            { num: 6, name: 'Work and Energy' },
            { num: 7, name: 'Properties of Matter' },
            { num: 8, name: 'Thermal Properties of Matter' },
            { num: 9, name: 'Transfer of Heat' }
        ],
        '10': [
            { num: 10, name: 'Simple Harmonic Motion and Waves' },
            { num: 11, name: 'Sound' },
            { num: 12, name: 'Geometrical Optics' },
            { num: 13, name: 'Electrostatics' },
            { num: 14, name: 'Current Electricity' },
            { num: 15, name: 'Electromagnetism' },
            { num: 16, name: 'Basic Electronics' },
            { num: 17, name: 'Information and Communication Technology' },
            { num: 18, name: 'Atomic and Nuclear Physics' }
        ]
    },
    'Chemistry': {
        '9': [
            { num: 1, name: 'Fundamentals of Chemistry' },
            { num: 2, name: 'Structure of Atoms' },
            { num: 3, name: 'Periodic Table & Periodicity of Properties' },
            { num: 4, name: 'Structure of Molecules' },
            { num: 5, name: 'Physical States of Matter' },
            { num: 6, name: 'Solutions' },
            { num: 7, name: 'Electrochemistry' },
            { num: 8, name: 'Chemical Reactivity' }
        ],
        '10': [
            { num: 9, name: 'Chemical Equilibrium' },
            { num: 10, name: 'Acids, Bases and Salts' },
            { num: 11, name: 'Organic Chemistry' },
            { num: 12, name: 'Hydrocarbons' },
            { num: 13, name: 'Biochemistry' },
            { num: 14, name: 'The Atmosphere' },
            { num: 15, name: 'Water' },
            { num: 16, name: 'Chemical Industries' }
        ]
    },
    'Mathematics': {
        '9': [
            { num: 1, name: 'Matrices and Determinants' },
            { num: 2, name: 'Real and Complex Numbers' },
            { num: 3, name: 'Logarithms' },
            { num: 4, name: 'Algebraic Expressions and Formulas' },
            { num: 5, name: 'Factorization' },
            { num: 6, name: 'Algebraic Manipulation' },
            { num: 7, name: 'Linear Equations and Inequalities' },
            { num: 8, name: 'Linear Graphs and their Applications' },
            { num: 9, name: 'Introduction to Coordinate Geometry' }
        ],
        '10': [
            { num: 1, name: 'Quadratic Equations' },
            { num: 2, name: 'Theory of Quadratic Equations' },
            { num: 3, name: 'Variations' },
            { num: 4, name: 'Partial Fractions' },
            { num: 5, name: 'Sets and Functions' },
            { num: 6, name: 'Basic Statistics' },
            { num: 7, name: 'Introduction to Trigonometry' }
        ]
    },
    'Biology': {
        '9': [
            { num: 1, name: 'Introduction to Biology' },
            { num: 2, name: 'Solving a Biological Problem' },
            { num: 3, name: 'Biodiversity' },
            { num: 4, name: 'Cells and Tissues' },
            { num: 5, name: 'Cell Cycle' },
            { num: 6, name: 'Enzymes' },
            { num: 7, name: 'Bioenergetics' },
            { num: 8, name: 'Nutrition' },
            { num: 9, name: 'Transport' }
        ],
        '10': [
            { num: 10, name: 'Gaseous Exchange' },
            { num: 11, name: 'Homeostasis' },
            { num: 12, name: 'Coordination and Control' },
            { num: 13, name: 'Support and Movement' },
            { num: 14, name: 'Reproduction' },
            { num: 15, name: 'Inheritance' },
            { num: 16, name: 'Man and his Environment' },
            { num: 17, name: 'Biotechnology' },
            { num: 18, name: 'Pharmacology' }
        ]
    },
    'Computer Science': {
        '9': [
            { num: 1, name: 'Problem Solving' },
            { num: 2, name: 'Binary System' },
            { num: 3, name: 'Networks' },
            { num: 4, name: 'Data and Cyber Security' },
            { num: 5, name: 'Designing Websites (HTML)' }
        ],
        '10': [
            { num: 1, name: 'Introduction to Programming (C-Language)' },
            { num: 2, name: 'User Interaction & Variables' },
            { num: 3, name: 'Conditional Logic' },
            { num: 4, name: 'Data Structures & Arrays' },
            { num: 5, name: 'Functions' }
        ]
    },
    'English': {
        '9': [
            { num: 1, name: 'The Saviour of Mankind' },
            { num: 2, name: 'Patriotism' },
            { num: 3, name: 'Media and Its Impact' },
            { num: 4, name: 'Hazrat Asma (R.A)' },
            { num: 5, name: 'Daffodils (Poem)' },
            { num: 6, name: 'The Quaid’s Vision and Pakistan' },
            { num: 7, name: 'Sultan Ahmad Mosque' },
            { num: 8, name: 'Stopping by Woods on a Snowy Evening' }
        ],
        '10': [
            { num: 1, name: 'Hazrat Muhammad (PBUH) An Embodiment of Justice' },
            { num: 2, name: 'Chinese New Year' },
            { num: 3, name: 'Try Again' },
            { num: 4, name: 'First Aid' },
            { num: 5, name: 'The Rain' },
            { num: 6, name: 'Television vs Newspapers' }
        ]
    },
    'Urdu': {
        '9': [
            { num: 1, name: 'ہجرت نبوی ﷺ' },
            { num: 2, name: 'مرزا غالب کے عادات و خصائل' },
            { num: 3, name: 'کاہلی' },
            { num: 4, name: 'شاعروں کے لطیفے' },
            { num: 5, name: 'نصوح اور سلیم کی گفتگو' },
            { num: 6, name: 'پنچایت' }
        ],
        '10': [
            { num: 1, name: 'مرزا محمد سعید' },
            { num: 2, name: 'نظریہ پاکستان' },
            { num: 3, name: 'پرستان کی شہزادی' },
            { num: 4, name: 'اردو ادب میں عید الفطر' }
        ]
    },
    'Islamiat': {
        '9': [
            { num: 1, name: 'سورۃ الانفال (رکوع 1 تا 5)' },
            { num: 2, name: 'احادیث نبویہ (1 تا 10)' },
            { num: 3, name: 'قرآن مجید کا تعارف اور حفاظت' },
            { num: 4, name: 'ایمان بالرسالت اور ختم نبوت' }
        ],
        '10': [
            { num: 1, name: 'سورۃ الاحزاب' },
            { num: 2, name: 'احادیث نبویہ (11 تا 20)' },
            { num: 3, name: 'علم کی اہمیت اور فرضیت' },
            { num: 4, name: 'عائلی زندگی اور صلہ رحمی' }
        ]
    },
    'Pak Studies': {
        '9': [
            { num: 1, name: 'Ideological Basis of Pakistan' },
            { num: 2, name: 'Making of Pakistan (1857-1947)' },
            { num: 3, name: 'Land and Environment' },
            { num: 4, name: 'History of Pakistan (Part 1)' }
        ],
        '10': [
            { num: 1, name: 'History of Pakistan (Part 2: 1971 to Present)' },
            { num: 2, name: 'Foreign Policy of Pakistan' },
            { num: 3, name: 'Economic Development of Pakistan' },
            { num: 4, name: 'Population, Society and Culture of Pakistan' }
        ]
    }
};

export const EXAM_PRESETS = [
    {
        id: 'chapter_test',
        badge: 'Weekly / Daily',
        name: 'Chapter Assessment Test',
        timeAllowed: '40 Minutes',
        totalMarks: 25,
        mcqCount: 5,
        mcqMarksEach: 1,
        shortCount: 6,
        shortAttempt: 4,
        shortMarksEach: 2,
        longCount: 2,
        longAttempt: 1,
        longMarksEach: 5
    },
    {
        id: 'monthly_test',
        badge: 'Monthly Unit',
        name: 'Monthly Assessment Exam',
        timeAllowed: '1 Hour',
        totalMarks: 35,
        mcqCount: 7,
        mcqMarksEach: 1,
        shortCount: 8,
        shortAttempt: 5,
        shortMarksEach: 2,
        longCount: 3,
        longAttempt: 2,
        longMarksEach: 5
    },
    {
        id: 'mid_term',
        badge: 'Term Exam',
        name: 'Mid-Term / Half-Book Exam',
        timeAllowed: '1 Hour 45 Minutes',
        totalMarks: 50,
        mcqCount: 10,
        mcqMarksEach: 1,
        shortCount: 12,
        shortAttempt: 8,
        shortMarksEach: 2,
        longCount: 4,
        longAttempt: 2,
        longMarksEach: 6
    },
    {
        id: 'bise_board',
        badge: 'Official Board Standard',
        name: 'Full Board Pattern (BISE)',
        timeAllowed: '2 Hours 45 Minutes',
        totalMarks: 75,
        mcqCount: 12,
        mcqMarksEach: 1,
        shortCount: 15,
        shortAttempt: 10,
        shortMarksEach: 2,
        longCount: 5,
        longAttempt: 3,
        longMarksEach: 7
    },
    {
        id: 'custom',
        badge: 'Custom Blueprint',
        name: 'Custom Configuration',
        timeAllowed: '1 Hour 30 Minutes',
        totalMarks: 40,
        mcqCount: 8,
        mcqMarksEach: 1,
        shortCount: 8,
        shortAttempt: 5,
        shortMarksEach: 2,
        longCount: 3,
        longAttempt: 1,
        longMarksEach: 5
    }
];

export const ALL_CLASSES = ['Nursery', 'Prep', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export const SUBJECTS_BY_CLASS = {
    'Nursery': ['English (Alphabets)', 'Urdu (Huroof-e-Tahajji)', 'Mathematics (Counting)', 'General Knowledge & Rhymes'],
    'Prep': ['English (Words & Phonics)', 'Urdu (Jor-Tor)', 'Mathematics (Shapes & Numbers)', 'General Knowledge & Drawing'],
    '1': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'General Knowledge'],
    '2': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'General Knowledge', 'Computer'],
    '3': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'Social Studies', 'Computer'],
    '4': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'Social Studies', 'Computer'],
    '5': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'Social Studies', 'Computer'],
    '6': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'History', 'Geography', 'Computer Education'],
    '7': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'History', 'Geography', 'Computer Education'],
    '8': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'History', 'Geography', 'Computer Education'],
    '9': ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies', 'General Science'],
    '10': ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies', 'General Science']
};

export const DEFAULT_PRIMARY_CHAPTERS = {
    'General Science': [
        { num: 1, name: 'Classification of Living Organisms' },
        { num: 2, name: 'Microorganisms and Human Health' },
        { num: 3, name: 'Flowers, Seeds and Reproduction' },
        { num: 4, name: 'Environmental Pollution & Protection' },
        { num: 5, name: 'Physical and Chemical Changes of Matter' },
        { num: 6, name: 'Light, Sound and Reflection' },
        { num: 7, name: 'Electricity and Magnetism' },
        { num: 8, name: 'Structure of the Earth & Rocks' },
        { num: 9, name: 'Space, Solar System and Satellites' }
    ],
    'Mathematics': [
        { num: 1, name: 'Whole Numbers and Operations' },
        { num: 2, name: 'HCF and LCM' },
        { num: 3, name: 'Fractions (Addition, Subtraction & Division)' },
        { num: 4, name: 'Decimals and Percentages' },
        { num: 5, name: 'Distance, Time and Temperature' },
        { num: 6, name: 'Unitary Method and Financial Math' },
        { num: 7, name: 'Geometry (Angles, Triangles & Polygons)' },
        { num: 8, name: 'Perimeter and Area' },
        { num: 9, name: 'Information Handling and Graphs' }
    ],
    'English': [
        { num: 1, name: 'The Grateful Heart' },
        { num: 2, name: 'Women as Role Models' },
        { num: 3, name: 'Unforgettable Historical Moments' },
        { num: 4, name: 'Saving Our Nature & Trees' },
        { num: 5, name: 'Kindness and Good Manners' },
        { num: 6, name: 'Dignity of Work' },
        { num: 7, name: 'The Power of Imagination' },
        { num: 8, name: 'Safety First (Health & Hygiene)' }
    ],
    'English (Alphabets)': [
        { num: 1, name: 'Capital Letters (A to M) & Phonics' },
        { num: 2, name: 'Capital Letters (N to Z) & Phonics' },
        { num: 3, name: 'Small Letters (a to z) Tracing' },
        { num: 4, name: 'Missing Letters & Picture Matching' }
    ],
    'Urdu (Huroof-e-Tahajji)': [
        { num: 1, name: 'حروفِ تہجی (الف تا ژ)' },
        { num: 2, name: 'حروفِ تہجی (س تا ے)' },
        { num: 3, name: 'تصویر دیکھ کر پہلا حرف لکھیں' },
        { num: 4, name: 'خالی جگہ اور درست حرف کا انتخاب' }
    ],
    'Mathematics (Counting)': [
        { num: 1, name: 'Counting (1 to 20) & Tracing' },
        { num: 2, name: 'Count and Match the Objects' },
        { num: 3, name: 'Basic Shapes (Circle, Square, Triangle)' },
        { num: 4, name: 'Big vs Small / More vs Less' }
    ]
};

// Helper: Normalize Class Name string (e.g., '9th', 'Class 9', 'Grade 9' -> '9')
export const normalizeClassKey = (className) => {
    if (!className) return '';
    const cleaned = String(className).trim();
    const match = cleaned.match(/\d+/);
    if (match) return match[0];
    const lower = cleaned.toLowerCase();
    if (lower.includes('nursery')) return 'Nursery';
    if (lower.includes('prep')) return 'Prep';
    return cleaned;
};

// Helper: Normalize Subject Name string (e.g., 'Physic' -> 'Physics', 'Islamiyat' -> 'Islamiat')
export const normalizeSubjectKey = (subjectName) => {
    if (!subjectName) return '';
    const name = String(subjectName).trim().toLowerCase();
    
    if (name.includes('physic')) return 'Physics';
    if (name.includes('chem')) return 'Chemistry';
    if (name.includes('bio')) return 'Biology';
    if (name.includes('math')) return 'Mathematics';
    if (name.includes('comp')) return 'Computer Science';
    if (name.includes('eng')) return 'English';
    if (name.includes('urdu')) return 'Urdu';
    if (name.includes('islam') || name.includes('quran')) return 'Islamiat';
    if (name.includes('pak') || name.includes('social') || name.includes('pst') || name.includes('history')) return 'Pak Studies';
    if (name.includes('science') || name.includes('general sci')) return 'General Science';
    
    return subjectName.trim();
};

// Helper: Get standard chapters for any given class and subject
export const getStandardChapters = (className, subjectName) => {
    const classKey = normalizeClassKey(className);
    const subjectKey = normalizeSubjectKey(subjectName);

    // 1. Direct match in Matric/Secondary SUBJECT_CHAPTERS
    if (SUBJECT_CHAPTERS[subjectKey]?.[classKey]) {
        return SUBJECT_CHAPTERS[subjectKey][classKey];
    }

    // 2. Direct match by exact subject name if not normalized
    if (SUBJECT_CHAPTERS[subjectName]?.[classKey]) {
        return SUBJECT_CHAPTERS[subjectName][classKey];
    }

    // 3. Fallback to PRIMARY DEFAULT chapters
    if (DEFAULT_PRIMARY_CHAPTERS[subjectKey]) {
        return DEFAULT_PRIMARY_CHAPTERS[subjectKey];
    }
    if (DEFAULT_PRIMARY_CHAPTERS[subjectName]) {
        return DEFAULT_PRIMARY_CHAPTERS[subjectName];
    }

    return [];
};
