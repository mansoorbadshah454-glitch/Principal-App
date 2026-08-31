import React, { useState, useEffect, useRef } from 'react';
import {
    Palette, Printer, Download, Sparkles, Search, Check, Copy,
    FileText, BookOpen, Star, RefreshCw, X, ChevronRight, Eye,
    Layers, Award, Smile, CheckCircle, ArrowRight, Share2, ZoomIn, ZoomOut
} from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { useAuthPermissions } from '../context/AuthPermissionsContext';
import { useAlert } from '../context/AlertContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// =========================================================================
// 1. DATASETS & WORKSHEET TEMPLATES
// =========================================================================

const ENGLISH_ALPHABETS = [
    { letter: 'A', small: 'a', word: 'Apple', emoji: '🍎', phonics: '/æ/ as in Apple', level: 'Playgroup' },
    { letter: 'B', small: 'b', word: 'Ball', emoji: '⚽', phonics: '/b/ as in Ball', level: 'Playgroup' },
    { letter: 'C', small: 'c', word: 'Cat', emoji: '🐱', phonics: '/k/ as in Cat', level: 'Playgroup' },
    { letter: 'D', small: 'd', word: 'Duck', emoji: '🦆', phonics: '/d/ as in Duck', level: 'Playgroup' },
    { letter: 'E', small: 'e', word: 'Elephant', emoji: '🐘', phonics: '/e/ as in Elephant', level: 'Playgroup' },
    { letter: 'F', small: 'f', word: 'Fish', emoji: '🐟', phonics: '/f/ as in Fish', level: 'Playgroup' },
    { letter: 'G', small: 'g', word: 'Grapes', emoji: '🍇', phonics: '/g/ as in Grapes', level: 'Nursery' },
    { letter: 'H', small: 'h', word: 'Hat', emoji: '🎩', phonics: '/h/ as in Hat', level: 'Nursery' },
    { letter: 'I', small: 'i', word: 'Ice Cream', emoji: '🍦', phonics: '/ɪ/ as in Ice Cream', level: 'Nursery' },
    { letter: 'J', small: 'j', word: 'Jug', emoji: '🧃', phonics: '/dʒ/ as in Jug', level: 'Nursery' },
    { letter: 'K', small: 'k', word: 'Kite', emoji: '🪁', phonics: '/k/ as in Kite', level: 'Nursery' },
    { letter: 'L', small: 'l', word: 'Lion', emoji: '🦁', phonics: '/l/ as in Lion', level: 'Nursery' },
    { letter: 'M', small: 'm', word: 'Mango', emoji: '🥭', phonics: '/m/ as in Mango', level: 'Nursery' },
    { letter: 'N', small: 'n', word: 'Nest', emoji: '🪹', phonics: '/n/ as in Nest', level: 'Nursery' },
    { letter: 'O', small: 'o', word: 'Orange', emoji: '🍊', phonics: '/ɒ/ as in Orange', level: 'KG / Prep' },
    { letter: 'P', small: 'p', word: 'Parrot', emoji: '🦜', phonics: '/p/ as in Parrot', level: 'KG / Prep' },
    { letter: 'Q', small: 'q', word: 'Queen', emoji: '👑', phonics: '/kw/ as in Queen', level: 'KG / Prep' },
    { letter: 'R', small: 'r', word: 'Rainbow', emoji: '🌈', phonics: '/r/ as in Rainbow', level: 'KG / Prep' },
    { letter: 'S', small: 's', word: 'Sun', emoji: '☀️', phonics: '/s/ as in Sun', level: 'KG / Prep' },
    { letter: 'T', small: 't', word: 'Tree', emoji: '🌳', phonics: '/t/ as in Tree', level: 'KG / Prep' },
    { letter: 'U', small: 'u', word: 'Umbrella', emoji: '☂️', phonics: '/ʌ/ as in Umbrella', level: 'KG / Prep' },
    { letter: 'V', small: 'v', word: 'Van', emoji: '🚐', phonics: '/v/ as in Van', level: 'KG / Prep' },
    { letter: 'W', small: 'w', word: 'Watch', emoji: '⌚', phonics: '/w/ as in Watch', level: 'KG / Prep' },
    { letter: 'X', small: 'x', word: 'Xylophone', emoji: '🎼', phonics: '/ks/ as in Xylophone', level: 'KG / Prep' },
    { letter: 'Y', small: 'y', word: 'Yacht', emoji: '⛵', phonics: '/j/ as in Yacht', level: 'KG / Prep' },
    { letter: 'Z', small: 'z', word: 'Zebra', emoji: '🦓', phonics: '/z/ as in Zebra', level: 'KG / Prep' }
];

const PRE_WRITING_PATTERNS = [
    { id: 'pat_standing', title: 'Standing Lines (Vertical)', subtitle: 'Pencil Down Strokes ⬇️', icon: '┃', level: 'Playgroup' },
    { id: 'pat_sleeping', title: 'Sleeping Lines (Horizontal)', subtitle: 'Left to Right Strokes ➡️', icon: '━', level: 'Playgroup' },
    { id: 'pat_slanting', title: 'Slanting & Diagonal Lines', subtitle: 'Rain Drop Slants ↘️ ↙️', icon: '╱', level: 'Playgroup' },
    { id: 'pat_zigzag', title: 'Zig-Zag Mountain Lines', subtitle: 'Mountain Climb Peaks ⛰️', icon: '⩔', level: 'Nursery' },
    { id: 'pat_curves', title: 'Curved Waves & Bounces', subtitle: 'Ocean Wave Loops 🌊', icon: '〰️', level: 'Nursery' },
    { id: 'pat_circles', title: 'Circles & Clockwise Spirals', subtitle: 'Sun & Wheel Tracing ⭕', icon: '🌀', level: 'Nursery' }
];

const CVC_PHONICS_WORDS = [
    { id: 'cvc_cat', word: 'CAT', letters: ['C', 'A', 'T'], emoji: '🐱', sentence: 'The cat sits on the mat.', level: 'KG / Prep' },
    { id: 'cvc_dog', word: 'DOG', letters: ['D', 'O', 'G'], emoji: '🐶', sentence: 'The dog can run and hop.', level: 'KG / Prep' },
    { id: 'cvc_bag', word: 'BAG', letters: ['B', 'A', 'G'], emoji: '🎒', sentence: 'I have a big blue bag.', level: 'KG / Prep' },
    { id: 'cvc_sun', word: 'SUN', letters: ['S', 'U', 'N'], emoji: '☀️', sentence: 'The sun is hot and bright.', level: 'KG / Prep' },
    { id: 'cvc_pen', word: 'PEN', letters: ['P', 'E', 'N'], emoji: '🖊️', sentence: 'Write with a red pen.', level: 'KG / Prep' },
    { id: 'cvc_cup', word: 'CUP', letters: ['C', 'U', 'P'], emoji: '☕', sentence: 'Hot milk in my cup.', level: 'KG / Prep' }
];

