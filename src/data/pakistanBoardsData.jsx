import React from 'react';

// Official Emblem Vector Component for any BISE Board
export const BoardCrestLogo = ({ boardId, size = 36, primaryColor = '#1e3a8a', accentColor = '#f59e0b', symbol = 'book' }) => {
    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 100 100" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'inline-block', flexShrink: 0 }}
        >
            <defs>
                <linearGradient id={`grad_bg_${boardId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={primaryColor} />
                    <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
                <linearGradient id={`grad_gold_${boardId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="50%" stopColor={accentColor} />
                    <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
            </defs>

            {/* Outer Circular Ring with Gold Trim */}
            <circle cx="50" cy="50" r="48" fill={`url(#grad_bg_${boardId})`} stroke={`url(#grad_gold_${boardId})`} strokeWidth="3.5" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 3" />

            {/* Top Star & Crescent */}
            <path 
                d="M 50 18 A 6 6 0 1 0 54 28 A 5 5 0 1 1 50 18 Z" 
                fill={`url(#grad_gold_${boardId})`} 
            />
            <polygon 
                points="56,21 57.5,24 60.5,24 58,26 59,29 56.5,27.5 54,29 55,26 52.5,24 55.5,24" 
                fill="#ffffff" 
            />

            {/* Regional / Board Specific Central Graphic */}
            {symbol === 'khyber' ? (
                // Bab-e-Khyber Arch for Peshawar
                <g fill="none" stroke={`url(#grad_gold_${boardId})`} strokeWidth="2.5">
                    <path d="M36 62 V42 H64 V62" />
                    <path d="M42 62 V48 A8 8 0 0 1 58 48 V62" fill="rgba(254, 240, 138, 0.2)" />
                    <path d="M34 40 H66 M38 37 H62" />
                </g>
            ) : symbol === 'minar' ? (
                // Minar-e-Pakistan for Lahore
                <g fill={`url(#grad_gold_${boardId})`}>
                    <path d="M48 38 L50 30 L52 38 L51 58 H49 Z" />
                    <path d="M44 58 H56 L54 62 H46 Z" />
                    <circle cx="50" cy="28" r="2" fill="#ffffff" />
                </g>
            ) : symbol === 'mausoleum' ? (
                // Mazar-e-Quaid Dome for Karachi
                <g fill="none" stroke={`url(#grad_gold_${boardId})`} strokeWidth="2.5">
                    <path d="M36 62 H64 V52 Q50 34 36 52 Z" fill="rgba(254, 240, 138, 0.25)" />
                    <path d="M46 62 V55 A4 4 0 0 1 54 55 V62" fill="#ffffff" />
                </g>
            ) : symbol === 'mountain' ? (
                // Mountains & Sun for Kohat / Swat / Quetta
                <g fill="none" stroke={`url(#grad_gold_${boardId})`} strokeWidth="2">
                    <circle cx="50" cy="38" r="5" fill="#fde047" stroke="none" />
                    <path d="M30 62 L45 44 L55 54 L62 46 L70 62 Z" fill="rgba(254, 240, 138, 0.2)" />
                </g>
            ) : (
                // Standard Federal / National Open Book of Wisdom
                <g fill="none" stroke={`url(#grad_gold_${boardId})`} strokeWidth="2.5">
                    <path d="M50 48 Q40 42 32 46 V60 Q40 56 50 62 Q60 56 68 60 V46 Q60 42 50 48 Z" fill="rgba(255,255,255,0.15)" />
                    <line x1="50" y1="48" x2="50" y2="62" stroke="#ffffff" strokeWidth="2" />
                    <line x1="37" y1="50" x2="46" y2="48" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
                    <line x1="54" y1="48" x2="63" y2="50" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
                </g>
            )}

            {/* Bottom Open Book Pedestal */}
            <g fill="none" stroke={`url(#grad_gold_${boardId})`} strokeWidth="2">
                <path d="M50 68 Q42 63 34 66 V72 Q42 69 50 74 Q58 69 66 72 V66 Q58 63 50 68 Z" fill="#ffffff" />
                <line x1="50" y1="68" x2="50" y2="74" stroke={`url(#grad_gold_${boardId})`} strokeWidth="1.5" />
            </g>

            {/* Laurel Wreath Branches along sides */}
            <path d="M22 46 Q20 58 26 68" stroke={`url(#grad_gold_${boardId})`} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M78 46 Q80 58 74 68" stroke={`url(#grad_gold_${boardId})`} strokeWidth="2" fill="none" strokeLinecap="round" />

            {/* Small decorative stars */}
            <circle cx="21" cy="46" r="1.5" fill="#fde047" />
            <circle cx="79" cy="46" r="1.5" fill="#fde047" />
            <circle cx="50" cy="82" r="2" fill="#fde047" />
        </svg>
    );
};

// Complete Pakistan Examination Boards Catalog with Slogans & Logos
export const PAKISTAN_BOARD_DATA = [
    // --- KHYBER PAKHTUNKHWA (KPK) ---
    {
        id: 'BISE_KOHAT',
        name: 'BISE Kohat',
        shortCode: 'B-KHT',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'نور و ضیاء',
        sloganEn: 'Light & Splendor',
        districts: 'Kohat, Karak, Hangu, Kurram, Orakzai',
        primaryColor: '#047857', // Emerald
        accentColor: '#fbbf24', // Amber gold
        symbol: 'mountain'
    },
    {
        id: 'BISE_PESHAWAR',
        name: 'BISE Peshawar',
        shortCode: 'B-PSR',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'علم بڑی دولت ہے',
        sloganEn: 'Knowledge is Supreme Wealth',
        districts: 'Peshawar, Charsadda, Nowshera, Khyber, Mohmand',
        primaryColor: '#0f766e', // Teal
        accentColor: '#f59e0b',
        symbol: 'khyber'
    },
    {
        id: 'BISE_MARDAN',
        name: 'BISE Mardan',
        shortCode: 'B-MDN',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'سعی و عمل',
        sloganEn: 'Effort & Perseverance',
        districts: 'Mardan, Swabi',
        primaryColor: '#1d4ed8', // Royal Blue
        accentColor: '#fde047',
        symbol: 'book'
    },
    {
        id: 'BISE_ABBOTTABAD',
        name: 'BISE Abbottabad',
        shortCode: 'B-ATD',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'اقْرَأْ بِاسْمِ رَبِّكَ',
        sloganEn: 'Read in the Name of your Lord',
        districts: 'Abbottabad, Haripur, Mansehra, Battagram, Torghar, Kohistan',
        primaryColor: '#15803d', // Forest Green
        accentColor: '#facc15',
        symbol: 'mountain'
    },
    {
        id: 'BISE_SWAT',
        name: 'BISE Swat',
        shortCode: 'B-SWT',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'علم روشنی کا سرچشمہ ہے',
        sloganEn: 'Knowledge is the Fountain of Light',
        districts: 'Swat, Shangla, Buner',
        primaryColor: '#0369a1', // Sky Blue
        accentColor: '#38bdf8',
        symbol: 'mountain'
    },
    {
        id: 'BISE_MALAKAND',
        name: 'BISE Malakand',
        shortCode: 'B-MLK',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'تعلیم سب کے لیے',
        sloganEn: 'Education for All',
        districts: 'Malakand, Dir Lower, Dir Upper, Bajaur, Chitral',
        primaryColor: '#4338ca', // Indigo
        accentColor: '#a5b4fc',
        symbol: 'book'
    },
    {
        id: 'BISE_BANNU',
        name: 'BISE Bannu',
        shortCode: 'B-BNU',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'علم و آگہی',
        sloganEn: 'Knowledge & Consciousness',
        districts: 'Bannu, Lakki Marwat, North Waziristan',
        primaryColor: '#b45309', // Amber
        accentColor: '#fde68a',
        symbol: 'book'
    },
    {
        id: 'BISE_DIKHAN',
        name: 'BISE D.I. Khan',
        shortCode: 'B-DIK',
        province: 'Khyber Pakhtunkhwa (KPK)',
        slogan: 'علم ہی طاقت ہے',
        sloganEn: 'Knowledge is Power',
        districts: 'Dera Ismail Khan, Tank, South Waziristan',
        primaryColor: '#c2410c', // Crimson orange
        accentColor: '#fed7aa',
        symbol: 'book'
    },

    // --- FEDERAL CAPITAL ---
    {
        id: 'FBISE_ISLAMABAD',
        name: 'Federal Board (FBISE)',
        shortCode: 'FBISE',
        province: 'Federal Capital',
        slogan: 'رَّبِّ زِدْنِي عِلْمًا',
        sloganEn: 'O Lord, Increase Me in Knowledge',
        districts: 'Islamabad, Cantonments, Federal Areas & Overseas',
        primaryColor: '#1e3a8a', // Deep Navy
        accentColor: '#fbbf24', // Gold
        symbol: 'book'
    },

    // --- PUNJAB ---
    {
        id: 'BISE_LAHORE',
        name: 'BISE Lahore',
        shortCode: 'B-LHR',
        province: 'Punjab',
        slogan: 'نور و ہدایت',
        sloganEn: 'Light & Guidance',
        districts: 'Lahore, Kasur, Nankana Sahib, Sheikhupura',
        primaryColor: '#1e40af', // Blue
        accentColor: '#fde047',
        symbol: 'minar'
    },
    {
        id: 'BISE_RAWALPINDI',
        name: 'BISE Rawalpindi',
        shortCode: 'B-RWP',
        province: 'Punjab',
        slogan: 'علم روشنی ہے',
        sloganEn: 'Knowledge is Light',
        districts: 'Rawalpindi, Attock, Chakwal, Jhelum, Murree',
        primaryColor: '#831843', // Maroon
        accentColor: '#fbcfe8',
        symbol: 'mountain'
    },
    {
        id: 'BISE_GUJRANWALA',
        name: 'BISE Gujranwala',
        shortCode: 'B-GRW',
        province: 'Punjab',
        slogan: 'علم و ہنر',
        sloganEn: 'Knowledge & Skill',
        districts: 'Gujranwala, Gujrat, Hafizabad, Mandi Bahauddin, Narowal, Sialkot',
        primaryColor: '#6b21a8', // Purple
        accentColor: '#e9d5ff',
        symbol: 'book'
    },
    {
        id: 'BISE_FAISALABAD',
        name: 'BISE Faisalabad',
        shortCode: 'B-FSD',
        province: 'Punjab',
        slogan: 'محنت میں عظمت',
        sloganEn: 'Dignity of Labor & Knowledge',
        districts: 'Faisalabad, Chiniot, Jhang, Toba Tek Singh',
        primaryColor: '#0e7490', // Cyan dark
        accentColor: '#67e8f9',
        symbol: 'book'
    },
    {
        id: 'BISE_MULTAN',
        name: 'BISE Multan',
        shortCode: 'B-MLN',
        province: 'Punjab',
        slogan: 'علم شہرِ اولیاء کی پہچان',
        sloganEn: 'Light of the City of Saints',
        districts: 'Multan, Khanewal, Lodhran, Vehari',
        primaryColor: '#0284c7', // Multani Blue
        accentColor: '#bae6fd',
        symbol: 'book'
    },
    {
        id: 'BISE_SARGODHA',
        name: 'BISE Sargodha',
        shortCode: 'B-SGD',
        province: 'Punjab',
        slogan: 'شاہینوں کا عزم',
        sloganEn: 'Zeal of the Eagles',
        districts: 'Sargodha, Bhakkar, Khushab, Mianwali',
        primaryColor: '#15803d',
        accentColor: '#bbf7d0',
        symbol: 'book'
    },
    {
        id: 'BISE_BAHAWALPUR',
        name: 'BISE Bahawalpur',
        shortCode: 'B-BWP',
        province: 'Punjab',
        slogan: 'علم ہی سچی دولت ہے',
        sloganEn: 'True Wealth is Knowledge',
        districts: 'Bahawalpur, Bahawalnagar, Rahim Yar Khan',
        primaryColor: '#b45309',
        accentColor: '#fef08a',
        symbol: 'book'
    },
    {
        id: 'BISE_SAHIWAL',
        name: 'BISE Sahiwal',
        shortCode: 'B-SWL',
        province: 'Punjab',
        slogan: 'علم و تہذیب',
        sloganEn: 'Knowledge & Civilization',
        districts: 'Sahiwal, Okara, Pakpattan',
        primaryColor: '#065f46',
        accentColor: '#a7f3d0',
        symbol: 'book'
    },
    {
        id: 'BISE_DGKHAN',
        name: 'BISE D.G. Khan',
        shortCode: 'B-DGK',
        province: 'Punjab',
        slogan: 'جہالت کا خاتمہ علم سے',
        sloganEn: 'Eradicating Ignorance with Knowledge',
        districts: 'Dera Ghazi Khan, Layyah, Muzaffargarh, Rajanpur',
        primaryColor: '#78350f',
        accentColor: '#fed7aa',
        symbol: 'mountain'
    },

    // --- SINDH ---
    {
        id: 'BSEK_KARACHI',
        name: 'BSEK Karachi (Matric)',
        shortCode: 'BSEK',
        province: 'Sindh',
        slogan: 'علم سے ترقی',
        sloganEn: 'Progress through Knowledge',
        districts: 'Karachi Division (Secondary & Matric)',
        primaryColor: '#0369a1',
        accentColor: '#38bdf8',
        symbol: 'mausoleum'
    },
    {
        id: 'BISE_HYDERABAD',
        name: 'BISE Hyderabad',
        shortCode: 'B-HYD',
        province: 'Sindh',
        slogan: 'علم و ادب',
        sloganEn: 'Knowledge & Culture',
        districts: 'Hyderabad, Jamshoro, Matiari, Tando Allahyar, Thatta, Badin, Sujawal',
        primaryColor: '#991b1b', // Ajrak Red
        accentColor: '#fecaca',
        symbol: 'book'
    },
    {
        id: 'BISE_SUKKUR',
        name: 'BISE Sukkur',
        shortCode: 'B-SKR',
        province: 'Sindh',
        slogan: 'تعلیم سے امن',
        sloganEn: 'Peace through Education',
        districts: 'Sukkur, Ghotki, Khairpur',
        primaryColor: '#047857',
        accentColor: '#a7f3d0',
        symbol: 'book'
    },
    {
        id: 'BISE_LARKANA',
        name: 'BISE Larkana',
        shortCode: 'B-LRK',
        province: 'Sindh',
        slogan: 'قدیم تہذیب جدید علم',
        sloganEn: 'Ancient Heritage, Modern Science',
        districts: 'Larkana, Kamber, Shikarpur, Jacobabad, Kashmore',
        primaryColor: '#854d0e',
        accentColor: '#fde68a',
        symbol: 'book'
    },
    {
        id: 'BISE_MIRPURKHAS',
        name: 'BISE Mirpurkhas',
        shortCode: 'B-MPK',
        province: 'Sindh',
        slogan: 'صحرائے علم',
        sloganEn: 'Desert of Knowledge Blossoms',
        districts: 'Mirpurkhas, Sanghar, Umerkot, Tharparkar',
        primaryColor: '#c2410c',
        accentColor: '#ffedd5',
        symbol: 'book'
    },
    {
        id: 'BISE_SBA',
        name: 'BISE Shaheed Benazirabad',
        shortCode: 'B-SBA',
        province: 'Sindh',
        slogan: 'علم و بصیرت',
        sloganEn: 'Knowledge & Vision',
        districts: 'Nawabshah, Naushahro Feroze',
        primaryColor: '#be123c',
        accentColor: '#fecdd3',
        symbol: 'book'
    },
    {
        id: 'AKUEB_KARACHI',
        name: 'Aga Khan Board (AKU-EB)',
        shortCode: 'AKU-EB',
        province: 'Sindh',
        slogan: 'Quality Education for Life',
        sloganEn: 'Critical Thinking & Excellence',
        districts: 'National & Karachi Associated Schools',
        primaryColor: '#14532d',
        accentColor: '#86efac',
        symbol: 'book'
    },

    // --- BALOCHISTAN ---
    {
        id: 'BISE_QUETTA',
        name: 'BISE Quetta',
        shortCode: 'B-QTA',
        province: 'Balochistan',
        slogan: 'علم ہی زندگی ہے',
        sloganEn: 'Knowledge is Life',
        districts: 'All Balochistan Districts (Quetta, Pishin, Kalat, Zhob, etc.)',
        primaryColor: '#065f46',
        accentColor: '#fbbf24',
        symbol: 'mountain'
    },

    // --- AZAD JAMMU & KASHMIR (AJK) ---
    {
        id: 'BISE_MIRPUR_AJK',
        name: 'BISE Mirpur (AJK)',
        shortCode: 'B-AJK',
        province: 'Azad Jammu & Kashmir (AJK)',
        slogan: 'تعلیم و آزادی',
        sloganEn: 'Education & Dignity',
        districts: 'Mirpur, Kotli, Bhimber, Muzaffarabad, Rawalakot, Poonch',
        primaryColor: '#15803d',
        accentColor: '#fef08a',
        symbol: 'mountain'
    },

    // --- GILGIT-BALTISTAN ---
    {
        id: 'KIUEB_GILGIT',
        name: 'KIU-EB Gilgit',
        shortCode: 'KIU-EB',
        province: 'Gilgit-Baltistan',
        slogan: 'بلند عزائم اور علم',
        sloganEn: 'High Ambitions in the High Peaks',
        districts: 'Gilgit, Skardu, Diamer, Hunza, Ghizer, Nagar',
        primaryColor: '#0f766e',
        accentColor: '#5eead4',
        symbol: 'mountain'
    },

    // --- UNIVERSAL BASELINE ---
    {
        id: 'ALL_BISE_NATIONAL',
        name: 'All BISE Boards (National)',
        shortCode: 'NATL',
        province: 'Universal Baseline',
        slogan: 'قومی یکساں نصاب',
        sloganEn: 'National Single Curriculum Baseline',
        districts: 'All Secondary Schools Nationwide',
        primaryColor: '#1e1b4b',
        accentColor: '#fde047',
        symbol: 'book'
    }
];

// Helper to look up board details safely
export const getBoardData = (boardName) => {
    if (!boardName) return PAKISTAN_BOARD_DATA[0];
    const found = PAKISTAN_BOARD_DATA.find(b => 
        b.name.toLowerCase() === boardName.toLowerCase() ||
        b.id.toLowerCase() === boardName.toLowerCase() ||
        boardName.toLowerCase().includes(b.name.toLowerCase().replace('bise ', ''))
    );
    return found || PAKISTAN_BOARD_DATA[0];
};

// Grouped by Province for the picker
export const PAKISTAN_BOARD_GROUPS = [
    {
        province: 'Khyber Pakhtunkhwa (KPK)',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Khyber Pakhtunkhwa (KPK)')
    },
    {
        province: 'Federal Capital',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Federal Capital')
    },
    {
        province: 'Punjab',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Punjab')
    },
    {
        province: 'Sindh',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Sindh')
    },
    {
        province: 'Balochistan',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Balochistan')
    },
    {
        province: 'Azad Jammu & Kashmir (AJK)',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Azad Jammu & Kashmir (AJK)')
    },
    {
        province: 'Gilgit-Baltistan',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Gilgit-Baltistan')
    },
    {
        province: 'Universal Baseline',
        boards: PAKISTAN_BOARD_DATA.filter(b => b.province === 'Universal Baseline')
    }
];

export const ALL_BOARD_NAMES = PAKISTAN_BOARD_DATA.map(b => b.name);