const URDU_HAROOF = [
    { harf: 'ا', name: 'Alif', word: 'انار', emoji: '🍎', translit: 'Anaar (Pomegranate)', aadhi: '—', level: 'Playgroup' },
    { harf: 'ب', name: 'Bay', word: 'بلی', emoji: '🐱', translit: 'Billi (Cat)', aadhi: 'بـ', level: 'Playgroup' },
    { harf: 'پ', name: 'Pay', word: 'پتنگ', emoji: '🪁', translit: 'Patang (Kite)', aadhi: 'پـ', level: 'Playgroup' },
    { harf: 'ت', name: 'Tay', word: 'تتلی', emoji: '🦋', translit: 'Titli (Butterfly)', aadhi: 'تـ', level: 'Playgroup' },
    { harf: 'ٹ', name: 'TTay', word: 'ٹماٹر', emoji: '🍅', translit: 'Tamatar (Tomato)', aadhi: 'ٹـ', level: 'Playgroup' },
    { harf: 'ث', name: 'Say', word: 'ثمر', emoji: '🍓', translit: 'Samar (Fruits)', aadhi: 'ثـ', level: 'Nursery' },
    { harf: 'ج', name: 'Jeem', word: 'جہاز', emoji: '✈️', translit: 'Jahaz (Aeroplane)', aadhi: 'جـ', level: 'Nursery' },
    { harf: 'چ', name: 'Chay', word: 'چڑیا', emoji: '🐦', translit: 'Chiriya (Sparrow)', aadhi: 'چـ', level: 'Nursery' },
    { harf: 'ح', name: 'Hay', word: 'حلوہ', emoji: '🍲', translit: 'Halwa (Sweet)', aadhi: 'حـ', level: 'Nursery' },
    { harf: 'خ', name: 'Khay', word: 'خرگوش', emoji: '🐇', translit: 'Khargosh (Rabbit)', aadhi: 'خـ', level: 'Nursery' },
    { harf: 'د', name: 'Daal', word: 'درخت', emoji: '🌳', translit: 'Darakht (Tree)', aadhi: '—', level: 'Nursery' },
    { harf: 'ڈ', name: 'DDaal', word: 'ڈولفین', emoji: '🐬', translit: 'Dolphin', aadhi: '—', level: 'Nursery' },
    { harf: 'ذ', name: 'Zaal', word: 'ذخیرہ', emoji: '📦', translit: 'Zakheera', aadhi: '—', level: 'Nursery' },
    { harf: 'ر', name: 'Ray', word: 'ریل گاڑی', emoji: '🚂', translit: 'Rail Gaari (Train)', aadhi: '—', level: 'Nursery' },
    { harf: 'ڑ', name: 'RRay', word: 'پہاڑ', emoji: '⛰️', translit: 'Pahar (Mountain)', aadhi: '—', level: 'Nursery' },
    { harf: 'ز', name: 'Zay', word: 'زرافہ', emoji: '🦒', translit: 'Zarafa (Giraffe)', aadhi: '—', level: 'Nursery' },
    { harf: 'س', name: 'Seen', word: 'سیب', emoji: '🍏', translit: 'Saib (Apple)', aadhi: 'سـ', level: 'KG / Prep' },
    { harf: 'ش', name: 'Sheen', word: 'شیر', emoji: '🦁', translit: 'Shair (Lion)', aadhi: 'شـ', level: 'KG / Prep' },
    { harf: 'ص', name: 'Saad', word: 'صوفہ', emoji: '🛋️', translit: 'Sofa', aadhi: 'صـ', level: 'KG / Prep' },
    { harf: 'ض', name: 'Zaad', word: 'ضعیف', emoji: '👴', translit: 'Zaeef (Old Man)', aadhi: 'ضـ', level: 'KG / Prep' },
    { harf: 'ط', name: 'Toyen', word: 'طوطا', emoji: '🦜', translit: 'Tota (Parrot)', aadhi: '—', level: 'KG / Prep' },
    { harf: 'ظ', name: 'Zoyen', word: 'ظروف', emoji: '🏺', translit: 'Zuroof (Pots)', aadhi: '—', level: 'KG / Prep' },
    { harf: 'ع', name: 'Ain', word: 'عینک', emoji: '👓', translit: 'Ainak (Glasses)', aadhi: 'عـ', level: 'KG / Prep' },
    { harf: 'غ', name: 'Ghain', word: 'غبارہ', emoji: '🎈', translit: 'Ghubara (Balloon)', aadhi: 'غـ', level: 'KG / Prep' },
    { harf: 'ف', name: 'Fay', word: 'فوارہ', emoji: '⛲', translit: 'Fawara (Fountain)', aadhi: 'فـ', level: 'KG / Prep' },
    { harf: 'ق', name: 'Qaaf', word: 'قلم', emoji: '✒️', translit: 'Qalam (Pen)', aadhi: 'قـ', level: 'KG / Prep' },
    { harf: 'ک', name: 'Kaaf', word: 'کتاب', emoji: '📖', translit: 'Kitaab (Book)', aadhi: 'کـ', level: 'KG / Prep' },
    { harf: 'گ', name: 'Gaaf', word: 'گڑیا', emoji: '🪆', translit: 'Guriya (Doll)', aadhi: 'گـ', level: 'KG / Prep' },
    { harf: 'ل', name: 'Laam', word: 'لومڑی', emoji: '🦊', translit: 'Loomri (Fox)', aadhi: 'لـ', level: 'KG / Prep' },
    { harf: 'م', name: 'Meem', word: 'مور', emoji: '🦚', translit: 'More (Peacock)', aadhi: 'مـ', level: 'KG / Prep' },
    { harf: 'ن', name: 'Noon', word: 'نلکا', emoji: '🚰', translit: 'Nalka (Tap)', aadhi: 'نـ', level: 'KG / Prep' },
    { harf: 'و', name: 'Wao', word: 'ورزش', emoji: '🏃', translit: 'Warzish (Exercise)', aadhi: '—', level: 'KG / Prep' },
    { harf: 'ہ', name: 'Choti Hay', word: 'ہاتھی', emoji: '🐘', translit: 'Haathi (Elephant)', aadhi: 'ہـ', level: 'KG / Prep' },
    { harf: 'ی', name: 'Choti Yay', word: 'یکہ', emoji: '🐴', translit: 'Yakka (Cart)', aadhi: 'یـ', level: 'KG / Prep' },
    { harf: 'ے', name: 'Bari Yay', word: 'چائے', emoji: '☕', translit: 'Chai (Tea)', aadhi: '—', level: 'KG / Prep' }
];

const MATHS_ITEMS = [
    { num: 1, word: 'One', count: 1, item: 'Sun', emoji: '☀️', level: 'Playgroup' },
    { num: 2, word: 'Two', count: 2, item: 'Apples', emoji: '🍎', level: 'Playgroup' },
    { num: 3, word: 'Three', count: 3, item: 'Cars', emoji: '🚗', level: 'Playgroup' },
    { num: 4, word: 'Four', count: 4, item: 'Stars', emoji: '⭐', level: 'Playgroup' },
    { num: 5, word: 'Five', count: 5, item: 'Balloons', emoji: '🎈', level: 'Playgroup' },
    { num: 6, word: 'Six', count: 6, item: 'Fish', emoji: '🐟', level: 'Nursery' },
    { num: 7, word: 'Seven', count: 7, item: 'Flowers', emoji: '🌸', level: 'Nursery' },
    { num: 8, word: 'Eight', count: 8, item: 'Kites', emoji: '🪁', level: 'Nursery' },
    { num: 9, word: 'Nine', count: 9, item: 'Ducks', emoji: '🦆', level: 'Nursery' },
    { num: 10, word: 'Ten', count: 10, item: 'Hearts', emoji: '💖', level: 'Nursery' },
    { num: 11, word: 'Eleven', count: 11, item: 'Candies', emoji: '🍬', level: 'KG / Prep' },
    { num: 12, word: 'Twelve', count: 12, item: 'Ice Creams', emoji: '🍦', level: 'KG / Prep' },
    { num: 15, word: 'Fifteen', count: 15, item: 'Gems', emoji: '💎', level: 'KG / Prep' },
    { num: 20, word: 'Twenty', count: 20, item: 'Pencils', emoji: '✏️', level: 'KG / Prep' }
];

const SHAPES_DATA = [
    { shape: 'Circle', sides: '0 Sides (Round)', emoji: '⭕', desc: 'Like a coin or clock 🪙', level: 'Playgroup' },
    { shape: 'Square', sides: '4 Equal Sides', emoji: '🟦', desc: 'Like a window frame 🪟', level: 'Playgroup' },
    { shape: 'Triangle', sides: '3 Sides & 3 Corners', emoji: '🔺', desc: 'Like a slice of pizza 🍕', level: 'Nursery' },
    { shape: 'Rectangle', sides: '2 Long & 2 Short Sides', emoji: '▭', desc: 'Like a door or book 📖', level: 'Nursery' },
    { shape: 'Star', sides: '5 Points', emoji: '⭐', desc: 'Twinkle in the sky ✨', level: 'Nursery' },
    { shape: 'Diamond / Rhombus', sides: '4 Slanted Sides', emoji: '🔷', desc: 'Like a flying kite 🪁', level: 'KG / Prep' }
];

const ISLAMIC_GK_DATA = [
    {
        id: 'isl_kalima',
        title: 'Pehla Kalima (Kalima Tayyiba)',
        category: 'Islamic Studies',
        arabic: 'لَا إِلٰهَ إِلَّا اللهُ مُحَمَّدٌ رَّسُولُ اللهِ',
        translation: 'There is none worthy of worship except Allah, and Muhammad (PBUH) is His Messenger.',
        level: 'Nursery'
    },
    {
        id: 'isl_bismillah',
        title: 'Bismillah-ir-Rahman-ir-Rahim',
        category: 'Islamic Studies',
        arabic: 'بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ',
        translation: 'In the name of Allah, the Most Gracious, the Most Merciful.',
        level: 'Playgroup'
    },
    {
        id: 'isl_dua_eating',
        title: 'Khana Khane ki Dua (Before Eating)',
        category: 'Islamic Studies',
        arabic: 'بِسْمِ اللهِ وَعَلَى بَرَكَةِ اللهِ',
        translation: 'In the name of Allah and upon the blessings of Allah.',
        level: 'Nursery'
    },
    {
        id: 'gk_body_parts',
        title: 'My Wonderful Body & 5 Senses',
        category: 'General Knowledge',
        items: [
            { name: 'Eyes', desc: 'To see beautiful things 👁️' },
            { name: 'Ears', desc: 'To hear birds singing 👂' },
            { name: 'Nose', desc: 'To smell flowers 👃' },
            { name: 'Mouth / Tongue', desc: 'To taste yummy food 👄' },
            { name: 'Hands', desc: 'To touch and write ✋' }
        ],
        level: 'Playgroup'
    },
    {
        id: 'gk_animals_farm',
        title: 'Farm Animals vs Wild Animals',
        category: 'General Knowledge',
        items: [
            { name: 'Cow 🐮', type: 'Farm Animal (Gives milk)' },
            { name: 'Sheep 🐑', type: 'Farm Animal (Gives wool)' },
            { name: 'Lion 🦁', type: 'Wild Animal (King of Jungle)' },
            { name: 'Elephant 🐘', type: 'Wild Animal (Huge & Gentle)' }
        ],
        level: 'Nursery'
    },
    {
        id: 'gk_seasons',
        title: 'The Four Seasons (Mausam)',
        category: 'General Knowledge',
        items: [
            { name: 'Summer (Garmi) ☀️', desc: 'Sunny and warm mango season' },
            { name: 'Winter (Sardi) ❄️', desc: 'Cold with warm jackets and tea' },
            { name: 'Rainy (Barsaat) 🌧️', desc: 'Clouds, rain, and umbrellas' },
            { name: 'Spring (Bahaar) 🌸', desc: 'Green grass and colorful flowers' }
        ],
        level: 'KG / Prep'
    }
];

const CLIPARTS_DATA = [
    // Animals
    { id: 'c_lion', name: 'Cute Baby Lion', category: 'Animals', emoji: '🦁', color: '#f59e0b' },
    { id: 'c_cat', name: 'Playful Kitten', category: 'Animals', emoji: '🐱', color: '#ec4899' },
    { id: 'c_dog', name: 'Friendly Puppy', category: 'Animals', emoji: '🐶', color: '#8b5cf6' },
    { id: 'c_elephant', name: 'Baby Elephant', category: 'Animals', emoji: '🐘', color: '#64748b' },
    { id: 'c_monkey', name: 'Funny Monkey', category: 'Animals', emoji: '🐵', color: '#d97706' },
    { id: 'c_rabbit', name: 'Fluffy Bunny', category: 'Animals', emoji: '🐇', color: '#10b981' },
    { id: 'c_panda', name: 'Cute Panda Bear', category: 'Animals', emoji: '🐼', color: '#1e293b' },
    { id: 'c_butterfly', name: 'Colorful Butterfly', category: 'Animals', emoji: '🦋', color: '#06b6d4' },
    // Fruits & Food
    { id: 'c_apple', name: 'Sweet Red Apple', category: 'Fruits & Food', emoji: '🍎', color: '#ef4444' },
    { id: 'c_mango', name: 'King Mango', category: 'Fruits & Food', emoji: '🥭', color: '#f59e0b' },
    { id: 'c_banana', name: 'Yellow Banana', category: 'Fruits & Food', emoji: '🍌', color: '#eab308' },
    { id: 'c_strawberry', name: 'Fresh Strawberry', category: 'Fruits & Food', emoji: '🍓', color: '#f43f5e' },
    { id: 'c_grapes', name: 'Juicy Grapes', category: 'Fruits & Food', emoji: '🍇', color: '#8b5cf6' },
    { id: 'c_icecream', name: 'Sundae Ice Cream', category: 'Fruits & Food', emoji: '🍦', color: '#06b6d4' },
    // Vehicles
    { id: 'c_bus', name: 'Yellow School Bus', category: 'Vehicles', emoji: '🚌', color: '#eab308' },
    { id: 'c_plane', name: 'Jet Aeroplane', category: 'Vehicles', emoji: '✈️', color: '#0284c7' },
    { id: 'c_rocket', name: 'Space Rocket', category: 'Vehicles', emoji: '🚀', color: '#f97316' },
    { id: 'c_train', name: 'Steam Engine Train', category: 'Vehicles', emoji: '🚂', color: '#475569' },
    { id: 'c_car', name: 'Little Red Car', category: 'Vehicles', emoji: '🚗', color: '#ef4444' },
    // School Stationery
    { id: 'c_book', name: 'Open Storybook', category: 'School Items', emoji: '📖', color: '#3b82f6' },
    { id: 'c_pencil', name: 'Pencil & Eraser', category: 'School Items', emoji: '✏️', color: '#f59e0b' },
    { id: 'c_bag', name: 'School Backpack', category: 'School Items', emoji: '🎒', color: '#10b981' },
    { id: 'c_palette', name: 'Artist Paint Palette', category: 'School Items', emoji: '🎨', color: '#ec4899' },
    { id: 'c_globe', name: 'World Globe', category: 'School Items', emoji: '🌍', color: '#0284c7' },
    // Reward Badges
    { id: 'c_star', name: 'Super Star Student', category: 'Reward Badges', emoji: '⭐', color: '#eab308' },
    { id: 'c_trophy', name: 'Golden Champion Trophy', category: 'Reward Badges', emoji: '🏆', color: '#d97706' },
    { id: 'c_medal', name: '1st Position Gold Medal', category: 'Reward Badges', emoji: '🥇', color: '#eab308' },
    { id: 'c_crown', name: 'King / Queen Crown', category: 'Reward Badges', emoji: '👑', color: '#f59e0b' },
    { id: 'c_thumb', name: 'Great Job! Thumbs Up', category: 'Reward Badges', emoji: '👍', color: '#10b981' },
    { id: 'c_heart', name: 'Teacher Loved It Heart', category: 'Reward Badges', emoji: '💖', color: '#f43f5e' }
];

// =========================================================================
// MAIN COMPONENT
// =========================================================================

const PreSchoolStudio = () => {
    const { schoolId: authSchoolId } = useAuthPermissions();
    const { showAlert } = useAlert();

    // Fallback School ID resolution
    const [schoolId, setSchoolId] = useState(() => {
        if (authSchoolId) return authSchoolId;
        try {
            const sess = localStorage.getItem('manual_session');
            if (sess) return JSON.parse(sess).schoolId || '';
        } catch (e) { }
        return '';
    });

    useEffect(() => {
        if (authSchoolId) {
            setSchoolId(authSchoolId);
        } else if (!schoolId) {
            getDocs(collection(db, 'schools')).then(snap => {
                if (!snap.empty) setSchoolId(snap.docs[0].id);
            }).catch(console.error);
        }
    }, [authSchoolId]);

    // School Profile
    const [schoolInfo, setSchoolInfo] = useState({
        name: 'The Smart Pre-School & Academy',
        address: 'Main Campus, Model Town, Lahore',
        phone: '0300-1234567',
        logoUrl: ''
    });

    useEffect(() => {
        if (!schoolId) return;
        getDoc(doc(db, 'schools', schoolId)).then(snap => {
            if (snap.exists()) {
                const d = snap.data();
                setSchoolInfo({
                    name: d.name || 'Pre-School Campus',
                    address: d.address || 'Campus Address',
                    phone: d.phone || d.emergencyContact || '',
                    logoUrl: d.profileImage || d.logoUrl || ''
                });
            }
        }).catch(console.error);
    }, [schoolId]);

    // Active Navigation Tabs
    const [activeCategory, setActiveCategory] = useState('english'); // 'english', 'urdu', 'maths', 'islamic_gk', 'batch_workbooks', 'cliparts'
    const [selectedLevelFilter, setSelectedLevelFilter] = useState('All'); // 'All', 'Playgroup', 'Nursery', 'KG / Prep'
    const [searchQuery, setSearchQuery] = useState('');
    const [clipartCategoryFilter, setClipartCategoryFilter] = useState('All');

    // Live Customizer / Printable Modal State
    const [activeWorksheet, setActiveWorksheet] = useState(null);
    const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
    const [copiedClipartId, setCopiedClipartId] = useState(null);

    const sheetPrintRef = useRef(null);

    // -------------------------------------------------------------
    // Print & PDF Export Functions
    // -------------------------------------------------------------
    const handlePrintWorksheet = () => {
        window.print();
    };

    const handleDownloadSinglePDF = async () => {
        if (!sheetPrintRef.current) return;
        try {
            showAlert('Compiling high-resolution A4 vector sheet...', 'info');
            const canvas = await html2canvas(sheetPrintRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            const fileName = `${activeWorksheet.title || 'Worksheet'}_${activeWorksheet.type || 'Practice'}.pdf`.replace(/\s+/g, '_');
            pdf.save(fileName);
            showAlert('🎉 Worksheet PDF downloaded successfully!', 'success');
        } catch (error) {
            console.error('PDF error:', error);
            showAlert('Failed to download PDF: ' + error.message, 'error');
        }
    };

    // --- Batch Workbook Compiler ---
    const handleGenerateBatchWorkbook = async (type = 'english_a_z') => {
        setIsGeneratingBatch(true);
        showAlert('Compiling complete multi-page pre-school workbook... Please wait.', 'info');

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            // 1. FRONT COVER PAGE
            pdf.setFillColor(15, 23, 42); // Dark Navy Blue Cover
            pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

            // White Inner Card
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(12, 12, pdfWidth - 24, pdfHeight - 24, 6, 6, 'F');

            // School Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(18);
            pdf.setTextColor(2, 132, 199);
            pdf.text(schoolInfo.name.toUpperCase(), 105, 35, { align: 'center' });

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 116, 139);
            pdf.text(schoolInfo.address, 105, 42, { align: 'center' });

            // Title Banner
            pdf.setFontSize(26);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(15, 23, 42);
            const titleText = type === 'english_a_z'
                ? 'MY FIRST ENGLISH\nALPHABET WORKBOOK'
                : type === 'urdu_haroof'
                    ? 'میری پہلی اردو\nحروفِ تہجی ورک بُک'
                    : 'MY FUN MATHS &\nNUMBERS WORKBOOK';
            pdf.text(titleText, 105, 90, { align: 'center' });

            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(16, 185, 129);
            pdf.text(type === 'english_a_z' ? '🔤 Complete A to Z Handwriting & Phonics' : type === 'urdu_haroof' ? '🌙 الف تا ے خوشخطی و تصویر ملاؤ' : '🔢 Numbers 1 to 20 & Shapes Fun', 105, 125, { align: 'center' });

            // Student Details Frame
            pdf.setDrawColor(203, 213, 225);
            pdf.setFillColor(248, 250, 252);
            pdf.roundedRect(30, 160, 150, 60, 4, 4, 'FD');

            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(30, 41, 59);
            pdf.text('STUDENT WORKBOOK RECORD', 105, 172, { align: 'center' });

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.text('Student Name: _________________________________', 38, 185);
            pdf.text('Class / Grade: _________________________________', 38, 195);
            pdf.text('Roll Number:  _________________________________', 38, 205);
            pdf.text('Teacher Name: _________________________________', 38, 215);

            pdf.setFontSize(9);
            pdf.setTextColor(148, 163, 184);
            pdf.text('Authorized Pre-School Curriculum Edition • All Rights Reserved', 105, 260, { align: 'center' });

            // 2. INNER WORKSHEET PAGES
            if (type === 'english_a_z') {
                ENGLISH_ALPHABETS.forEach((item, idx) => {
                    pdf.addPage();

                    // Page Header
                    pdf.setFontSize(11);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(2, 132, 199);
                    pdf.text(schoolInfo.name.toUpperCase(), 20, 14);

                    pdf.setFontSize(8);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`Name: ____________________  |  Roll #: _______  |  Date: ____________`, 20, 20);

                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(20, 23, 190, 23);

                    // Giant Letter Banner
                    pdf.setFontSize(38);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(15, 23, 42);
                    pdf.text(`${item.letter}  ${item.small}`, 30, 48);

                    pdf.setFontSize(14);
                    pdf.setTextColor(79, 70, 229);
                    pdf.text(`${item.letter} is for ${item.word} ${item.emoji}`, 85, 42);

                    pdf.setFontSize(9);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`Phonics Sound: ${item.phonics}`, 85, 48);

                    // Tracing Guide Box
                    pdf.setDrawColor(14, 165, 233);
                    pdf.setFillColor(240, 249, 255);
                    pdf.roundedRect(20, 56, 170, 18, 2, 2, 'FD');
                    pdf.setFontSize(9);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(3, 105, 161);
                    pdf.text(`✍️ Step-by-Step Tracing Instructions:`, 25, 63);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`Start from the top dot, follow the guided arrows down, and stay between the blue guidelines.`, 25, 69);

                    // 4-Line Writing Tracks
                    let trackY = 86;
                    for (let line = 1; line <= 7; line++) {
                        // 4-Line guides
                        pdf.setDrawColor(239, 68, 68); // Top Red
                        pdf.setLineWidth(0.3);
                        pdf.line(20, trackY, 190, trackY);

                        pdf.setDrawColor(59, 130, 246); // Middle Blue 1
                        pdf.line(20, trackY + 5, 190, trackY + 5);

                        pdf.setDrawColor(59, 130, 246); // Middle Blue 2
                        pdf.line(20, trackY + 10, 190, trackY + 10);

                        pdf.setDrawColor(239, 68, 68); // Bottom Red
                        pdf.line(20, trackY + 15, 190, trackY + 15);

                        // Sample letter & dotted letters
                        pdf.setFontSize(22);
                        pdf.setFont('courier', 'bold');
                        pdf.setTextColor(15, 23, 42);
                        pdf.text(`${item.letter} ${item.small}`, 24, trackY + 11);

                        pdf.setFont('courier', 'normal');
                        pdf.setTextColor(203, 213, 225); // Dotted gray
                        pdf.text(`${item.letter} ${item.small}   ${item.letter} ${item.small}   ${item.letter} ${item.small}   ${item.letter} ${item.small}   ${item.letter} ${item.small}`, 48, trackY + 11);

                        trackY += 23;
                    }

                    // Footer Feedback
                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(20, 265, 190, 265);
                    pdf.setFontSize(8.5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(71, 85, 105);
                    pdf.text(`Teacher's Remark: [ Great Effort / Well Done ]`, 20, 274);
                    pdf.text(`Star Rating: ⭐ ⭐ ⭐ ⭐ ⭐`, 110, 274);
                    pdf.text(`Page ${idx + 1} of 26`, 165, 274);
                });
            } else if (type === 'urdu_haroof') {
                URDU_HAROOF.forEach((item, idx) => {
                    pdf.addPage();
                    // Page Header
                    pdf.setFontSize(11);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(16, 185, 129);
                    pdf.text(schoolInfo.name.toUpperCase(), 20, 14);

                    pdf.setFontSize(8);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`Student: ____________________  |  Date: ____________  |  Page ${idx + 1}/36`, 20, 20);

                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(20, 23, 190, 23);

                    // Giant Urdu Harf
                    pdf.setFontSize(36);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(15, 23, 42);
                    pdf.text(`${item.harf}`, 160, 48, { align: 'right' });

                    pdf.setFontSize(15);
                    pdf.setTextColor(5, 150, 105);
                    pdf.text(`${item.harf}  سے  ${item.word} ${item.emoji}`, 120, 42, { align: 'right' });

                    pdf.setFontSize(9);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`Aadhi Ashkaal: ${item.aadhi}  |  Sound: ${item.translit}`, 20, 46);

                    // Urdu Grid Lines
                    let trackY = 70;
                    for (let line = 1; line <= 8; line++) {
                        pdf.setDrawColor(203, 213, 225);
                        pdf.setLineWidth(0.4);
                        pdf.line(20, trackY, 190, trackY);
                        pdf.line(20, trackY + 16, 190, trackY + 16);

                        pdf.setFontSize(26);
                        pdf.setFont('helvetica', 'bold');
                        pdf.setTextColor(15, 23, 42);
                        pdf.text(`${item.harf}`, 175, trackY + 12, { align: 'right' });

                        pdf.setTextColor(203, 213, 225);
                        pdf.text(`${item.harf}     ${item.harf}     ${item.harf}     ${item.harf}     ${item.harf}`, 145, trackY + 12, { align: 'right' });

                        trackY += 23;
                    }

                    // Footer
                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(20, 265, 190, 265);
                    pdf.setFontSize(8.5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(71, 85, 105);
                    pdf.text(`Teacher Signature: __________________`, 20, 274);
                    pdf.text(`Shabaash! ⭐ ⭐ ⭐ ⭐ ⭐`, 130, 274);
                });
            } else if (type === 'maths_numbers') {
                MATHS_ITEMS.forEach((item, idx) => {
                    pdf.addPage();
                    pdf.setFontSize(11);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(245, 158, 11);
                    pdf.text(schoolInfo.name.toUpperCase(), 20, 14);

                    pdf.setFontSize(8);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`Name: ____________________  |  Roll #: _______  |  Date: ____________`, 20, 20);

                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(20, 23, 190, 23);

                    // Giant Number
                    pdf.setFontSize(40);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(217, 119, 6);
                    pdf.text(`${item.num}`, 30, 50);

                    pdf.setFontSize(16);
                    pdf.setTextColor(15, 23, 42);
                    pdf.text(`Number: ${item.word}`, 65, 42);

                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`Count and color the ${item.item}: ${item.emoji.repeat(Math.min(item.count, 10))}`, 65, 50);

                    // Maths Square Box Grid
                    let gridY = 65;
                    for (let row = 0; row < 7; row++) {
                        for (let col = 0; col < 8; col++) {
                            const boxX = 22 + (col * 21);
                            const boxY = gridY + (row * 24);
                            pdf.setDrawColor(203, 213, 225);
                            pdf.setLineWidth(0.4);
                            pdf.rect(boxX, boxY, 19, 21);

                            pdf.setFontSize(18);
                            pdf.setFont('helvetica', col === 0 ? 'bold' : 'normal');
                            pdf.setTextColor(col === 0 ? 15 : 203, col === 0 ? 23 : 213, col === 0 ? 42 : 225);
                            pdf.text(`${item.num}`, boxX + 9.5, boxY + 15, { align: 'center' });
                        }
                    }

                    // Footer
                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(20, 265, 190, 265);
                    pdf.setFontSize(8.5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(71, 85, 105);
                    pdf.text(`Teacher Remark: [ Excellent Counting ]`, 20, 274);
                    pdf.text(`Star Rating: ⭐ ⭐ ⭐ ⭐ ⭐`, 130, 274);
                });
            }

            pdf.save(`${type.toUpperCase()}_Workbook_${schoolInfo.name.replace(/\s+/g, '_')}.pdf`);
            showAlert('🎉 Complete Batch Workbook compiled and downloaded!', 'success');
        } catch (err) {
            console.error('Batch error:', err);
            showAlert('Failed to compile workbook: ' + err.message, 'error');
        } finally {
            setIsGeneratingBatch(false);
        }
    };

    // -------------------------------------------------------------
    // Copy Clipart Handler
    // -------------------------------------------------------------
    const handleCopyClipart = (clipart) => {
        navigator.clipboard.writeText(clipart.emoji);
        setCopiedClipartId(clipart.id);
        showAlert(`Copied ${clipart.name} (${clipart.emoji}) to clipboard!`, 'success');
        setTimeout(() => setCopiedClipartId(null), 2000);
    };

    return (
        <div style={{ padding: '1.25rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header Title Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0369a1 100%)',
                color: 'white',
                padding: '1.75rem',
                borderRadius: '16px',
                marginBottom: '1.5rem',
                boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                        <span style={{ background: '#f59e0b', color: '#0f172a', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800' }}>
                            EARLY YEARS & MONTESSORI STUDIO
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#93c5fd' }}>
                            Playgroup • Nursery • KG / Prep
                        </span>
                    </div>
                    <h1 style={{ fontSize: '1.7rem', fontWeight: '900', margin: '0 0 0.4rem 0', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Palette size={28} color="#38bdf8" /> Pre-School Activity Sheets & Cliparts
                    </h1>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#cbd5e1', maxWidth: '650px' }}>
                        Generate high-resolution printable handwriting tracing sheets, Urdu Haroof booklets, Maths box grids, Islamic Duas, and transparent clipart graphics with automatic school branding.
                    </p>
                </div>

                {/* Quick Action Badges */}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.6rem 1rem', borderRadius: '10px', backdropFilter: 'blur(10px)', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#38bdf8' }}>120+</div>
                        <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>Activity Sheets</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.6rem 1rem', borderRadius: '10px', backdropFilter: 'blur(10px)', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#4ade80' }}>1-Click</div>
                        <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>Auto Branding</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.6rem 1rem', borderRadius: '10px', backdropFilter: 'blur(10px)', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#fbbf24' }}>Vector</div>
                        <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>PDF Workbooks</div>
                    </div>
                </div>
            </div>

            {/* Navigation Category Tabs */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                borderBottom: '2px solid #e2e8f0',
                marginBottom: '1.25rem',
                overflowX: 'auto',
                paddingBottom: '0.25rem'
            }}>
                {[
                    { id: 'english', label: '🔤 English Worksheets', count: ENGLISH_ALPHABETS.length + PRE_WRITING_PATTERNS.length + CVC_PHONICS_WORDS.length },
                    { id: 'urdu', label: '🌙 Urdu Haroof (ا سے ے)', count: URDU_HAROOF.length },
                    { id: 'maths', label: '🔢 Maths & Numbers', count: MATHS_ITEMS.length + SHAPES_DATA.length },
                    { id: 'islamic_gk', label: '🕌 Islamic & GK', count: ISLAMIC_GK_DATA.length },
                    { id: 'batch_workbooks', label: '📚 Batch Workbooks (Multi-Page PDF)' },
                    { id: 'cliparts', label: '🎨 Transparent Cliparts', count: CLIPARTS_DATA.length }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveCategory(tab.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1.25rem',
                            border: 'none',
                            background: 'transparent',
                            color: activeCategory === tab.id ? '#0284c7' : '#64748b',
                            fontWeight: activeCategory === tab.id ? '800' : '600',
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            borderBottom: activeCategory === tab.id ? '3px solid #0284c7' : '3px solid transparent',
                            marginBottom: '-2px',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <span>{tab.label}</span>
                        {tab.count !== undefined && (
                            <span style={{
                                background: activeCategory === tab.id ? '#e0f2fe' : '#f1f5f9',
                                color: activeCategory === tab.id ? '#0369a1' : '#64748b',
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '6px',
                                fontWeight: '700'
                            }}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Filter & Search Bar (For Activities) */}
            {activeCategory !== 'batch_workbooks' && activeCategory !== 'cliparts' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', width: '260px' }}>
                            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Search letter, word, or topic..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {['All', 'Playgroup', 'Nursery', 'KG / Prep'].map(lvl => (
                                <button
                                    key={lvl}
                                    onClick={() => setSelectedLevelFilter(lvl)}
                                    style={{
                                        padding: '0.45rem 0.75rem',
                                        borderRadius: '8px',
                                        border: '1px solid',
                                        borderColor: selectedLevelFilter === lvl ? '#0284c7' : '#cbd5e1',
                                        background: selectedLevelFilter === lvl ? '#f0f9ff' : '#ffffff',
                                        color: selectedLevelFilter === lvl ? '#0284c7' : '#475569',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Showing ready-to-print Montessori activities with <strong>4-line guides & Nastaliq grid</strong>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 1: ENGLISH WORKSHEETS */}
            {/* ========================================================================= */}
            {activeCategory === 'english' && (
                <div>
                    {/* 1. Pre-Writing Motor Lines Section */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            ✍️ Pre-Writing Fine Motor Line Patterns (Pencil Grip & Control)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                            {PRE_WRITING_PATTERNS
                                .filter(p => selectedLevelFilter === 'All' || p.level === selectedLevelFilter)
                                .map(pat => (
                                    <div
                                        key={pat.id}
                                        className="card hover-lift"
                                        style={{
                                            padding: '1.1rem',
                                            borderRadius: '12px',
                                            border: '1px solid #e2e8f0',
                                            background: '#ffffff',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '1.75rem', background: '#f0fdf4', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                                                    {pat.icon}
                                                </span>
                                                <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>
                                                    {pat.level}
                                                </span>
                                            </div>
                                            <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.25rem 0' }}>{pat.title}</h4>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>{pat.subtitle}</p>
                                        </div>

                                        <button
                                            onClick={() => setActiveWorksheet({ type: 'pre_writing', data: pat, title: pat.title })}
                                            className="btn hover-lift"
                                            style={{
                                                marginTop: '1rem',
                                                background: '#0284c7',
                                                color: 'white',
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                fontSize: '0.8rem',
                                                fontWeight: '700',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <Eye size={14} /> Open & Print A4 Sheet
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* 2. Alphabet Tracing A to Z */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            🔤 Alphabet A to Z Handwriting & Phonics Tracing Sheets
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                            {ENGLISH_ALPHABETS
                                .filter(a => {
                                    const matchSearch = a.letter.toLowerCase().includes(searchQuery.toLowerCase()) || a.word.toLowerCase().includes(searchQuery.toLowerCase());
                                    const matchLevel = selectedLevelFilter === 'All' || a.level === selectedLevelFilter;
                                    return matchSearch && matchLevel;
                                })
                                .map(item => (
                                    <div
                                        key={item.letter}
                                        className="card hover-lift"
                                        style={{
                                            padding: '1.1rem',
                                            borderRadius: '12px',
                                            border: '1px solid #e2e8f0',
                                            background: '#ffffff',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', background: '#0f172a', color: 'white', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                                Letter {item.letter}
                                            </span>
                                            <span style={{ fontSize: '1.4rem' }}>{item.emoji}</span>
                                        </div>

                                        <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0284c7', margin: '0.2rem 0' }}>
                                            {item.letter} <span style={{ fontSize: '1.8rem', color: '#64748b' }}>{item.small}</span>
                                        </div>

                                        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>
                                            {item.word}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.85rem' }}>
                                            {item.phonics}
                                        </div>

                                        <button
                                            onClick={() => setActiveWorksheet({ type: 'english_alphabet', data: item, title: `Letter ${item.letter} (${item.word})` })}
                                            className="btn"
                                            style={{
                                                width: '100%',
                                                background: '#0f172a',
                                                color: 'white',
                                                padding: '0.45rem',
                                                borderRadius: '8px',
                                                fontSize: '0.78rem',
                                                fontWeight: '700',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <Printer size={13} /> Customize & Print
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* 3. 3-Letter CVC Phonics Words */}
                    <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            📖 3-Letter CVC Phonics Word Blends (Nursery / KG)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                            {CVC_PHONICS_WORDS.map(cvc => (
                                <div
                                    key={cvc.id}
                                    className="card hover-lift"
                                    style={{
                                        padding: '1.1rem',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0',
                                        background: '#ffffff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '1.6rem' }}>{cvc.emoji}</span>
                                            <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#4f46e5', letterSpacing: '0.15em' }}>
                                                {cvc.word}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '0.78rem', color: '#475569', fontStyle: 'italic', margin: 0 }}>
                                            "{cvc.sentence}"
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => setActiveWorksheet({ type: 'cvc_words', data: cvc, title: `CVC Word ${cvc.word}` })}
                                        className="btn hover-lift"
                                        style={{
                                            marginTop: '0.85rem',
                                            background: '#4f46e5',
                                            color: 'white',
                                            padding: '0.5rem',
                                            borderRadius: '8px',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <Eye size={14} /> Open CVC Sheet
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: URDU HAROOF WORKSHEETS */}
            {/* ========================================================================= */}
            {activeCategory === 'urdu' && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem' }}>
                        {URDU_HAROOF
                            .filter(u => {
                                const matchSearch = u.harf.includes(searchQuery) || u.word.includes(searchQuery) || u.translit.toLowerCase().includes(searchQuery.toLowerCase());
                                const matchLevel = selectedLevelFilter === 'All' || u.level === selectedLevelFilter;
                                return matchSearch && matchLevel;
                            })
                            .map(item => (
                                <div
                                    key={item.harf}
                                    className="card hover-lift"
                                    style={{
                                        padding: '1.1rem',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0',
                                        background: '#ffffff',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#059669', color: 'white', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                            {item.name}
                                        </span>
                                        <span style={{ fontSize: '1.4rem' }}>{item.emoji}</span>
                                    </div>

                                    <div style={{ fontSize: '3rem', fontWeight: '900', color: '#059669', margin: '0.2rem 0' }}>
                                        {item.harf}
                                    </div>

                                    <div style={{ fontSize: '1rem', fontWeight: '900', color: '#0f172a' }}>
                                        {item.word}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.85rem' }}>
                                        {item.translit} • آدھی شکل: <strong>{item.aadhi}</strong>
                                    </div>

                                    <button
                                        onClick={() => setActiveWorksheet({ type: 'urdu_harf', data: item, title: `Urdu Harf ${item.harf} (${item.word})` })}
                                        className="btn hover-lift"
                                        style={{
                                            width: '100%',
                                            background: '#059669',
                                            color: 'white',
                                            padding: '0.45rem',
                                            borderRadius: '8px',
                                            fontSize: '0.78rem',
                                            fontWeight: '700',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <Printer size={13} /> Customize & Print
                                    </button>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: MATHS & NUMBERS */}
            {/* ========================================================================= */}
            {activeCategory === 'maths' && (
                <div>
                    {/* Numbers Section */}
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        🔢 Number Tracing & Counting Box Grid Sheets
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        {MATHS_ITEMS.map(item => (
                            <div
                                key={item.num}
                                className="card hover-lift"
                                style={{
                                    padding: '1.1rem',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    background: '#ffffff',
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#d97706', color: 'white', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                        Number {item.num}
                                    </span>
                                    <span style={{ fontSize: '1.3rem' }}>{item.emoji}</span>
                                </div>

                                <div style={{ fontSize: '2.8rem', fontWeight: '900', color: '#d97706', margin: '0.2rem 0' }}>
                                    {item.num}
                                </div>

                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a' }}>
                                    {item.word} ({item.item})
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.85rem' }}>
                                    Count: {item.emoji.repeat(Math.min(item.count, 6))}
                                </div>

                                <button
                                    onClick={() => setActiveWorksheet({ type: 'maths_number', data: item, title: `Number ${item.num} (${item.word})` })}
                                    className="btn hover-lift"
                                    style={{
                                        width: '100%',
                                        background: '#d97706',
                                        color: 'white',
                                        padding: '0.45rem',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Printer size={13} /> Customize & Print
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Shapes Section */}
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        🔷 2D Geometric Shapes Recognition & Color Outlines
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                        {SHAPES_DATA.map(shp => (
                            <div
                                key={shp.shape}
                                className="card hover-lift"
                                style={{
                                    padding: '1.1rem',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    background: '#ffffff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <span style={{ fontSize: '1.8rem' }}>{shp.emoji}</span>
                                        <span style={{ fontSize: '0.7rem', fontWeight: '700', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                            {shp.sides}
                                        </span>
                                    </div>
                                    <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.2rem 0' }}>{shp.shape}</h4>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>{shp.desc}</p>
                                </div>

                                <button
                                    onClick={() => setActiveWorksheet({ type: 'shape_trace', data: shp, title: `Shape ${shp.shape}` })}
                                    className="btn hover-lift"
                                    style={{
                                        marginTop: '0.85rem',
                                        background: '#0f172a',
                                        color: 'white',
                                        padding: '0.5rem',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: '700',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Eye size={14} /> Open Shape Sheet
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: ISLAMIC & GK */}
            {/* ========================================================================= */}
            {activeCategory === 'islamic_gk' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                    {ISLAMIC_GK_DATA.map(item => (
                        <div
                            key={item.id}
                            className="card hover-lift"
                            style={{
                                padding: '1.25rem',
                                borderRadius: '14px',
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between'
                            }}
                        >
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: '800',
                                        background: item.category === 'Islamic Studies' ? '#ecfdf5' : '#f0f9ff',
                                        color: item.category === 'Islamic Studies' ? '#065f46' : '#0369a1',
                                        padding: '0.2rem 0.6rem',
                                        borderRadius: '6px'
                                    }}>
                                        {item.category}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.level}</span>
                                </div>

                                <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                                    {item.title}
                                </h4>

                                {item.arabic && (
                                    <div style={{
                                        background: '#f8fafc',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                        fontSize: '1.15rem',
                                        fontWeight: 'bold',
                                        color: '#065f46',
                                        marginBottom: '0.5rem'
                                    }}>
                                        {item.arabic}
                                    </div>
                                )}

                                {item.translation && (
                                    <p style={{ fontSize: '0.75rem', color: '#475569', margin: 0, fontStyle: 'italic' }}>
                                        "{item.translation}"
                                    </p>
                                )}

                                {item.items && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
                                        {item.items.map((sub, i) => (
                                            <div key={i} style={{ fontSize: '0.78rem', color: '#334155' }}>
                                                • <strong>{sub.name}</strong> {sub.desc || sub.type}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setActiveWorksheet({ type: 'islamic_gk', data: item, title: item.title })}
                                className="btn hover-lift"
                                style={{
                                    marginTop: '1rem',
                                    background: item.category === 'Islamic Studies' ? '#059669' : '#0284c7',
                                    color: 'white',
                                    padding: '0.55rem',
                                    borderRadius: '8px',
                                    fontSize: '0.82rem',
                                    fontWeight: '700',
                                    justifyContent: 'center'
                                }}
                            >
                                <Printer size={14} /> Customize & Print
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 5: BATCH WORKBOOKS (MULTI-PAGE PDF) */}
            {/* ========================================================================= */}
            {activeCategory === 'batch_workbooks' && (
                <div>
                    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.25rem 0' }}>
                            📚 1-Click Multi-Page Complete Workbooks Compiler
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                            Generate an entire academic curriculum workbook compiled into a single clean PDF file complete with an <strong>Official Custom School Title Cover Page</strong> and student record details.
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
                        {/* 1. English A-Z Workbook */}
                        <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: '2px solid #0284c7', background: '#ffffff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                                <span style={{ fontSize: '2rem' }}>🔤</span>
                                <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', fontWeight: '800', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                                    26 + 1 Pages
                                </span>
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                                Complete English Alphabet Tracing Workbook
                            </h3>
                            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
                                Contains full A to Z capital & small handwriting practice sheets with 4-line standard guidelines, phonics starting sounds, and custom school cover.
                            </p>
                            <button
                                disabled={isGeneratingBatch}
                                onClick={() => handleGenerateBatchWorkbook('english_a_z')}
                                className="btn hover-lift"
                                style={{
                                    width: '100%',
                                    background: '#0284c7',
                                    color: 'white',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    fontSize: '0.88rem',
                                    fontWeight: '800',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                                }}
                            >
                                <Download size={16} /> {isGeneratingBatch ? 'Compiling PDF...' : 'Download 27-Page English Book (PDF)'}
                            </button>
                        </div>

                        {/* 2. Urdu Haroof Workbook */}
                        <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: '2px solid #059669', background: '#ffffff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                                <span style={{ fontSize: '2rem' }}>🌙</span>
                                <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: '800', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                                    36 + 1 Pages
                                </span>
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                                مکمل اردو حروفِ تہجی خوشخطی ورک بُک
                            </h3>
                            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
                                الف تا ے مکمل اردو ٹریسنگ شیٹس بمعہ تصویر پہچان، آدھی اشکال، اور سکول ٹائٹل کور پیج۔
                            </p>
                            <button
                                disabled={isGeneratingBatch}
                                onClick={() => handleGenerateBatchWorkbook('urdu_haroof')}
                                className="btn hover-lift"
                                style={{
                                    width: '100%',
                                    background: '#059669',
                                    color: 'white',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    fontSize: '0.88rem',
                                    fontWeight: '800',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                                }}
                            >
                                <Download size={16} /> {isGeneratingBatch ? 'Compiling PDF...' : 'Download 37-Page Urdu Book (PDF)'}
                            </button>
                        </div>

                        {/* 3. Maths Numbers Workbook */}
                        <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: '2px solid #d97706', background: '#ffffff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                                <span style={{ fontSize: '2rem' }}>🔢</span>
                                <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '0.75rem', fontWeight: '800', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                                    20 + 1 Pages
                                </span>
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                                Fun Numbers & Counting Practice Book
                            </h3>
                            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
                                Numbers 1 to 20 guided square box grids with count-and-color object illustrations and custom cover.
                            </p>
                            <button
                                disabled={isGeneratingBatch}
                                onClick={() => handleGenerateBatchWorkbook('maths_numbers')}
                                className="btn hover-lift"
                                style={{
                                    width: '100%',
                                    background: '#d97706',
                                    color: 'white',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    fontSize: '0.88rem',
                                    fontWeight: '800',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)'
                                }}
                            >
                                <Download size={16} /> {isGeneratingBatch ? 'Compiling PDF...' : 'Download 21-Page Maths Book (PDF)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 6: TRANSPARENT CLIPARTS */}
            {/* ========================================================================= */}
            {activeCategory === 'cliparts' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {['All', 'Animals', 'Fruits & Food', 'Vehicles', 'School Items', 'Reward Badges'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setClipartCategoryFilter(cat)}
                                    style={{
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '8px',
                                        border: '1px solid',
                                        borderColor: clipartCategoryFilter === cat ? '#0284c7' : '#cbd5e1',
                                        background: clipartCategoryFilter === cat ? '#0284c7' : '#ffffff',
                                        color: clipartCategoryFilter === cat ? '#ffffff' : '#475569',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            Click any asset to <strong>Copy Emoji/Clipart</strong> for exam papers or chart designs.
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                        {CLIPARTS_DATA
                            .filter(c => clipartCategoryFilter === 'All' || c.category === clipartCategoryFilter)
                            .map(clip => (
                                <div
                                    key={clip.id}
                                    className="card hover-lift"
                                    style={{
                                        padding: '1.25rem',
                                        borderRadius: '14px',
                                        border: '1px solid #e2e8f0',
                                        background: '#ffffff',
                                        textAlign: 'center',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{
                                        fontSize: '3.5rem',
                                        margin: '0.5rem 0',
                                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))'
                                    }}>
                                        {clip.emoji}
                                    </div>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.2rem 0' }}>
                                        {clip.name}
                                    </h4>
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', marginBottom: '0.75rem' }}>
                                        {clip.category}
                                    </span>

                                    <button
                                        onClick={() => handleCopyClipart(clip)}
                                        className="btn hover-lift"
                                        style={{
                                            width: '100%',
                                            background: copiedClipartId === clip.id ? '#10b981' : '#f1f5f9',
                                            color: copiedClipartId === clip.id ? 'white' : '#334155',
                                            padding: '0.4rem',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            justifyContent: 'center',
                                            border: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {copiedClipartId === clip.id ? (
                                            <>
                                                <Check size={13} /> Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={13} /> Copy Clipart
                                            </>
                                        )}
                                    </button>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* LIVE A4 WORKSHEET PRINT / PDF PREVIEW MODAL */}
            {/* ========================================================================= */}
            {activeWorksheet && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '860px',
                        maxHeight: '94vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc'
                        }}>
                            <div>
                                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    📄 {activeWorksheet.title} (A4 Live Print Preview)
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    Auto-branded with {schoolInfo.name} header and student record blocks
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button
                                    onClick={handlePrintWorksheet}
                                    className="btn hover-lift"
                                    style={{ background: '#0284c7', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700' }}
                                >
                                    <Printer size={15} /> Print Sheet
                                </button>
                                <button
                                    onClick={handleDownloadSinglePDF}
                                    className="btn hover-lift"
                                    style={{ background: '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700' }}
                                >
                                    <Download size={15} /> Download PDF
                                </button>
                                <button
                                    onClick={() => setActiveWorksheet(null)}
                                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Printable A4 Canvas Container */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', background: '#e2e8f0', display: 'flex', justifyContent: 'center' }}>
                            {/* A4 Sheet Container (Standard 210mm x 297mm proportion) */}
                            <div
                                ref={sheetPrintRef}
                                id="printable-a4-sheet"
                                style={{
                                    width: '100%',
                                    maxWidth: '680px',
                                    minHeight: '880px',
                                    background: '#ffffff',
                                    padding: '2rem',
                                    borderRadius: '4px',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    fontFamily: 'system-ui, -apple-system, sans-serif'
                                }}
                            >
                                {/* Sheet Top Header */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.35rem', fontWeight: '900', color: '#0f172a', margin: '0 0 0.2rem 0', letterSpacing: '-0.01em' }}>
                                                {schoolInfo.name.toUpperCase()}
                                            </h2>
                                            <p style={{ fontSize: '0.75rem', color: '#475569', margin: 0 }}>
                                                {schoolInfo.address} {schoolInfo.phone && `• Ph: ${schoolInfo.phone}`}
                                            </p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', background: '#0f172a', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                                                PRE-SCHOOL WORKSHEET
                                            </span>
                                        </div>
                                    </div>

                                    {/* Student Info Bar */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem', background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1.25rem', fontSize: '0.78rem' }}>
                                        <div><strong>Student Name:</strong> _______________</div>
                                        <div><strong>Roll #:</strong> _______</div>
                                        <div><strong>Class:</strong> _________</div>
                                        <div><strong>Date:</strong> __________</div>
                                    </div>

                                    {/* Work Sheet Body Rendering */}
                                    {activeWorksheet.type === 'english_alphabet' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f9ff', padding: '0.85rem 1.25rem', borderRadius: '8px', border: '1.5px solid #bae6fd', marginBottom: '1.25rem' }}>
                                                <div>
                                                    <span style={{ fontSize: '3rem', fontWeight: '900', color: '#0284c7', marginRight: '0.6rem' }}>
                                                        {activeWorksheet.data.letter}
                                                    </span>
                                                    <span style={{ fontSize: '2.4rem', fontWeight: '900', color: '#64748b' }}>
                                                        {activeWorksheet.data.small}
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0f172a' }}>
                                                        {activeWorksheet.data.letter} is for {activeWorksheet.data.word} {activeWorksheet.data.emoji}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                        {activeWorksheet.data.phonics}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 4-Line Guidelines Tracks */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                                {[1, 2, 3, 4, 5].map(line => (
                                                    <div key={line} style={{ position: 'relative', height: '48px' }}>
                                                        {/* Top Red */}
                                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: '#ef4444' }} />
                                                        {/* Blue 1 */}
                                                        <div style={{ position: 'absolute', top: '16px', left: 0, right: 0, height: '1px', background: '#3b82f6' }} />
                                                        {/* Blue 2 */}
                                                        <div style={{ position: 'absolute', top: '32px', left: 0, right: 0, height: '1px', background: '#3b82f6' }} />
                                                        {/* Bottom Red */}
                                                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1.5px', background: '#ef4444' }} />

                                                        {/* Dotted Letters */}
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: '4px',
                                                            left: '10px',
                                                            fontSize: '1.8rem',
                                                            fontWeight: 'bold',
                                                            letterSpacing: '2.5rem',
                                                            color: line === 1 ? '#0f172a' : '#cbd5e1',
                                                            fontFamily: 'monospace'
                                                        }}>
                                                            {activeWorksheet.data.letter} {activeWorksheet.data.small} {activeWorksheet.data.letter} {activeWorksheet.data.small} {activeWorksheet.data.letter} {activeWorksheet.data.small} {activeWorksheet.data.letter} {activeWorksheet.data.small}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeWorksheet.type === 'urdu_harf' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5', padding: '0.85rem 1.25rem', borderRadius: '8px', border: '1.5px solid #a7f3d0', marginBottom: '1.25rem' }}>
                                                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#065f46' }}>
                                                    {activeWorksheet.data.harf} سے {activeWorksheet.data.word} {activeWorksheet.data.emoji}
                                                </div>
                                                <div style={{ fontSize: '3.2rem', fontWeight: '900', color: '#059669' }}>
                                                    {activeWorksheet.data.harf}
                                                </div>
                                            </div>

                                            {/* Urdu Grid Lines */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                {[1, 2, 3, 4, 5, 6].map(line => (
                                                    <div key={line} style={{ borderBottom: '2px solid #cbd5e1', height: '45px', position: 'relative' }}>
                                                        <div style={{
                                                            position: 'absolute',
                                                            right: '15px',
                                                            bottom: '2px',
                                                            fontSize: '2.4rem',
                                                            fontWeight: 'bold',
                                                            letterSpacing: '3rem',
                                                            color: line === 1 ? '#0f172a' : '#cbd5e1'
                                                        }}>
                                                            {activeWorksheet.data.harf} {activeWorksheet.data.harf} {activeWorksheet.data.harf} {activeWorksheet.data.harf}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeWorksheet.type === 'maths_number' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef3c7', padding: '0.85rem 1.25rem', borderRadius: '8px', border: '1.5px solid #fde68a', marginBottom: '1.25rem' }}>
                                                <span style={{ fontSize: '3.2rem', fontWeight: '900', color: '#d97706' }}>
                                                    {activeWorksheet.data.num}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0f172a' }}>
                                                        Number: {activeWorksheet.data.word}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                        Count & Color: {activeWorksheet.data.emoji.repeat(Math.min(activeWorksheet.data.count, 8))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Maths Box Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                                                {Array.from({ length: 30 }).map((_, idx) => (
                                                    <div
                                                        key={idx}
                                                        style={{
                                                            height: '60px',
                                                            border: '1.5px solid #cbd5e1',
                                                            borderRadius: '6px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '1.8rem',
                                                            fontWeight: 'bold',
                                                            color: idx < 6 ? '#0f172a' : '#cbd5e1'
                                                        }}
                                                    >
                                                        {activeWorksheet.data.num}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeWorksheet.type === 'pre_writing' && (
                                        <div>
                                            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem', textAlign: 'center' }}>
                                                <h4 style={{ margin: '0 0 0.2rem 0', color: '#0f172a' }}>{activeWorksheet.data.title}</h4>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Trace the dotted lines from starting dots carefully.</p>
                                            </div>

                                            {/* Tracing Stroke Paths */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1rem 0' }}>
                                                {[1, 2, 3, 4, 5].map(st => (
                                                    <div key={st} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed #94a3b8', paddingBottom: '0.5rem' }}>
                                                        <span style={{ fontSize: '1.2rem' }}>🟢</span>
                                                        <span style={{ fontSize: '1.2rem', color: '#94a3b8', letterSpacing: '0.5rem' }}>- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>
                                                        <span style={{ fontSize: '1.2rem' }}>⭐</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeWorksheet.type === 'cvc_words' && (
                                        <div>
                                            <div style={{ textAlign: 'center', padding: '1rem', background: '#e0e7ff', borderRadius: '8px', marginBottom: '1.25rem' }}>
                                                <span style={{ fontSize: '3rem' }}>{activeWorksheet.data.emoji}</span>
                                                <h2 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#3730a3', margin: '0.2rem 0', letterSpacing: '0.2em' }}>
                                                    {activeWorksheet.data.word}
                                                </h2>
                                                <p style={{ fontSize: '0.85rem', color: '#4338ca', fontStyle: 'italic', margin: 0 }}>
                                                    "{activeWorksheet.data.sentence}"
                                                </p>
                                            </div>

                                            {/* CVC Box Traces */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                                {activeWorksheet.data.letters.map((char, idx) => (
                                                    <div key={idx} style={{ border: '2px solid #6366f1', borderRadius: '8px', padding: '1.5rem', textAlign: 'center' }}>
                                                        <div style={{ fontSize: '3rem', fontWeight: '900', color: '#4338ca' }}>{char}</div>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Letter {idx + 1}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeWorksheet.type === 'islamic_gk' && (
                                        <div>
                                            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: '1.5rem' }}>
                                                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.5rem 0' }}>{activeWorksheet.data.title}</h3>
                                                {activeWorksheet.data.arabic && (
                                                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#065f46', marginBottom: '0.5rem' }}>
                                                        {activeWorksheet.data.arabic}
                                                    </div>
                                                )}
                                                {activeWorksheet.data.translation && (
                                                    <p style={{ fontSize: '0.85rem', color: '#475569', fontStyle: 'italic', margin: 0 }}>
                                                        "{activeWorksheet.data.translation}"
                                                    </p>
                                                )}
                                            </div>

                                            <div style={{ minHeight: '180px', border: '2px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                ✍️ Practice Writing & Coloring Area for Students
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Sheet Footer */}
                                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#64748b' }}>
                                    <div><strong>Teacher's Remark:</strong> [ Well Done / Star Student ⭐ ]</div>
                                    <div><strong>Rating:</strong> ⭐ ⭐ ⭐ ⭐ ⭐</div>
                                    <div><strong>Teacher Sign:</strong> _______________</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PreSchoolStudio;
