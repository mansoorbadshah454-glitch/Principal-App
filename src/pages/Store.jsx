import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    ShoppingBag, Search, Plus, Trash2, Edit, Printer, Download, CheckCircle,
    AlertTriangle, Filter, ArrowRight, Package, BookOpen, Shirt, FileText,
    TrendingUp, DollarSign, Users, RefreshCw, X, ChevronRight, Eye, ShieldCheck,
    CreditCard, Sparkles, Tag, Check, ArrowUpRight, BarChart3, Clock, Layers,
    MessageSquare, Phone, Share2, Wifi, WifiOff, CloudUpload, ShoppingCart,
    Minus, AlertCircle, Calendar, Hash, ArrowUpDown, ChevronDown, ChevronUp
} from 'lucide-react';
import { db } from '../firebase';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc,
    onSnapshot, query, orderBy, serverTimestamp, writeBatch, increment, arrayUnion
} from 'firebase/firestore';
import { useAuthPermissions } from '../context/AuthPermissionsContext';
import { useAlert } from '../context/AlertContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const CLASS_OPTIONS = [
    'General / All Classes', 'Playgroup', 'Nursery', 'Prep', 'KG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    '1st Year', '2nd Year'
];

export const UNIFORM_TYPES = [
    'Shirt', 'Trouser', 'Skirt', 'Blazer / Coat', 'Sweater / Jersey',
    'Tie', 'Belt', 'School Badge', 'Tracksuit / Sports Uniform', 'Socks', 'Cap / Hijab'
];

export const UNIFORM_SIZES = [
    'Size 22', 'Size 24', 'Size 26', 'Size 28', 'Size 30', 'Size 32',
    'Size 34', 'Size 36', 'Size 38', 'Size 40', 'Size 42',
    'Small (S)', 'Medium (M)', 'Large (L)', 'X-Large (XL)', 'Standard / Free Size'
];

export const STANDARD_CLASS_TEMPLATES = {
    'Playgroup': {
        title: 'Playgroup Starter Kit (Books + Uniform + Activity Stationery)',
        suggestedBundlePrice: 3800,
        items: [
            { name: 'English Alphabet & Phonics Primer', category: 'book', publisher: 'Oxford / SNC', costPrice: 320, sellingPrice: 450, stock: 30 },
            { name: 'Urdu Qaida (Hurroof-e-Tahajji)', category: 'book', publisher: 'Punjab Textbook / FDE', costPrice: 200, sellingPrice: 300, stock: 30 },
            { name: 'Fun with Math & Numbers (1-20)', category: 'book', publisher: 'Paramount / Oxford', costPrice: 280, sellingPrice: 400, stock: 30 },
            { name: 'Coloring & Creative Art Book', category: 'book', publisher: 'Gaba / Paramount', costPrice: 220, sellingPrice: 350, stock: 30 },
            { name: 'School Junior Polo Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 22', costPrice: 450, sellingPrice: 650, stock: 25 },
            { name: 'Elastic Waist Trouser / Shorts', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 22', costPrice: 400, sellingPrice: 600, stock: 25 },
            { name: 'School Badge / Monogram Crest', category: 'uniform', uniformType: 'School Badge', gender: 'Unisex', size: 'Standard / Free Size', costPrice: 50, sellingPrice: 100, stock: 50 },
            { name: 'Cotton Socks (Pack of 2)', category: 'uniform', uniformType: 'Socks', gender: 'Unisex', size: 'Size 22', costPrice: 120, sellingPrice: 200, stock: 40 },
            { name: 'Jumbo Triangle Wax Crayons (12 Colors)', category: 'stationery', publisher: 'Dux / Piano', costPrice: 160, sellingPrice: 250, stock: 35 },
            { name: '4-Line Broad English Notebook (120 Pgs)', category: 'stationery', publisher: 'Signature / Oxford', costPrice: 80, sellingPrice: 130, stock: 50 },
            { name: 'Large Math Square Box Notebook (120 Pgs)', category: 'stationery', publisher: 'Signature / Oxford', costPrice: 80, sellingPrice: 130, stock: 50 },
            { name: 'Safe Blunt Craft Scissors & Play-Doh Pack', category: 'stationery', publisher: 'Deli / KidArt', costPrice: 150, sellingPrice: 240, stock: 30 }
        ]
    },
    'Nursery': {
        title: 'Nursery Complete Session Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 4600,
        items: [
            { name: 'Early Steps English Reader (Step 1)', category: 'book', publisher: 'Oxford University Press', costPrice: 380, sellingPrice: 520, stock: 30 },
            { name: 'Nursery Urdu Qaida (Tasveeri)', category: 'book', publisher: 'PTB / SNC Edition', costPrice: 240, sellingPrice: 350, stock: 30 },
            { name: 'Math Shapes & Counting (1-50)', category: 'book', publisher: 'Paramount / Oxford', costPrice: 320, sellingPrice: 460, stock: 30 },
            { name: 'General Knowledge & Environment Reader', category: 'book', publisher: 'Afaq Sun Series', costPrice: 280, sellingPrice: 400, stock: 30 },
            { name: 'School Regular Uniform Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 24', costPrice: 500, sellingPrice: 750, stock: 25 },
            { name: 'School Trouser / Skirt', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 24', costPrice: 480, sellingPrice: 700, stock: 25 },
            { name: 'Elastic Neck Tie & Belt Set', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Small (S)', costPrice: 180, sellingPrice: 300, stock: 30 },
            { name: '12-Color Pencil Set (Full Length)', category: 'stationery', publisher: 'Piano / Dollar', costPrice: 140, sellingPrice: 220, stock: 40 },
            { name: 'Triangular Grip Pencil Pack + Erasers', category: 'stationery', publisher: 'Deer / Dux', costPrice: 120, sellingPrice: 180, stock: 45 },
            { name: '4-Line English Exercise Book (2 Nos)', category: 'stationery', publisher: 'Crown / Signature', costPrice: 150, sellingPrice: 240, stock: 50 },
            { name: 'Urdu Broad-Line Exercise Book (2 Nos)', category: 'stationery', publisher: 'Crown / Signature', costPrice: 150, sellingPrice: 240, stock: 50 },
            { name: 'Math Box Exercise Book (2 Nos)', category: 'stationery', publisher: 'Crown / Signature', costPrice: 150, sellingPrice: 240, stock: 50 }
        ]
    },
    'Prep': {
        title: 'Prep / KG Complete Academic Package',
        suggestedBundlePrice: 5400,
        items: [
            { name: 'Radiant Way English Book 1', category: 'book', publisher: 'Allied / Oxford', costPrice: 420, sellingPrice: 600, stock: 35 },
            { name: 'Urdu Guldasta (Prep Edition)', category: 'book', publisher: 'Oxford / Ferozsons', costPrice: 350, sellingPrice: 500, stock: 35 },
            { name: 'Mathematics for Young Learners (1-100)', category: 'book', publisher: 'SNC / PTB', costPrice: 320, sellingPrice: 480, stock: 35 },
            { name: 'Islamic Studies & Moral Values Book', category: 'book', publisher: 'Afaq / SNC', costPrice: 260, sellingPrice: 380, stock: 35 },
            { name: 'General Science & Living Things Primer', category: 'book', publisher: 'Paramount', costPrice: 300, sellingPrice: 440, stock: 35 },
            { name: 'School Uniform Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 26', costPrice: 550, sellingPrice: 800, stock: 30 },
            { name: 'School Uniform Formal Trouser', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 26', costPrice: 520, sellingPrice: 750, stock: 30 },
            { name: 'School Winter V-Neck Sweater', category: 'uniform', uniformType: 'Sweater / Jersey', gender: 'Unisex', size: 'Size 26', costPrice: 700, sellingPrice: 1050, stock: 20 },
            { name: 'School Tie & Buckle Belt', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Medium (M)', costPrice: 200, sellingPrice: 350, stock: 30 },
            { name: 'Standard Lead Pencils Box (12 Pcs)', category: 'stationery', publisher: 'Goldfish / Piano', costPrice: 160, sellingPrice: 250, stock: 40 },
            { name: '24-Color Colored Pencils Pack', category: 'stationery', publisher: 'Faber-Castell / Piano', costPrice: 250, sellingPrice: 380, stock: 30 },
            { name: 'Complete 6-Subject Notebook Set (Covered)', category: 'stationery', publisher: 'Classmate / Oxford', costPrice: 480, sellingPrice: 720, stock: 35 }
        ]
    },
    'KG': {
        title: 'KG Complete Academic Package (Books + Uniform + Stationery)',
        suggestedBundlePrice: 5400,
        items: [
            { name: 'Radiant Way English Book 1', category: 'book', publisher: 'Allied / Oxford', costPrice: 420, sellingPrice: 600, stock: 35 },
            { name: 'Urdu Guldasta (KG Edition)', category: 'book', publisher: 'Oxford / Ferozsons', costPrice: 350, sellingPrice: 500, stock: 35 },
            { name: 'Mathematics for Young Learners (1-100)', category: 'book', publisher: 'SNC / PTB', costPrice: 320, sellingPrice: 480, stock: 35 },
            { name: 'Islamic Studies & Moral Values Book', category: 'book', publisher: 'Afaq / SNC', costPrice: 260, sellingPrice: 380, stock: 35 },
            { name: 'General Science & Living Things Primer', category: 'book', publisher: 'Paramount', costPrice: 300, sellingPrice: 440, stock: 35 },
            { name: 'School Uniform Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 26', costPrice: 550, sellingPrice: 800, stock: 30 },
            { name: 'School Uniform Formal Trouser', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 26', costPrice: 520, sellingPrice: 750, stock: 30 },
            { name: 'School Winter V-Neck Sweater', category: 'uniform', uniformType: 'Sweater / Jersey', gender: 'Unisex', size: 'Size 26', costPrice: 700, sellingPrice: 1050, stock: 20 },
            { name: 'School Tie & Buckle Belt', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Medium (M)', costPrice: 200, sellingPrice: 350, stock: 30 },
            { name: 'Standard Lead Pencils Box (12 Pcs)', category: 'stationery', publisher: 'Goldfish / Piano', costPrice: 160, sellingPrice: 250, stock: 40 },
            { name: '24-Color Colored Pencils Pack', category: 'stationery', publisher: 'Faber-Castell / Piano', costPrice: 250, sellingPrice: 380, stock: 30 },
            { name: 'Complete 6-Subject Notebook Set (Covered)', category: 'stationery', publisher: 'Classmate / Oxford', costPrice: 480, sellingPrice: 720, stock: 35 }
        ]
    },
    'Class 1': {
        title: 'Class 1 Complete Session Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 6200,
        items: [
            { name: 'English Progressive Reader Book 1', category: 'book', publisher: 'Oxford University Press', costPrice: 480, sellingPrice: 680, stock: 40 },
            { name: 'Urdu Ki Pehli Kitab (SNC)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 220, sellingPrice: 320, stock: 40 },
            { name: 'Primary Mathematics Book 1', category: 'book', publisher: 'SNC Edition', costPrice: 280, sellingPrice: 420, stock: 40 },
            { name: 'General Knowledge & Science Grade 1', category: 'book', publisher: 'PTB / SNC', costPrice: 240, sellingPrice: 350, stock: 40 },
            { name: 'Islamiat Lazmi & Quran Qaida Grade 1', category: 'book', publisher: 'PTB / FDE', costPrice: 200, sellingPrice: 300, stock: 40 },
            { name: 'Computer Whiz Primer Book 1', category: 'book', publisher: 'Oxford / Paramount', costPrice: 350, sellingPrice: 500, stock: 35 },
            { name: 'School Formal Shirt (Full/Half)', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 28', costPrice: 600, sellingPrice: 850, stock: 30 },
            { name: 'School Formal Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 28', costPrice: 580, sellingPrice: 800, stock: 30 },
            { name: 'School Crest Tie & Leather Belt Set', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Size 28', costPrice: 240, sellingPrice: 400, stock: 35 },
            { name: 'School Blazer / Warm Coat', category: 'uniform', uniformType: 'Blazer / Coat', gender: 'Unisex', size: 'Size 28', costPrice: 1400, sellingPrice: 2100, stock: 15 },
            { name: 'Complete 8-Subject Notebook Pack (Soft Bound)', category: 'stationery', publisher: 'Oxford / Crown', costPrice: 600, sellingPrice: 900, stock: 40 },
            { name: 'Geometry Box & Transparent Ruler 12-inch', category: 'stationery', publisher: 'Dux / Piano', costPrice: 180, sellingPrice: 280, stock: 40 },
            { name: 'Stationery Writing Pack (Pencils, Erasers, Sharpeners)', category: 'stationery', publisher: 'Piano / Dollar', costPrice: 160, sellingPrice: 250, stock: 45 }
        ]
    },
    'Class 2': {
        title: 'Class 2 Complete Session Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 6500,
        items: [
            { name: 'English Progressive Reader Book 2', category: 'book', publisher: 'Oxford University Press', costPrice: 500, sellingPrice: 700, stock: 40 },
            { name: 'Urdu Ki Doosri Kitab (SNC)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 240, sellingPrice: 350, stock: 40 },
            { name: 'Primary Mathematics Book 2', category: 'book', publisher: 'SNC Edition', costPrice: 300, sellingPrice: 450, stock: 40 },
            { name: 'General Science Grade 2', category: 'book', publisher: 'PTB / SNC', costPrice: 260, sellingPrice: 380, stock: 40 },
            { name: 'Islamiat & Tarjuma-tul-Quran Grade 2', category: 'book', publisher: 'PTB / FDE', costPrice: 220, sellingPrice: 320, stock: 40 },
            { name: 'Computer IT Book 2', category: 'book', publisher: 'Oxford / Paramount', costPrice: 380, sellingPrice: 540, stock: 35 },
            { name: 'School Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 30', costPrice: 620, sellingPrice: 900, stock: 30 },
            { name: 'School Formal Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 30', costPrice: 600, sellingPrice: 850, stock: 30 },
            { name: 'School Crest Tie & Leather Belt', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Size 30', costPrice: 240, sellingPrice: 400, stock: 35 },
            { name: '8-Subject Notebook Bundle (Plastic Coated)', category: 'stationery', publisher: 'Signature / Oxford', costPrice: 650, sellingPrice: 980, stock: 40 },
            { name: 'Math Square & 4-Line Notebooks Set', category: 'stationery', publisher: 'Crown', costPrice: 250, sellingPrice: 380, stock: 40 },
            { name: 'Writing & Drawing Pencils Kit', category: 'stationery', publisher: 'Piano / Dollar', costPrice: 200, sellingPrice: 300, stock: 40 }
        ]
    },
    'Class 3': {
        title: 'Class 3 Complete Academic Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 6900,
        items: [
            { name: 'English Progressive Reader Book 3', category: 'book', publisher: 'Oxford University Press', costPrice: 520, sellingPrice: 740, stock: 40 },
            { name: 'Urdu Ki Teesri Kitab (SNC)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 260, sellingPrice: 380, stock: 40 },
            { name: 'Primary Mathematics Book 3', category: 'book', publisher: 'SNC Edition', costPrice: 320, sellingPrice: 480, stock: 40 },
            { name: 'General Science Grade 3', category: 'book', publisher: 'PTB / SNC', costPrice: 280, sellingPrice: 420, stock: 40 },
            { name: 'Social Studies (Muashrati Uloom) Grade 3', category: 'book', publisher: 'PTB / SNC', costPrice: 260, sellingPrice: 380, stock: 40 },
            { name: 'Islamiat Lazmi & Nazra Quran Grade 3', category: 'book', publisher: 'PTB', costPrice: 220, sellingPrice: 340, stock: 40 },
            { name: 'Keyboard Computer Science Book 3', category: 'book', publisher: 'Oxford', costPrice: 400, sellingPrice: 580, stock: 35 },
            { name: 'School Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 30', costPrice: 650, sellingPrice: 950, stock: 30 },
            { name: 'School Formal Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 30', costPrice: 620, sellingPrice: 900, stock: 30 },
            { name: 'School Tie, Belt & Monogram Badge', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Size 30', costPrice: 280, sellingPrice: 450, stock: 35 },
            { name: 'Standard 8-Subject Notebooks (Hardbound)', category: 'stationery', publisher: 'Oxford', costPrice: 720, sellingPrice: 1100, stock: 40 },
            { name: 'Blue Gel Pens Pack & Geometry Box', category: 'stationery', publisher: 'Piano / Dollar', costPrice: 280, sellingPrice: 420, stock: 40 }
        ]
    },
    'Class 4': {
        title: 'Class 4 Complete Academic Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 7200,
        items: [
            { name: 'English Progressive Reader Book 4', category: 'book', publisher: 'Oxford University Press', costPrice: 550, sellingPrice: 780, stock: 40 },
            { name: 'Urdu Ki Chothi Kitab (SNC)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 280, sellingPrice: 400, stock: 40 },
            { name: 'Primary Mathematics Book 4', category: 'book', publisher: 'SNC Edition', costPrice: 350, sellingPrice: 500, stock: 40 },
            { name: 'General Science Grade 4', category: 'book', publisher: 'PTB / SNC', costPrice: 300, sellingPrice: 450, stock: 40 },
            { name: 'Social Studies Grade 4', category: 'book', publisher: 'PTB / SNC', costPrice: 280, sellingPrice: 420, stock: 40 },
            { name: 'Islamiat & Tarjuma-tul-Quran Grade 4', category: 'book', publisher: 'PTB', costPrice: 240, sellingPrice: 360, stock: 40 },
            { name: 'Keyboard Computer Science Book 4', category: 'book', publisher: 'Oxford', costPrice: 420, sellingPrice: 600, stock: 35 },
            { name: 'School Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 32', costPrice: 680, sellingPrice: 1000, stock: 30 },
            { name: 'School Formal Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 32', costPrice: 650, sellingPrice: 950, stock: 30 },
            { name: 'School Winter Sweater / Jersey', category: 'uniform', uniformType: 'Sweater / Jersey', gender: 'Unisex', size: 'Size 32', costPrice: 850, sellingPrice: 1300, stock: 20 },
            { name: '10-Subject Register & Notebook Bundle', category: 'stationery', publisher: 'Signature / Oxford', costPrice: 850, sellingPrice: 1300, stock: 40 },
            { name: 'Complete Mathematical Geometry Box & Pens Pack', category: 'stationery', publisher: 'Dux / Dollar', costPrice: 320, sellingPrice: 480, stock: 40 }
        ]
    },
    'Class 5': {
        title: 'Class 5 Primary Graduation Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 7600,
        items: [
            { name: 'English Progressive Reader Book 5', category: 'book', publisher: 'Oxford University Press', costPrice: 580, sellingPrice: 820, stock: 40 },
            { name: 'Urdu Ki Panchveen Kitab (SNC)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 300, sellingPrice: 440, stock: 40 },
            { name: 'Mathematics Book 5', category: 'book', publisher: 'SNC Edition', costPrice: 380, sellingPrice: 550, stock: 40 },
            { name: 'General Science Grade 5', category: 'book', publisher: 'PTB / SNC', costPrice: 340, sellingPrice: 500, stock: 40 },
            { name: 'Social Studies & Geography Grade 5', category: 'book', publisher: 'PTB / SNC', costPrice: 300, sellingPrice: 450, stock: 40 },
            { name: 'Islamiat Lazmi Grade 5', category: 'book', publisher: 'PTB', costPrice: 260, sellingPrice: 380, stock: 40 },
            { name: 'Computer IT Book 5', category: 'book', publisher: 'Oxford / Paramount', costPrice: 450, sellingPrice: 650, stock: 35 },
            { name: 'School Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 32', costPrice: 700, sellingPrice: 1050, stock: 30 },
            { name: 'School Formal Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 32', costPrice: 680, sellingPrice: 1000, stock: 30 },
            { name: 'School Tie, Belt & Monogram Pin', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Size 32', costPrice: 300, sellingPrice: 480, stock: 35 },
            { name: 'Full Academic Registers & Notebook Set', category: 'stationery', publisher: 'Oxford / Crown', costPrice: 920, sellingPrice: 1400, stock: 40 },
            { name: 'Geometry Instruments Set + Fountain / Gel Pens Pack', category: 'stationery', publisher: 'Dollar / Piano', costPrice: 360, sellingPrice: 550, stock: 40 }
        ]
    },
    'Class 6': {
        title: 'Class 6 Middle School Complete Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 8200,
        items: [
            { name: 'English Grammar & Composition Book 6', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 320, sellingPrice: 480, stock: 40 },
            { name: 'Urdu Adab & Qawaid Grade 6', category: 'book', publisher: 'PTB / SNC', costPrice: 320, sellingPrice: 480, stock: 40 },
            { name: 'Mathematics Grade 6 (Algebra & Geometry)', category: 'book', publisher: 'PTB / SNC', costPrice: 400, sellingPrice: 600, stock: 40 },
            { name: 'General Science Grade 6 (Physics/Chem/Bio)', category: 'book', publisher: 'PTB / SNC', costPrice: 420, sellingPrice: 620, stock: 40 },
            { name: 'History & Geography Book 6', category: 'book', publisher: 'PTB', costPrice: 340, sellingPrice: 500, stock: 40 },
            { name: 'Islamiat Lazmi & Quran Tarjuma Grade 6', category: 'book', publisher: 'PTB', costPrice: 280, sellingPrice: 420, stock: 40 },
            { name: 'Computer Education Grade 6', category: 'book', publisher: 'National Book Foundation', costPrice: 360, sellingPrice: 520, stock: 35 },
            { name: 'School Senior Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 34', costPrice: 750, sellingPrice: 1100, stock: 30 },
            { name: 'School Senior Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 34', costPrice: 720, sellingPrice: 1050, stock: 30 },
            { name: 'School Senior Blazer / Coat', category: 'uniform', uniformType: 'Blazer / Coat', gender: 'Unisex', size: 'Size 34', costPrice: 1600, sellingPrice: 2400, stock: 15 },
            { name: 'Senior School Tie & Belt', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Large (L)', costPrice: 320, sellingPrice: 500, stock: 35 },
            { name: '200-Page Hardbound Registers Bundle (6 Nos)', category: 'stationery', publisher: 'Signature / Oxford', costPrice: 950, sellingPrice: 1450, stock: 40 },
            { name: 'Oxford Mathematical Geometry Box + Cut Marker Set', category: 'stationery', publisher: 'Oxford / Dollar', costPrice: 420, sellingPrice: 650, stock: 40 }
        ]
    },
    'Class 7': {
        title: 'Class 7 Middle School Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 8500,
        items: [
            { name: 'English Textbook Grade 7', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 340, sellingPrice: 500, stock: 40 },
            { name: 'Urdu Lazmi Grade 7', category: 'book', publisher: 'PTB / SNC', costPrice: 340, sellingPrice: 500, stock: 40 },
            { name: 'Mathematics Grade 7', category: 'book', publisher: 'PTB / SNC', costPrice: 420, sellingPrice: 620, stock: 40 },
            { name: 'General Science Grade 7', category: 'book', publisher: 'PTB / SNC', costPrice: 440, sellingPrice: 650, stock: 40 },
            { name: 'History & Geography Grade 7', category: 'book', publisher: 'PTB', costPrice: 360, sellingPrice: 520, stock: 40 },
            { name: 'Islamiat Lazmi Grade 7', category: 'book', publisher: 'PTB', costPrice: 290, sellingPrice: 430, stock: 40 },
            { name: 'Computer Education Grade 7', category: 'book', publisher: 'NBF', costPrice: 380, sellingPrice: 550, stock: 35 },
            { name: 'School Senior Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 36', costPrice: 780, sellingPrice: 1150, stock: 30 },
            { name: 'School Senior Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 36', costPrice: 750, sellingPrice: 1100, stock: 30 },
            { name: 'School Senior Tie & Belt', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Large (L)', costPrice: 320, sellingPrice: 500, stock: 35 },
            { name: 'Hardbound Registers Bundle (6 Nos)', category: 'stationery', publisher: 'Signature', costPrice: 980, sellingPrice: 1500, stock: 40 },
            { name: 'Oxford Geometry Instrument Set + Gel Pens Pack', category: 'stationery', publisher: 'Piano / Dollar', costPrice: 450, sellingPrice: 700, stock: 40 }
        ]
    },
    'Class 8': {
        title: 'Class 8 Board Prep Kit (Books + Uniform + Stationery)',
        suggestedBundlePrice: 8800,
        items: [
            { name: 'English Textbook Grade 8', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 360, sellingPrice: 520, stock: 40 },
            { name: 'Urdu Lazmi Grade 8', category: 'book', publisher: 'PTB / SNC', costPrice: 360, sellingPrice: 520, stock: 40 },
            { name: 'Mathematics Grade 8 (Pre-Matric Algebra)', category: 'book', publisher: 'PTB / SNC', costPrice: 450, sellingPrice: 680, stock: 40 },
            { name: 'General Science Grade 8', category: 'book', publisher: 'PTB / SNC', costPrice: 460, sellingPrice: 690, stock: 40 },
            { name: 'History & Geography Grade 8', category: 'book', publisher: 'PTB', costPrice: 380, sellingPrice: 560, stock: 40 },
            { name: 'Islamiat Lazmi Grade 8', category: 'book', publisher: 'PTB', costPrice: 300, sellingPrice: 450, stock: 40 },
            { name: 'Computer Education Grade 8', category: 'book', publisher: 'NBF', costPrice: 400, sellingPrice: 580, stock: 35 },
            { name: 'School Senior Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 36', costPrice: 800, sellingPrice: 1200, stock: 30 },
            { name: 'School Senior Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 36', costPrice: 780, sellingPrice: 1150, stock: 30 },
            { name: 'School Winter Woolen Sweater', category: 'uniform', uniformType: 'Sweater / Jersey', gender: 'Unisex', size: 'Size 36', costPrice: 950, sellingPrice: 1450, stock: 20 },
            { name: 'Registers Pack (7 Nos)', category: 'stationery', publisher: 'Crown / Oxford', costPrice: 1100, sellingPrice: 1650, stock: 40 },
            { name: 'Geometry Pro Box + 605 Cut Marker Set', category: 'stationery', publisher: 'Dollar', costPrice: 480, sellingPrice: 750, stock: 40 }
        ]
    },
    'Class 9': {
        title: 'Class 9 Matric (Science/Arts) Complete Kit',
        suggestedBundlePrice: 9800,
        items: [
            { name: 'English Compulsory Matric Book 9', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 380, sellingPrice: 550, stock: 50 },
            { name: 'Urdu Lazmi Matric Book 9', category: 'book', publisher: 'PTB', costPrice: 380, sellingPrice: 550, stock: 50 },
            { name: 'Islamiat Compulsory Grade 9', category: 'book', publisher: 'PTB', costPrice: 320, sellingPrice: 480, stock: 50 },
            { name: 'Tarjuma-tul-Quran Grade 9', category: 'book', publisher: 'PTB / Quran Board', costPrice: 280, sellingPrice: 420, stock: 50 },
            { name: 'Mathematics (Science Group) Book 9', category: 'book', publisher: 'PTB / Federal', costPrice: 480, sellingPrice: 720, stock: 50 },
            { name: 'Physics Grade 9 (Theory + Practical Book)', category: 'book', publisher: 'Caravan / PTB', costPrice: 520, sellingPrice: 780, stock: 45 },
            { name: 'Chemistry Grade 9 (Theory + Practical Book)', category: 'book', publisher: 'Caravan / PTB', costPrice: 520, sellingPrice: 780, stock: 45 },
            { name: 'Biology / Computer Science Book 9', category: 'book', publisher: 'PTB / NBF', costPrice: 500, sellingPrice: 750, stock: 45 },
            { name: 'Matric Senior Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 38', costPrice: 850, sellingPrice: 1250, stock: 30 },
            { name: 'Matric Senior Formal Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 38', costPrice: 820, sellingPrice: 1200, stock: 30 },
            { name: 'Matric Formal Blazer / Coat', category: 'uniform', uniformType: 'Blazer / Coat', gender: 'Unisex', size: 'Size 38', costPrice: 1800, sellingPrice: 2700, stock: 20 },
            { name: 'A4 Science Practical Notebooks (Physics/Chem/Bio)', category: 'stationery', publisher: 'Standard Board Editions', costPrice: 550, sellingPrice: 850, stock: 40 },
            { name: 'Heavy Duty 300-Page Registers (6 Nos)', category: 'stationery', publisher: 'Signature / Classmate', costPrice: 1200, sellingPrice: 1800, stock: 45 },
            { name: 'Scientific Calculator + Board Exam Margin Scale', category: 'stationery', publisher: 'Casio / Deli', costPrice: 650, sellingPrice: 950, stock: 30 }
        ]
    },
    'Class 10': {
        title: 'Class 10 Matric Graduation Kit (Books + Uniform + Board Exam Pack)',
        suggestedBundlePrice: 9900,
        items: [
            { name: 'English Compulsory Matric Book 10', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 390, sellingPrice: 560, stock: 50 },
            { name: 'Urdu Lazmi Matric Book 10', category: 'book', publisher: 'PTB', costPrice: 390, sellingPrice: 560, stock: 50 },
            { name: 'Pakistan Studies (Mutalia-e-Pakistan) Book 10', category: 'book', publisher: 'PTB / Federal', costPrice: 350, sellingPrice: 520, stock: 50 },
            { name: 'Tarjuma-tul-Quran Grade 10', category: 'book', publisher: 'PTB / Quran Board', costPrice: 300, sellingPrice: 450, stock: 50 },
            { name: 'Mathematics Grade 10', category: 'book', publisher: 'PTB', costPrice: 500, sellingPrice: 750, stock: 50 },
            { name: 'Physics Grade 10 (Theory + Practical Book)', category: 'book', publisher: 'Caravan / PTB', costPrice: 540, sellingPrice: 800, stock: 45 },
            { name: 'Chemistry Grade 10 (Theory + Practical Book)', category: 'book', publisher: 'Caravan / PTB', costPrice: 540, sellingPrice: 800, stock: 45 },
            { name: 'Biology / Computer Science Book 10', category: 'book', publisher: 'PTB / NBF', costPrice: 520, sellingPrice: 780, stock: 45 },
            { name: 'Matric Senior Formal Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 40', costPrice: 880, sellingPrice: 1300, stock: 30 },
            { name: 'Matric Senior Formal Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 40', costPrice: 850, sellingPrice: 1250, stock: 30 },
            { name: 'A4 Science Practical Notebooks Set (10th Board)', category: 'stationery', publisher: 'Standard Board Editions', costPrice: 580, sellingPrice: 900, stock: 40 },
            { name: 'Heavy Duty Registers (6 Nos) + Marker Pack', category: 'stationery', publisher: 'Signature / Dollar', costPrice: 1250, sellingPrice: 1850, stock: 45 }
        ]
    },
    '1st Year': {
        title: '1st Year (FSc / ICS / I.Com) Complete Session Kit',
        suggestedBundlePrice: 11200,
        items: [
            { name: 'English Book 1 (Short Stories & Poems)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 420, sellingPrice: 620, stock: 40 },
            { name: 'English Book 3 (Plays & Poems)', category: 'book', publisher: 'PTB', costPrice: 380, sellingPrice: 560, stock: 40 },
            { name: 'Urdu Lazmi (HSSC Part 1)', category: 'book', publisher: 'PTB', costPrice: 420, sellingPrice: 620, stock: 40 },
            { name: 'Islamic Education (Islamiat Ikhtiari / Lazmi)', category: 'book', publisher: 'PTB', costPrice: 350, sellingPrice: 520, stock: 40 },
            { name: 'Physics Part 1 (Scholar / Ilmi Series)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 620, sellingPrice: 920, stock: 35 },
            { name: 'Chemistry Part 1 (Theory & Practical)', category: 'book', publisher: 'PTB', costPrice: 620, sellingPrice: 920, stock: 35 },
            { name: 'Biology / Math / Computer Science Part 1', category: 'book', publisher: 'PTB / Caravan', costPrice: 650, sellingPrice: 950, stock: 35 },
            { name: 'College Uniform Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 40', costPrice: 950, sellingPrice: 1400, stock: 25 },
            { name: 'College Uniform Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 40', costPrice: 920, sellingPrice: 1350, stock: 25 },
            { name: 'College Blazer with Monogram Pocket', category: 'uniform', uniformType: 'Blazer / Coat', gender: 'Unisex', size: 'Size 40', costPrice: 2100, sellingPrice: 3100, stock: 15 },
            { name: 'University 400-Page Jumbo Registers (5 Nos)', category: 'stationery', publisher: 'Oxford University Editions', costPrice: 1400, sellingPrice: 2100, stock: 35 },
            { name: 'Scientific Calculator (FX-991EX Class) & Lab Apron', category: 'stationery', publisher: 'Casio / Deli', costPrice: 950, sellingPrice: 1450, stock: 25 }
        ]
    },
    '2nd Year': {
        title: '2nd Year (FSc / ICS / I.Com) Complete Session Kit',
        suggestedBundlePrice: 11500,
        items: [
            { name: 'English Book 2 (Modern Prose & Heroes)', category: 'book', publisher: 'Punjab Textbook Board', costPrice: 420, sellingPrice: 620, stock: 40 },
            { name: 'English Goodbye Mr. Chips Novel', category: 'book', publisher: 'PTB', costPrice: 300, sellingPrice: 450, stock: 40 },
            { name: 'Urdu Lazmi (HSSC Part 2)', category: 'book', publisher: 'PTB', costPrice: 420, sellingPrice: 620, stock: 40 },
            { name: 'Pakistan Studies (Mutalia-e-Pakistan HSSC 2)', category: 'book', publisher: 'PTB', costPrice: 360, sellingPrice: 540, stock: 40 },
            { name: 'Physics Part 2 (Theory & Practical)', category: 'book', publisher: 'PTB', costPrice: 640, sellingPrice: 950, stock: 35 },
            { name: 'Chemistry Part 2 (Theory & Practical)', category: 'book', publisher: 'PTB', costPrice: 640, sellingPrice: 950, stock: 35 },
            { name: 'Biology / Math / Computer Science Part 2', category: 'book', publisher: 'PTB / Caravan', costPrice: 660, sellingPrice: 980, stock: 35 },
            { name: 'College Uniform Shirt', category: 'uniform', uniformType: 'Shirt', gender: 'Unisex', size: 'Size 42', costPrice: 980, sellingPrice: 1450, stock: 25 },
            { name: 'College Uniform Trouser / Shalwar', category: 'uniform', uniformType: 'Trouser', gender: 'Unisex', size: 'Size 42', costPrice: 950, sellingPrice: 1400, stock: 25 },
            { name: 'College Tie & Metal Monogram Crest', category: 'uniform', uniformType: 'Tie', gender: 'Unisex', size: 'Large (L)', costPrice: 350, sellingPrice: 550, stock: 30 },
            { name: 'University Jumbo Registers (5 Nos)', category: 'stationery', publisher: 'Oxford Editions', costPrice: 1450, sellingPrice: 2200, stock: 35 },
            { name: 'Board Exam Practical Note Books & Stationers Kit', category: 'stationery', publisher: 'Standard', costPrice: 700, sellingPrice: 1050, stock: 35 }
        ]
    }
};

const Store = () => {
    const { schoolId: authSchoolId, isPrincipal, hasAccess, userProfile } = useAuthPermissions();
    const schoolId = authSchoolId || (() => {
        try {
            const raw = localStorage.getItem('manual_session');
            return raw ? JSON.parse(raw).schoolId : '';
        } catch (e) {
            return '';
        }
    })();
    const { showAlert } = useAlert();

    // -------------------------------------------------------------
    // OFFLINE ENGINE & NETWORK STATE
    // -------------------------------------------------------------
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    // Active Navigation Tab
    const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'books_stationery', 'uniform', 'bundles', 'sales'

    // Data States (Initialized from Local Storage Vault for instant 0ms mount)
    const [items, setItems] = useState(() => {
        try {
            const cached = localStorage.getItem(`store_items_cache_${schoolId}`);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });

    const [bundles, setBundles] = useState(() => {
        try {
            const cached = localStorage.getItem(`store_bundles_cache_${schoolId}`);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });

    const [sales, setSales] = useState(() => {
        try {
            const cached = localStorage.getItem(`store_sales_cache_${schoolId}`);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });

    const [classesList, setClassesList] = useState(() => {
        try {
            const cached = localStorage.getItem(`store_classes_cache_${schoolId}`);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });

    const [schoolInfo, setSchoolInfo] = useState({
        name: 'School V5 Management System',
        address: '',
        phone: '',
        logo: ''
    });

    const [loading, setLoading] = useState(items.length === 0);

    // POS & Cart State
    const [posSearch, setPosSearch] = useState('');
    const [posCategoryFilter, setPosCategoryFilter] = useState('all'); // 'all', 'book', 'uniform', 'stationery', 'bundle'
    const [posClassFilter, setPosClassFilter] = useState('All');
    const [cart, setCart] = useState([]);
    const [discount, setDiscount] = useState(0);
    const [isBundlesExpanded, setIsBundlesExpanded] = useState(false);

    // Checkout Modal State
    const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
    const [paymentMode, setPaymentMode] = useState('cash'); // 'cash', 'fee_ledger'
    const [selectedClassId, setSelectedClassId] = useState('');
    const [classStudents, setClassStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [sendWhatsAppReceipt, setSendWhatsAppReceipt] = useState(true);
    const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

    // Receipt Modal State
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [activeReceipt, setActiveReceipt] = useState(null);

    // Inventory Item Modal State (Add / Edit)
    const [itemModalOpen, setItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [itemFormData, setItemFormData] = useState({
        name: '',
        category: 'book', // 'book', 'uniform', 'stationery'
        targetClass: 'General / All Classes',
        publisher: '',
        uniformType: 'Shirt',
        gender: 'Unisex', // 'Boys', 'Girls', 'Unisex'
        size: 'Size 26',
        costPrice: 0,
        sellingPrice: 0,
        stock: 0,
        lowStockThreshold: 5,
        sku: ''
    });

    // Quick Restock Modal
    const [restockModalOpen, setRestockModalOpen] = useState(false);
    const [restockItem, setRestockItem] = useState(null);
    const [restockQuantity, setRestockQuantity] = useState(10);

    // Bundle Modal State
    const [bundleModalOpen, setBundleModalOpen] = useState(false);
    const [bundleFormData, setBundleFormData] = useState({
        title: '',
        targetClass: 'Class 1',
        bundlePrice: 0,
        selectedItemIds: []
    });

    // Class Kit Template Modal State
    const [templateModalOpen, setTemplateModalOpen] = useState(false);
    const [selectedTemplateClass, setSelectedTemplateClass] = useState('Class 1');
    const [templateFilterCategory, setTemplateFilterCategory] = useState('all'); // 'all', 'book', 'uniform', 'stationery'
    const [templateDraftItems, setTemplateDraftItems] = useState([]);
    const [templateBundleTitle, setTemplateBundleTitle] = useState('');
    const [templateBundlePrice, setTemplateBundlePrice] = useState(0);
    const [isImportingTemplate, setIsImportingTemplate] = useState(false);

    // Sales Filter State
    const [salesDateFilter, setSalesDateFilter] = useState('all'); // 'today', 'week', 'month', 'all'
    const [salesPaymentFilter, setSalesPaymentFilter] = useState('all'); // 'all', 'cash', 'fee_ledger'
    const [salesSearch, setSalesSearch] = useState('');

    // Inventory Table Filter State
    const [invSearch, setInvSearch] = useState('');
    const [invClassFilter, setInvClassFilter] = useState('All');
    const [invLowStockOnly, setInvLowStockOnly] = useState(false);

    // -------------------------------------------------------------
    // 1. OFFLINE VAULT & EVENT LISTENERS
    // -------------------------------------------------------------
    const updatePendingSyncCount = () => {
        if (!schoolId) return;
        try {
            const raw = localStorage.getItem(`pending_store_sync_${schoolId}`);
            const queue = raw ? JSON.parse(raw) : [];
            setPendingSyncCount(queue.length);
        } catch (e) {
            setPendingSyncCount(0);
        }
    };

    // Listen to browser online/offline events & auto-flush sync queue
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            triggerAutoSync();
        };
        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        updatePendingSyncCount();

        // Automatically trigger sync on mount if online
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            triggerAutoSync();
        }

        // Periodic background watchdog to auto-sync any pending items every 8 seconds
        const syncInterval = setInterval(() => {
            if (typeof navigator !== 'undefined' && navigator.onLine && !isSyncing) {
                try {
                    const raw = localStorage.getItem(`pending_store_sync_${schoolId}`);
                    const q = raw ? JSON.parse(raw) : [];
                    if (q.length > 0) {
                        triggerAutoSync();
                    } else {
                        setPendingSyncCount(0);
                    }
                } catch (e) {
                    setPendingSyncCount(0);
                }
            }
        }, 8000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(syncInterval);
        };
    }, [schoolId]);

    // Local Storage Caching Watchers
    useEffect(() => {
        if (!schoolId) return;
        try {
            if (items.length > 0) localStorage.setItem(`store_items_cache_${schoolId}`, JSON.stringify(items));
        } catch (e) { }
    }, [items, schoolId]);

    useEffect(() => {
        if (!schoolId) return;
        try {
            if (bundles.length > 0) localStorage.setItem(`store_bundles_cache_${schoolId}`, JSON.stringify(bundles));
        } catch (e) { }
    }, [bundles, schoolId]);

    useEffect(() => {
        if (!schoolId) return;
        try {
            if (sales.length > 0) localStorage.setItem(`store_sales_cache_${schoolId}`, JSON.stringify(sales));
        } catch (e) { }
    }, [sales, schoolId]);

    useEffect(() => {
        if (!schoolId) return;
        try {
            if (classesList.length > 0) localStorage.setItem(`store_classes_cache_${schoolId}`, JSON.stringify(classesList));
        } catch (e) { }
    }, [classesList, schoolId]);

    // -------------------------------------------------------------
    // 2. FIRESTORE REALTIME SYNC (ONLINE)
    // -------------------------------------------------------------
    useEffect(() => {
        if (!schoolId) return;

        // School Info
        const schoolDocRef = doc(db, 'schools', schoolId);
        getDoc(schoolDocRef).then((snap) => {
            if (snap.exists()) {
                const d = snap.data();
                setSchoolInfo({
                    name: d.name || d.schoolName || 'School Management System',
                    address: d.address || '',
                    phone: d.phone || d.contactNumber || '',
                    logo: d.logoUrl || d.logo || ''
                });
            }
        }).catch(console.error);

        // Classes
        const classesRef = collection(db, 'schools', schoolId, 'classes');
        const unsubClasses = onSnapshot(classesRef, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setClassesList(list);
        }, (err) => console.warn('Classes listener error:', err));

        // Primary Store Settings
        const storeSettingsRef = doc(db, 'schools', schoolId, 'settings', 'store_inventory');
        const unsubStoreSettings = onSnapshot(storeSettingsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (Array.isArray(data.items)) {
                    setItems(data.items);
                }
                if (Array.isArray(data.bundles)) {
                    setBundles(data.bundles);
                }
                if (Array.isArray(data.sales)) {
                    setSales(data.sales);
                }
            }
            setLoading(false);
        }, (err) => {
            console.warn('Store settings listener fallback:', err);
            setLoading(false);
        });

        // Subcollection sync
        const itemsRef = collection(db, 'schools', schoolId, 'store_items');
        const unsubItems = onSnapshot(itemsRef, (snap) => {
            if (!snap.empty) {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setItems(prev => list.length >= prev.length ? list : prev);
            }
        }, (err) => { });

        const bundlesRef = collection(db, 'schools', schoolId, 'store_bundles');
        const unsubBundles = onSnapshot(bundlesRef, (snap) => {
            if (!snap.empty) {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setBundles(prev => list.length >= prev.length ? list : prev);
            }
        }, (err) => { });

        const salesRef = collection(db, 'schools', schoolId, 'store_sales');
        const unsubSales = onSnapshot(salesRef, (snap) => {
            if (!snap.empty) {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setSales(prev => list.length >= prev.length ? list : prev);
            }
        }, (err) => { });

        return () => {
            unsubClasses();
            unsubStoreSettings();
            unsubItems();
            unsubBundles();
            unsubSales();
        };
    }, [schoolId]);

    // Fetch students when a class is selected in checkout modal
    useEffect(() => {
        if (!schoolId || !selectedClassId) {
            setClassStudents([]);
            setSelectedStudent(null);
            return;
        }

        setLoadingStudents(true);
        const studentsRef = collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`);
        getDocs(studentsRef).then((snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setClassStudents(list);
            setLoadingStudents(false);
        }).catch(err => {
            console.error('Error fetching students:', err);
            setLoadingStudents(false);
        });
    }, [schoolId, selectedClassId]);

    // -------------------------------------------------------------
    // 3. BACKGROUND AUTO-SYNC RUNNER
    // -------------------------------------------------------------
    const triggerAutoSync = async () => {
        if (!schoolId || isSyncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

        let queue = [];
        try {
            const raw = localStorage.getItem(`pending_store_sync_${schoolId}`);
            queue = raw ? JSON.parse(raw) : [];
        } catch (e) {
            queue = [];
        }

        if (queue.length === 0) {
            setPendingSyncCount(0);
            return;
        }

        setIsSyncing(true);
        let syncedCount = 0;

        try {
            const remainingQueue = [];

            for (const item of queue) {
                try {
                    if (item.type === 'sale' && item.payload) {
                        const saleData = item.payload;
                        const batch = writeBatch(db);

                        const salesColRef = collection(db, 'schools', schoolId, 'store_sales');
                        const newSaleRef = doc(salesColRef);
                        batch.set(newSaleRef, {
                            ...saleData,
                            syncedAt: serverTimestamp(),
                            offlineQueued: false
                        });

                        // Deduct stock in subcollections
                        (saleData.items || []).forEach(cartItem => {
                            if (!cartItem.isBundle && cartItem.id) {
                                try {
                                    const itRef = doc(db, 'schools', schoolId, 'store_items', cartItem.id);
                                    batch.update(itRef, { stock: increment(-cartItem.quantity) });
                                } catch (e) {}
                            }
                        });

                        // Student Fee Ledger append
                        if (saleData.paymentMode === 'fee_ledger' && saleData.studentInfo?.studentId && saleData.studentInfo?.classId) {
                            const studentDocRef = doc(db, 'schools', schoolId, 'classes', saleData.studentInfo.classId, 'students', saleData.studentInfo.studentId);
                            const masterStudentDocRef = doc(db, 'schools', schoolId, 'students', saleData.studentInfo.studentId);

                            const chargeRecord = {
                                id: `store_${saleData.receiptNo}`,
                                name: `Store/Uniform (${saleData.receiptNo})`,
                                amount: Number(saleData.finalAmount) || 0,
                                status: 'unpaid',
                                date: saleData.timestamp || new Date().toISOString(),
                                type: 'store_inventory',
                                receiptNo: saleData.receiptNo,
                                itemsCount: (saleData.items || []).reduce((a, b) => a + (Number(b.quantity) || 1), 0)
                            };

                            batch.update(studentDocRef, {
                                remaining: increment(saleData.finalAmount),
                                storeCharges: arrayUnion(chargeRecord),
                                individualActions: arrayUnion(chargeRecord),
                                lastStorePurchase: {
                                    receiptNo: saleData.receiptNo,
                                    amount: saleData.finalAmount,
                                    date: saleData.timestamp || new Date().toISOString()
                                }
                            });

                            try {
                                batch.update(masterStudentDocRef, {
                                    remaining: increment(saleData.finalAmount),
                                    individualActions: arrayUnion(chargeRecord)
                                });
                            } catch (e) {}
                        }

                        await batch.commit();
                        syncedCount++;
                    } else {
                        syncedCount++;
                    }
                } catch (batchErr) {
                    console.error('Failed to sync individual offline item:', batchErr);
                    const retries = (item.retries || 0) + 1;
                    if (retries < 2) {
                        remainingQueue.push({ ...item, retries });
                    } else {
                        console.warn('Resolved/dropped stale offline item from queue:', item);
                        syncedCount++;
                    }
                }
            }

            // Save remaining queue & update counter immediately
            localStorage.setItem(`pending_store_sync_${schoolId}`, JSON.stringify(remainingQueue));
            setPendingSyncCount(remainingQueue.length);

            if (syncedCount > 0 && remainingQueue.length === 0) {
                showAlert(`🎉 All ${syncedCount} offline transactions synced to cloud!`, 'success');
            }
        } catch (syncErr) {
            console.error('Auto sync runner error:', syncErr);
        } finally {
            setIsSyncing(false);
            updatePendingSyncCount();
        }
    };

    // -------------------------------------------------------------
    // 4. POS CART HELPERS
    // -------------------------------------------------------------
    const addToCart = (product, isBundle = false) => {
        if (isBundle) {
            const existing = cart.find(c => c.id === product.id && c.isBundle);
            if (existing) {
                setCart(cart.map(c => c.id === product.id && c.isBundle ? { ...c, quantity: c.quantity + 1 } : c));
            } else {
                setCart([...cart, {
                    id: product.id,
                    name: product.title,
                    price: Number(product.bundlePrice) || 0,
                    quantity: 1,
                    isBundle: true,
                    category: 'bundle',
                    targetClass: product.targetClass,
                    itemIds: product.selectedItemIds || []
                }]);
            }
            return;
        }

        if (product.stock <= 0) {
            showAlert(`"${product.name}" is out of stock!`, 'error');
            return;
        }

        const existing = cart.find(c => c.id === product.id && !c.isBundle);
        if (existing) {
            if (existing.quantity >= product.stock) {
                showAlert(`Cannot add more than available stock (${product.stock})`, 'warning');
                return;
            }
            setCart(cart.map(c => c.id === product.id && !c.isBundle ? { ...c, quantity: c.quantity + 1 } : c));
        } else {
            setCart([...cart, {
                id: product.id,
                name: product.name,
                price: Number(product.sellingPrice) || 0,
                costPrice: Number(product.costPrice) || 0,
                quantity: 1,
                isBundle: false,
                category: product.category,
                targetClass: product.targetClass || '',
                size: product.size || '',
                maxStock: product.stock
            }]);
        }
    };

    const updateCartQty = (index, newQty) => {
        if (newQty <= 0) {
            removeFromCart(index);
            return;
        }
        const item = cart[index];
        if (!item.isBundle && item.maxStock && newQty > item.maxStock) {
            showAlert(`Max stock available is ${item.maxStock}`, 'warning');
            return;
        }
        const updated = [...cart];
        updated[index].quantity = newQty;
        setCart(updated);
    };

    const removeFromCart = (index) => {
        setCart(cart.filter((_, i) => i !== index));
    };

    const clearCart = () => {
        setCart([]);
        setDiscount(0);
        setSelectedStudent(null);
        setSelectedClassId('');
    };

    const cartSubtotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    }, [cart]);

    const cartTotal = useMemo(() => {
        const disc = Math.min(Number(discount) || 0, cartSubtotal);
        return Math.max(0, cartSubtotal - disc);
    }, [cartSubtotal, discount]);

    // -------------------------------------------------------------
    // 5. WHATSAPP & DIGITAL RECEIPTS
    // -------------------------------------------------------------
    const formatWhatsAppNumber = (phone) => {
        if (!phone) return '';
        let clean = phone.toString().replace(/[^0-9]/g, '');
        if (clean.startsWith('0092')) {
            clean = clean.slice(2);
        } else if (clean.startsWith('03')) {
            clean = '92' + clean.slice(1);
        } else if (clean.startsWith('3') && clean.length === 10) {
            clean = '92' + clean;
        } else if (clean.length === 11 && clean.startsWith('0')) {
            clean = '92' + clean.slice(1);
        }
        return clean;
    };

    const generateWhatsAppReceiptText = (sale) => {
        const schoolTitle = schoolInfo.name || 'School Store Management';
        const dateStr = sale.createdAtFormatted || new Date().toLocaleString();
        const receiptNum = sale.receiptNo || 'STORE-RECEIPT';
        const customer = sale.customerName || (sale.studentInfo ? `${sale.studentInfo.name} (${sale.studentInfo.className})` : 'Walk-in Customer');
        const paymentText = sale.paymentMode === 'fee_ledger' ? '📝 ADDED TO STUDENT MONTHLY FEE LEDGER' : '💵 PAID IN CASH (COUNTER)';

        let text = `🏫 *${schoolTitle.toUpperCase()}*\n`;
        if (schoolInfo.address) text += `📍 _${schoolInfo.address}_\n`;
        if (schoolInfo.phone) text += `📞 Phone: ${schoolInfo.phone}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `🧾 *OFFICIAL STORE POS RECEIPT*\n`;
        text += `📄 *Receipt No:* \`${receiptNum}\`\n`;
        text += `📅 *Date & Time:* ${dateStr}\n`;
        text += `👤 *Customer / Student:* *${customer}*\n`;
        if (sale.studentInfo && sale.studentInfo.rollNo) {
            text += `🎓 *Class & Roll:* ${sale.studentInfo.className} (Roll #${sale.studentInfo.rollNo})\n`;
        }
        text += `💳 *Payment Method:* ${paymentText}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `📦 *PURCHASED ITEMS DETAIL:*\n`;

        (sale.items || []).forEach((it, idx) => {
            const sizeStr = it.size ? ` [${it.size}]` : '';
            text += `${idx + 1}. *${it.name}${sizeStr}*\n   ↳ ${it.quantity}x @ PKR ${it.price}  =  *PKR ${it.total}*\n`;
        });

        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `💰 *Subtotal:* PKR ${sale.subtotal}\n`;
        if (sale.discount > 0) {
            text += `🏷️ *Discount Given:* - PKR ${sale.discount}\n`;
        }
        text += `✅ *NET TOTAL PAID:* *PKR ${sale.finalAmount}*\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Thank you for choosing our school store!_\n`;
        text += `_Note: Goods once sold can only be exchanged within 3 days with this receipt._`;

        return text;
    };

    const sendWhatsAppReceiptDirect = (sale) => {
        const targetPhone = sale.customerPhone || customerPhone || (sale.studentInfo ? (sale.studentInfo.fatherPhone || sale.studentInfo.phone || '') : '');
        const cleanPhone = formatWhatsAppNumber(targetPhone);
        const text = generateWhatsAppReceiptText(sale);
        const encodedText = encodeURIComponent(text);

        if (cleanPhone) {
            window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');
        } else {
            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        }
    };

    // -------------------------------------------------------------
    // 6. CHECKOUT & SALE PROCESSING (OFFLINE-FIRST)
    // -------------------------------------------------------------
    const handleCheckoutSubmit = async (e) => {
        e.preventDefault();
        if (cart.length === 0) {
            showAlert('Your cart is empty!', 'error');
            return;
        }

        if (paymentMode === 'fee_ledger' && !selectedStudent) {
            showAlert('Please select a student to charge to their monthly fee ledger!', 'error');
            return;
        }

        setIsSubmittingOrder(true);
        try {
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const randomCode = Math.floor(1000 + Math.random() * 9000);
            const receiptNo = isOnline ? `STORE-${dateStr}-${randomCode}` : `OFFLINE-${dateStr}-${randomCode}`;

            const resolvedCustomerPhone = customerPhone || (selectedStudent ? (selectedStudent.fatherPhone || selectedStudent.phone || selectedStudent.whatsapp || selectedStudent.contactNumber || selectedStudent.emergencyContact || '') : '');

            const saleData = {
                receiptNo,
                timestamp: now.toISOString(),
                timestampMillis: now.getTime(),
                createdAtFormatted: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
                items: cart.map(c => ({
                    id: c.id,
                    name: c.name,
                    category: c.category,
                    price: c.price,
                    costPrice: c.costPrice || 0,
                    quantity: c.quantity,
                    total: c.price * c.quantity,
                    isBundle: !!c.isBundle,
                    size: c.size || ''
                })),
                subtotal: cartSubtotal,
                discount: Number(discount) || 0,
                finalAmount: cartTotal,
                paymentMode,
                status: 'completed',
                cashier: userProfile?.name || 'Administrator',
                customerName: paymentMode === 'fee_ledger' ? selectedStudent.name : (customerName || 'Walk-in Parent'),
                customerPhone: resolvedCustomerPhone,
                isOfflineRecord: !isOnline,
                studentInfo: paymentMode === 'fee_ledger' ? {
                    studentId: selectedStudent.id,
                    name: selectedStudent.name,
                    rollNo: selectedStudent.rollNumber || selectedStudent.rollNo || 'N/A',
                    classId: selectedClassId,
                    className: classesList.find(c => c.id === selectedClassId)?.name || 'Class',
                    fatherPhone: resolvedCustomerPhone
                } : null
            };

            // 1. Optimistically deduct local stock immediately (0ms response)
            const updatedItems = items.map(it => {
                const inCart = cart.find(c => c.id === it.id && !c.isBundle);
                if (inCart) {
                    return { ...it, stock: Math.max(0, (Number(it.stock) || 0) - inCart.quantity) };
                }
                return it;
            });
            const updatedSales = [saleData, ...sales];

            setItems(updatedItems);
            setSales(updatedSales);

            // Update local vault immediately
            try {
                localStorage.setItem(`store_items_cache_${schoolId}`, JSON.stringify(updatedItems));
                localStorage.setItem(`store_sales_cache_${schoolId}`, JSON.stringify(updatedSales));
            } catch (e) { }

            // 2. If Offline: Add to Pending Queue
            if (!isOnline) {
                try {
                    const raw = localStorage.getItem(`pending_store_sync_${schoolId}`);
                    const queue = raw ? JSON.parse(raw) : [];
                    queue.push({
                        id: `queue_${Date.now()}_${randomCode}`,
                        type: 'sale',
                        payload: saleData,
                        createdAt: now.toISOString()
                    });
                    localStorage.setItem(`pending_store_sync_${schoolId}`, JSON.stringify(queue));
                    updatePendingSyncCount();
                } catch (queueErr) {
                    console.error('Queue save error:', queueErr);
                }

                showAlert(`Sale completed offline! Receipt #${receiptNo} queued for cloud sync.`, 'success');
            } else {
                // 3. If Online: Write to Firestore settings & subcollections
                try {
                    await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                        items: updatedItems,
                        sales: updatedSales
                    }, { merge: true });

                    const batch = writeBatch(db);
                    const salesColRef = collection(db, 'schools', schoolId, 'store_sales');
                    const newSaleRef = doc(salesColRef);
                    batch.set(newSaleRef, {
                        ...saleData,
                        timestamp: serverTimestamp()
                    });

                    cart.forEach(cartItem => {
                        if (!cartItem.isBundle) {
                            const itemRef = doc(db, 'schools', schoolId, 'store_items', cartItem.id);
                            batch.update(itemRef, { stock: increment(-cartItem.quantity) });
                        }
                    });

                    if (paymentMode === 'fee_ledger' && selectedStudent) {
                        const studentDocRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'students', selectedStudent.id);
                        const masterStudentDocRef = doc(db, 'schools', schoolId, 'students', selectedStudent.id);

                        const chargeRecord = {
                            id: `store_${receiptNo}`,
                            name: `Store/Uniform (${receiptNo})`,
                            amount: Number(cartTotal) || 0,
                            status: 'unpaid',
                            date: now.toISOString(),
                            type: 'store_inventory',
                            receiptNo,
                            itemsCount: cart.reduce((a, b) => a + b.quantity, 0)
                        };

                        batch.update(studentDocRef, {
                            remaining: increment(cartTotal),
                            storeCharges: arrayUnion(chargeRecord),
                            individualActions: arrayUnion(chargeRecord),
                            lastStorePurchase: {
                                receiptNo,
                                amount: cartTotal,
                                date: now.toISOString()
                            }
                        });

                        try {
                            batch.update(masterStudentDocRef, {
                                remaining: increment(cartTotal),
                                individualActions: arrayUnion(chargeRecord)
                            });
                        } catch (e) {}
                    }

                    await batch.commit();
                    showAlert(`Sale completed successfully! Receipt #${receiptNo}`, 'success');
                } catch (onlineWriteErr) {
                    console.warn('Online write encountered warning, queued locally:', onlineWriteErr);
                    // Fallback to queue if network dropped mid-flight
                    const raw = localStorage.getItem(`pending_store_sync_${schoolId}`);
                    const queue = raw ? JSON.parse(raw) : [];
                    queue.push({
                        id: `queue_${Date.now()}_${randomCode}`,
                        type: 'sale',
                        payload: saleData,
                        createdAt: now.toISOString()
                    });
                    localStorage.setItem(`pending_store_sync_${schoolId}`, JSON.stringify(queue));
                    updatePendingSyncCount();
                    showAlert(`Sale saved to local queue! Receipt #${receiptNo}`, 'success');
                }
            }

            setCheckoutModalOpen(false);
            clearCart();

            // WhatsApp trigger
            if (sendWhatsAppReceipt && resolvedCustomerPhone) {
                try {
                    sendWhatsAppReceiptDirect(saleData);
                } catch (waErr) {
                    console.log('WhatsApp link trigger:', waErr);
                }
            }

            // Open Receipt Modal
            setActiveReceipt({
                ...saleData,
                id: `sale_${dateStr}_${randomCode}`,
                timestamp: now
            });
            setReceiptModalOpen(true);
        } catch (error) {
            console.error('Checkout error:', error);
            showAlert('Failed to process checkout: ' + error.message, 'error');
        } finally {
            setIsSubmittingOrder(false);
        }
    };

    // -------------------------------------------------------------
    // 7. INVENTORY CRUD (ONLINE / OFFLINE SAFE)
    // -------------------------------------------------------------
    const handleOpenItemModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setItemFormData({
                name: item.name || '',
                category: item.category || 'book',
                targetClass: item.targetClass || 'General / All Classes',
                publisher: item.publisher || '',
                uniformType: item.uniformType || 'Shirt',
                gender: item.gender || 'Unisex',
                size: item.size || 'Size 26',
                costPrice: item.costPrice || 0,
                sellingPrice: item.sellingPrice || 0,
                stock: item.stock || 0,
                lowStockThreshold: item.lowStockThreshold || 5,
                sku: item.sku || ''
            });
        } else {
            setEditingItem(null);
            setItemFormData({
                name: '',
                category: activeTab === 'uniform' ? 'uniform' : 'book',
                targetClass: 'General / All Classes',
                publisher: '',
                uniformType: 'Shirt',
                gender: 'Unisex',
                size: 'Size 26',
                costPrice: 0,
                sellingPrice: 0,
                stock: 0,
                lowStockThreshold: 5,
                sku: ''
            });
        }
        setItemModalOpen(true);
    };

    const handleSaveItem = async (e) => {
        e.preventDefault();
        if (!itemFormData.name.trim()) {
            showAlert('Item name is required!', 'error');
            return;
        }

        try {
            const itemId = editingItem ? editingItem.id : `item_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
            const itemObj = {
                id: itemId,
                name: itemFormData.name.trim(),
                category: itemFormData.category,
                targetClass: itemFormData.targetClass,
                costPrice: Number(itemFormData.costPrice) || 0,
                sellingPrice: Number(itemFormData.sellingPrice) || 0,
                stock: Number(itemFormData.stock) || 0,
                lowStockThreshold: Number(itemFormData.lowStockThreshold) || 5,
                sku: itemFormData.sku.trim() || `SKU-${Math.floor(100000 + Math.random() * 900000)}`,
                createdAt: editingItem ? editingItem.createdAt || new Date().toISOString() : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (itemFormData.category === 'book' || itemFormData.category === 'stationery') {
                itemObj.publisher = itemFormData.publisher.trim();
            } else if (itemFormData.category === 'uniform') {
                itemObj.uniformType = itemFormData.uniformType;
                itemObj.gender = itemFormData.gender;
                itemObj.size = itemFormData.size;
            }

            const updatedItems = editingItem
                ? items.map(it => it.id === itemId ? itemObj : it)
                : [itemObj, ...items.filter(it => it.id !== itemId)];

            setItems(updatedItems);

            if (schoolId) {
                await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                    items: updatedItems
                }, { merge: true });

                try {
                    await setDoc(doc(db, 'schools', schoolId, 'store_items', itemId), itemObj, { merge: true });
                } catch (err) { }
            }

            showAlert(editingItem ? `"${itemFormData.name}" updated successfully!` : `"${itemFormData.name}" added to inventory!`, 'success');
            setItemModalOpen(false);
            setEditingItem(null);
        } catch (error) {
            console.error('Save item error:', error);
            showAlert('Failed to save item: ' + error.message, 'error');
        }
    };

    const handleDeleteItem = async (item) => {
        if (!window.confirm(`Are you sure you want to delete "${item.name}" from store inventory?`)) return;
        try {
            const updatedItems = items.filter(it => it.id !== item.id);
            setItems(updatedItems);

            if (schoolId) {
                await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                    items: updatedItems
                }, { merge: true });

                try {
                    await deleteDoc(doc(db, 'schools', schoolId, 'store_items', item.id));
                } catch (err) { }
            }

            showAlert('Item deleted successfully!', 'success');
        } catch (error) {
            showAlert('Error deleting item: ' + error.message, 'error');
        }
    };

    const handleRestockSubmit = async (e) => {
        e.preventDefault();
        if (!restockItem) return;
        const addQty = Number(restockQuantity) || 0;
        if (addQty === 0) return;

        try {
            const updatedItems = items.map(it => it.id === restockItem.id ? { ...it, stock: (Number(it.stock) || 0) + addQty } : it);
            setItems(updatedItems);

            if (schoolId) {
                await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                    items: updatedItems
                }, { merge: true });

                try {
                    await updateDoc(doc(db, 'schools', schoolId, 'store_items', restockItem.id), {
                        stock: increment(addQty)
                    });
                } catch (err) { }
            }

            showAlert(`Restocked +${addQty} units for "${restockItem.name}"!`, 'success');
            setRestockModalOpen(false);
            setRestockItem(null);
        } catch (error) {
            showAlert('Failed to restock: ' + error.message, 'error');
        }
    };

    // -------------------------------------------------------------
    // 8. BUNDLES & PRE-BUILT TEMPLATES
    // -------------------------------------------------------------
    const handleSaveBundle = async (e) => {
        e.preventDefault();
        if (!bundleFormData.title.trim()) {
            showAlert('Bundle title is required!', 'error');
            return;
        }

        try {
            const newBundleId = `bundle_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
            const newBundleObj = {
                id: newBundleId,
                title: bundleFormData.title.trim(),
                targetClass: bundleFormData.targetClass || 'Class 1',
                bundlePrice: Number(bundleFormData.bundlePrice) || 0,
                selectedItemIds: Array.isArray(bundleFormData.selectedItemIds) ? bundleFormData.selectedItemIds : [],
                createdAt: new Date().toISOString()
            };

            const updatedBundles = [newBundleObj, ...bundles.filter(b => b.id !== newBundleId)];
            setBundles(updatedBundles);

            if (schoolId) {
                await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                    bundles: updatedBundles
                }, { merge: true });

                try {
                    await setDoc(doc(db, 'schools', schoolId, 'store_bundles', newBundleId), newBundleObj);
                } catch (err) { }
            }

            showAlert('Class package bundle created successfully!', 'success');
            setBundleModalOpen(false);
            setBundleFormData({ title: '', targetClass: 'Class 1', bundlePrice: 0, selectedItemIds: [] });
        } catch (error) {
            console.error('Bundle creation error:', error);
            showAlert('Failed to create bundle: ' + error.message, 'error');
        }
    };

    const handleDeleteBundle = async (bundle) => {
        if (!window.confirm(`Delete bundle "${bundle.title}"?`)) return;
        try {
            const updatedBundles = bundles.filter(b => b.id !== bundle.id);
            setBundles(updatedBundles);

            if (schoolId) {
                await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                    bundles: updatedBundles
                }, { merge: true });

                try {
                    await deleteDoc(doc(db, 'schools', schoolId, 'store_bundles', bundle.id));
                } catch (err) { }
            }

            showAlert('Bundle deleted!', 'success');
        } catch (error) {
            showAlert('Failed to delete bundle: ' + error.message, 'error');
        }
    };

    const handleOpenTemplateModal = (targetClass = 'Class 1') => {
        const cls = targetClass || 'Class 1';
        setSelectedTemplateClass(cls);
        const template = STANDARD_CLASS_TEMPLATES[cls] || STANDARD_CLASS_TEMPLATES['Class 1'];
        if (template) {
            const preparedItems = (template.items || []).map((item, idx) => ({
                ...item,
                tempId: `draft_${Date.now()}_${idx}`,
                selected: true,
                targetClass: cls
            }));
            setTemplateDraftItems(preparedItems);
            setTemplateBundleTitle(template.title || `${cls} Complete Academic Kit`);
            setTemplateBundlePrice(template.suggestedBundlePrice || 5000);
        }
        setTemplateFilterCategory('all');
        setTemplateModalOpen(true);
    };

    const handleSelectTemplateClass = (cls) => {
        setSelectedTemplateClass(cls);
        const template = STANDARD_CLASS_TEMPLATES[cls] || STANDARD_CLASS_TEMPLATES['Class 1'];
        if (template) {
            const preparedItems = (template.items || []).map((item, idx) => ({
                ...item,
                tempId: `draft_${Date.now()}_${idx}`,
                selected: true,
                targetClass: cls
            }));
            setTemplateDraftItems(preparedItems);
            setTemplateBundleTitle(template.title || `${cls} Complete Academic Kit`);
            setTemplateBundlePrice(template.suggestedBundlePrice || 5000);
        }
    };

    const handleToggleDraftItem = (index) => {
        setTemplateDraftItems(prev => prev.map((it, idx) => idx === index ? { ...it, selected: !it.selected } : it));
    };

    const handleToggleAllDraftItems = (select = true) => {
        setTemplateDraftItems(prev => prev.map(it => ({ ...it, selected: select })));
    };

    const handleUpdateDraftItemField = (index, field, value) => {
        setTemplateDraftItems(prev => prev.map((it, idx) => idx === index ? { ...it, [field]: value } : it));
    };

    const handleImportTemplateKit = async (createBundle = true) => {
        const selectedItems = templateDraftItems.filter(it => it.selected);
        if (selectedItems.length === 0) {
            showAlert('Please select at least one item to import!', 'error');
            return;
        }

        setIsImportingTemplate(true);
        try {
            const nowIso = new Date().toISOString();
            const newCreatedItems = selectedItems.map((draft, idx) => {
                const itemId = `item_${Date.now()}_${idx}_${Math.floor(1000 + Math.random() * 9000)}`;
                return {
                    id: itemId,
                    name: (draft.name || '').trim(),
                    category: draft.category || 'book',
                    targetClass: selectedTemplateClass,
                    publisher: draft.publisher || '',
                    uniformType: draft.uniformType || 'Shirt',
                    gender: draft.gender || 'Unisex',
                    size: draft.size || 'Size 28',
                    costPrice: Number(draft.costPrice) || 0,
                    sellingPrice: Number(draft.sellingPrice) || 0,
                    stock: Number(draft.stock) || 30,
                    lowStockThreshold: 5,
                    sku: `SKU-${selectedTemplateClass.replace(/\s+/g, '')}-${(draft.category || 'itm').slice(0, 3).toUpperCase()}-${idx + 1}`,
                    createdAt: nowIso,
                    updatedAt: nowIso
                };
            });

            const updatedItems = [...newCreatedItems, ...items];
            let updatedBundles = [...bundles];

            if (createBundle && templateBundleTitle.trim()) {
                const newBundleId = `bundle_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
                const newBundleObj = {
                    id: newBundleId,
                    title: templateBundleTitle.trim(),
                    targetClass: selectedTemplateClass,
                    bundlePrice: Number(templateBundlePrice) || newCreatedItems.reduce((acc, curr) => acc + curr.sellingPrice, 0),
                    selectedItemIds: newCreatedItems.map(it => it.id),
                    createdAt: nowIso
                };
                updatedBundles = [newBundleObj, ...bundles];

                if (schoolId) {
                    try {
                        await setDoc(doc(db, 'schools', schoolId, 'store_bundles', newBundleId), newBundleObj);
                    } catch (e) { }
                }
            }

            setItems(updatedItems);
            setBundles(updatedBundles);

            if (schoolId) {
                await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                    items: updatedItems,
                    bundles: updatedBundles
                }, { merge: true });

                newCreatedItems.forEach(async (it) => {
                    try {
                        await setDoc(doc(db, 'schools', schoolId, 'store_items', it.id), it, { merge: true });
                    } catch (e) { }
                });
            }

            showAlert(`🎉 Successfully loaded ${newCreatedItems.length} items ${createBundle ? '& created 1 Class Bundle' : ''} for ${selectedTemplateClass}!`, 'success');
            setTemplateModalOpen(false);
        } catch (error) {
            console.error('Template import error:', error);
            showAlert('Failed to import template: ' + error.message, 'error');
        } finally {
            setIsImportingTemplate(false);
        }
    };

    // -------------------------------------------------------------
    // 9. PDF RECEIPT GENERATION (THERMAL / A4)
    // -------------------------------------------------------------
    const downloadReceiptPDF = (receipt) => {
        if (!receipt) return;
        try {
            const doc = new jsPDF({
                unit: 'mm',
                format: [80, 180] // Standard 80mm POS Thermal Receipt
            });

            // Header
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(schoolInfo.name || 'SCHOOL STORE', 40, 9, { align: 'center' });

            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            if (schoolInfo.address) {
                doc.text(schoolInfo.address, 40, 13, { align: 'center' });
            }
            if (schoolInfo.phone) {
                doc.text(`Phone: ${schoolInfo.phone}`, 40, 17, { align: 'center' });
            }

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.text('OFFICIAL STORE POS RECEIPT', 40, 23, { align: 'center' });

            doc.setLineWidth(0.3);
            doc.line(5, 26, 75, 26);

            // Metadata
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(`Receipt #: ${receipt.receiptNo}`, 5, 30);
            doc.text(`Date: ${receipt.createdAtFormatted || new Date().toLocaleString()}`, 5, 34);
            doc.text(`Customer: ${receipt.customerName || 'Walk-in'}`, 5, 38);
            if (receipt.studentInfo) {
                doc.text(`Class: ${receipt.studentInfo.className} (Roll #${receipt.studentInfo.rollNo || 'N/A'})`, 5, 42);
            }
            doc.text(`Payment: ${receipt.paymentMode === 'fee_ledger' ? 'ADDED TO FEE LEDGER' : 'PAID IN CASH'}`, 5, receipt.studentInfo ? 46 : 42);

            const startY = receipt.studentInfo ? 50 : 46;
            doc.line(5, startY, 75, startY);

            // Items Table
            const tableBody = (receipt.items || []).map(it => [
                it.name + (it.size ? ` (${it.size})` : ''),
                `${it.quantity}x`,
                `${it.price}`,
                `${it.total}`
            ]);

            autoTable(doc, {
                startY: startY + 2,
                head: [['Item', 'Qty', 'Rate', 'Total']],
                body: tableBody,
                theme: 'plain',
                styles: { fontSize: 6.5, cellPadding: 1 },
                headStyles: { fontStyle: 'bold', borderBottom: '1px solid #000' },
                columnStyles: {
                    0: { cellWidth: 34 },
                    1: { cellWidth: 8, halign: 'center' },
                    2: { cellWidth: 12, halign: 'right' },
                    3: { cellWidth: 14, halign: 'right' }
                },
                margin: { left: 5, right: 5 }
            });

            const finalY = doc.lastAutoTable.finalY + 3;
            doc.line(5, finalY, 75, finalY);

            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(`Subtotal:`, 45, finalY + 4);
            doc.text(`PKR ${receipt.subtotal}`, 75, finalY + 4, { align: 'right' });

            if (receipt.discount > 0) {
                doc.text(`Discount:`, 45, finalY + 8);
                doc.text(`- PKR ${receipt.discount}`, 75, finalY + 8, { align: 'right' });
            }

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            const netY = receipt.discount > 0 ? finalY + 13 : finalY + 9;
            doc.text(`NET TOTAL:`, 45, netY);
            doc.text(`PKR ${receipt.finalAmount}`, 75, netY, { align: 'right' });

            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'italic');
            doc.text('Thank you for shopping at our school store!', 40, netY + 7, { align: 'center' });
            doc.text('Goods once sold can only be exchanged within 3 days.', 40, netY + 11, { align: 'center' });

            doc.save(`${receipt.receiptNo}.pdf`);
        } catch (err) {
            console.error('PDF export error:', err);
            showAlert('Failed to generate PDF: ' + err.message, 'error');
        }
    };

    // -------------------------------------------------------------
    // 10. FILTERED COMPUTATIONS & ANALYTICS
    // -------------------------------------------------------------
    const filteredPosProducts = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(posSearch.toLowerCase()) ||
                (item.publisher && item.publisher.toLowerCase().includes(posSearch.toLowerCase())) ||
                (item.sku && item.sku.toLowerCase().includes(posSearch.toLowerCase()));

            const matchesCategory = posCategoryFilter === 'all' || item.category === posCategoryFilter;
            const matchesClass = posClassFilter === 'All' || item.targetClass === posClassFilter || item.targetClass === 'General / All Classes';

            return matchesSearch && matchesCategory && matchesClass;
        });
    }, [items, posSearch, posCategoryFilter, posClassFilter]);

    const filteredBundles = useMemo(() => {
        return bundles.filter(b => {
            const matchesSearch = b.title.toLowerCase().includes(posSearch.toLowerCase());
            const matchesClass = posClassFilter === 'All' || b.targetClass === posClassFilter;
            return matchesSearch && matchesClass;
        });
    }, [bundles, posSearch, posClassFilter]);

    const filteredInventoryItems = useMemo(() => {
        return items.filter(item => {
            if (activeTab === 'uniform' && item.category !== 'uniform') return false;
            if (activeTab === 'books_stationery' && (item.category !== 'book' && item.category !== 'stationery')) return false;

            const matchesSearch = item.name.toLowerCase().includes(invSearch.toLowerCase()) ||
                (item.publisher && item.publisher.toLowerCase().includes(invSearch.toLowerCase())) ||
                (item.sku && item.sku.toLowerCase().includes(invSearch.toLowerCase()));

            const matchesClass = invClassFilter === 'All' || item.targetClass === invClassFilter;
            const matchesLowStock = !invLowStockOnly || item.stock <= (item.lowStockThreshold || 5);

            return matchesSearch && matchesClass && matchesLowStock;
        });
    }, [items, activeTab, invSearch, invClassFilter, invLowStockOnly]);

    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            const matchesSearch = s.receiptNo.toLowerCase().includes(salesSearch.toLowerCase()) ||
                (s.customerName && s.customerName.toLowerCase().includes(salesSearch.toLowerCase())) ||
                (s.studentInfo?.name && s.studentInfo.name.toLowerCase().includes(salesSearch.toLowerCase()));

            const matchesPayment = salesPaymentFilter === 'all' || s.paymentMode === salesPaymentFilter;

            if (!matchesSearch || !matchesPayment) return false;

            if (salesDateFilter === 'today') {
                const today = new Date().toISOString().slice(0, 10);
                return s.timestamp && s.timestamp.startsWith(today);
            }
            if (salesDateFilter === 'week') {
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
                return (s.timestampMillis || new Date(s.timestamp).getTime()) >= weekAgo;
            }
            if (salesDateFilter === 'month') {
                const currentMonth = new Date().toISOString().slice(0, 7);
                return s.timestamp && s.timestamp.startsWith(currentMonth);
            }

            return true;
        });
    }, [sales, salesSearch, salesPaymentFilter, salesDateFilter]);

    // Financial KPI Metrics
    const kpiMetrics = useMemo(() => {
        let totalItems = items.length;
        let totalStockUnits = 0;
        let totalStockValue = 0;
        let lowStockCount = 0;

        items.forEach(it => {
            const st = Number(it.stock) || 0;
            totalStockUnits += st;
            totalStockValue += st * (Number(it.costPrice) || Number(it.sellingPrice) || 0);
            if (st <= (it.lowStockThreshold || 5)) {
                lowStockCount++;
            }
        });

        // Today's Sales
        const todayStr = new Date().toISOString().slice(0, 10);
        let todayRevenue = 0;
        let totalRevenue = 0;
        let totalCash = 0;
        let totalLedger = 0;

        sales.forEach(s => {
            const amt = Number(s.finalAmount) || 0;
            totalRevenue += amt;
            if (s.paymentMode === 'cash') totalCash += amt;
            if (s.paymentMode === 'fee_ledger') totalLedger += amt;
            if (s.timestamp && s.timestamp.startsWith(todayStr)) {
                todayRevenue += amt;
            }
        });

        return {
            totalItems,
            totalStockUnits,
            totalStockValue,
            lowStockCount,
            todayRevenue,
            totalRevenue,
            totalCash,
            totalLedger,
            totalSalesCount: sales.length
        };
    }, [items, sales]);

    // Template financial stats
    const templateTotals = useMemo(() => {
        const selected = templateDraftItems.filter(it => it.selected);
        const totalSelling = selected.reduce((acc, curr) => acc + (Number(curr.sellingPrice) || 0), 0);
        const totalCost = selected.reduce((acc, curr) => acc + (Number(curr.costPrice) || 0), 0);
        const estProfit = Math.max(0, (Number(templateBundlePrice) || 0) - totalCost);
        return {
            count: selected.length,
            totalSelling,
            totalCost,
            estProfit
        };
    }, [templateDraftItems, templateBundlePrice]);

    // -------------------------------------------------------------
    // RENDER UI
    // -------------------------------------------------------------
    return (
        <div className="p-4 md:p-6 bg-slate-50 min-h-screen">
            {/* ========================================================= */}
            {/* TOP BAR: BRANDING, STATS & OFFLINE SENTINEL */}
            {/* ========================================================= */}
            <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200/80 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Store Title & Info */}
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
                            <ShoppingBag className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                                    Store & Inventory Hub
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    POS Terminal v5.2
                                </span>
                            </div>
                            <p className="text-xs md:text-sm text-slate-500 font-medium">
                                Books, Stationery, Uniforms & 1-Click Fast Billing
                            </p>
                        </div>
                    </div>

                    {/* Right: Offline Sentinel & Actions */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Network Status Badge */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                            isOnline
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                        }`}>
                            {isOnline ? (
                                <>
                                    <Wifi className="w-4 h-4 text-emerald-600" />
                                    <span>Cloud Online</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-4 h-4 text-amber-600" />
                                    <span>Offline Mode</span>
                                </>
                            )}
                        </div>

                        {/* Pending Sync Indicator */}
                        {pendingSyncCount > 0 && (
                            <button
                                onClick={triggerAutoSync}
                                disabled={isSyncing || !isOnline}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                                title="Click to sync pending transactions now"
                            >
                                <CloudUpload className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                <span>{isSyncing ? 'Syncing...' : `${pendingSyncCount} Pending Sync`}</span>
                            </button>
                        )}

                        {/* Pre-built Syllabus Loader */}
                        <button
                            onClick={() => handleOpenTemplateModal('Class 1')}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-xs font-bold transition-all"
                        >
                            <Sparkles className="w-4 h-4 text-violet-600" />
                            <span>Import Class Kit</span>
                        </button>

                        {/* Add Item Button */}
                        <button
                            onClick={() => handleOpenItemModal()}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-200 transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Item</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* MODERN NAVIGATION TABS */}
            {/* ========================================================= */}
            {/* MODERN NAVIGATION TABS */}
            {/* ========================================================= */}
            <div className="flex items-center gap-3 overflow-x-auto pb-2.5 mb-6 border-b border-slate-200">
                {[
                    { 
                        id: 'pos', 
                        label: 'POS Billing Counter', 
                        icon: ShoppingBag, 
                        badge: cart.length > 0 ? cart.length : null,
                        activeBg: 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 border-indigo-600',
                        inactiveBg: 'bg-indigo-50/60 text-indigo-900 hover:bg-indigo-100 border-indigo-200/80'
                    },
                    { 
                        id: 'books_stationery', 
                        label: 'Books & Syllabus', 
                        icon: BookOpen, 
                        count: items.filter(i => i.category === 'book').length,
                        activeBg: 'bg-blue-600 text-white shadow-md shadow-blue-500/25 border-blue-600',
                        inactiveBg: 'bg-blue-50/70 text-blue-900 hover:bg-blue-100 border-blue-200/80'
                    },
                    { 
                        id: 'uniform', 
                        label: 'Uniform Store', 
                        icon: Shirt, 
                        count: items.filter(i => i.category === 'uniform').length,
                        activeBg: 'bg-purple-600 text-white shadow-md shadow-purple-500/25 border-purple-600',
                        inactiveBg: 'bg-purple-50/70 text-purple-900 hover:bg-purple-100 border-purple-200/80'
                    },
                    { 
                        id: 'bundles', 
                        label: 'Class Sets & Bundles', 
                        icon: Package, 
                        count: bundles.length,
                        activeBg: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25 border-emerald-600',
                        inactiveBg: 'bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100 border-emerald-200/80'
                    },
                    { 
                        id: 'sales', 
                        label: 'Sales Ledger & Reports', 
                        icon: BarChart3, 
                        count: sales.length,
                        activeBg: 'bg-slate-900 text-white shadow-md shadow-slate-900/25 border-slate-900',
                        inactiveBg: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-200'
                    }
                ].map(tab => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs md:text-sm font-extrabold whitespace-nowrap transition-all duration-200 border ${
                                isActive
                                    ? `${tab.activeBg} scale-[1.02]`
                                    : `${tab.inactiveBg}`
                            }`}
                        >
                            <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-white' : 'text-current opacity-80'}`} />
                            <span>{tab.label}</span>
                            {tab.badge && (
                                <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white shadow-xs animate-pulse">
                                    {tab.badge}
                                </span>
                            )}
                            {tab.count !== undefined && !tab.badge && (
                                <span className={`ml-1 px-2 py-0.5 rounded-lg text-[11px] font-black ${
                                    isActive ? 'bg-black/25 text-white' : 'bg-white/80 text-slate-800 shadow-2xs'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ========================================================= */}
            {/* TAB 1: POINT OF SALE (POS COUNTER) */}
            {/* ========================================================= */}
            {activeTab === 'pos' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left: Catalog & Product Browser (8 Cols) */}
                    <div className="lg:col-span-8 space-y-4">
                        {/* Search & Category Filter Toolbar */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm space-y-3.5">
                            <div className="flex flex-col sm:flex-row items-center gap-2.5">
                                {/* Search Bar */}
                                <div className="relative flex-1 w-full">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search book, uniform, publisher, SKU barcode..."
                                        value={posSearch}
                                        onChange={(e) => setPosSearch(e.target.value)}
                                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                    />
                                    {posSearch && (
                                        <button
                                            onClick={() => setPosSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Class Dropdown */}
                                <select
                                    value={posClassFilter}
                                    onChange={(e) => setPosClassFilter(e.target.value)}
                                    className="w-full sm:w-48 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                >
                                    <option value="All">All Classes</option>
                                    {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Solid Category Filter Buttons with Theme Colors and Larger Size */}
                            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5">
                                {[
                                    { 
                                        id: 'all', 
                                        label: 'All Items', 
                                        icon: Package,
                                        activeBg: 'bg-slate-900 text-white shadow-md shadow-slate-900/25 border-slate-900',
                                        inactiveBg: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                                    },
                                    { 
                                        id: 'book', 
                                        label: 'Books / Syllabus', 
                                        icon: BookOpen,
                                        activeBg: 'bg-blue-600 text-white shadow-md shadow-blue-500/25 border-blue-600',
                                        inactiveBg: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
                                    },
                                    { 
                                        id: 'uniform', 
                                        label: 'Uniforms', 
                                        icon: Shirt,
                                        activeBg: 'bg-purple-600 text-white shadow-md shadow-purple-500/25 border-purple-600',
                                        inactiveBg: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200'
                                    },
                                    { 
                                        id: 'stationery', 
                                        label: 'Stationery', 
                                        icon: Tag,
                                        activeBg: 'bg-amber-500 text-white shadow-md shadow-amber-500/25 border-amber-500',
                                        inactiveBg: 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200'
                                    }
                                ].map(cat => {
                                    const isSelected = posCategoryFilter === cat.id;
                                    const CatIcon = cat.icon;
                                    const count = cat.id === 'all' 
                                        ? items.length 
                                        : items.filter(i => i.category === cat.id).length;

                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => setPosCategoryFilter(cat.id)}
                                            className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs md:text-sm font-black whitespace-nowrap transition-all duration-150 border ${
                                                isSelected
                                                    ? `${cat.activeBg} scale-[1.03]`
                                                    : `${cat.inactiveBg}`
                                            }`}
                                        >
                                            <CatIcon className="w-4.5 h-4.5" />
                                            <span>{cat.label}</span>
                                            <span className={`ml-0.5 px-2 py-0.5 rounded-md text-[11px] font-black ${
                                                isSelected 
                                                    ? 'bg-black/20 text-white' 
                                                    : 'bg-white text-slate-800 shadow-2xs'
                                            }`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {/* 1-Click Class Sets / Bundles Bar (Expandable) */}
                        {filteredBundles.length > 0 && (
                            <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-emerald-50/90 p-3.5 md:p-4 rounded-2xl border border-indigo-100 shadow-xs transition-all duration-300">
                                <div 
                                    onClick={() => setIsBundlesExpanded(!isBundlesExpanded)}
                                    className="flex items-center justify-between cursor-pointer select-none gap-2"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                                            <Sparkles className="w-4 h-4" />
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-indigo-950 font-black text-xs md:text-sm uppercase tracking-wider">
                                                1-Click Class Complete Sets
                                            </span>
                                            <span className="text-[11px] font-extrabold text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200/80 shadow-2xs">
                                                {filteredBundles.length} Sets Ready
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expand / Collapse Toggle Button */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsBundlesExpanded(!isBundlesExpanded);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-extrabold text-xs shadow-2xs transition-all hover:scale-105 shrink-0"
                                    >
                                        <span>{isBundlesExpanded ? 'Hide Sets' : 'View Sets'}</span>
                                        {isBundlesExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-indigo-600 transition-transform" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-indigo-600 transition-transform" />
                                        )}
                                    </button>
                                </div>

                                {/* Collapsible Grid of Bundles */}
                                {isBundlesExpanded && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3.5 mt-3 border-t border-indigo-100/90 animate-in fade-in duration-200">
                                        {filteredBundles.map(bundle => (
                                            <div
                                                key={bundle.id}
                                                className="bg-white p-3.5 rounded-2xl border border-indigo-200/80 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all duration-200 flex flex-col justify-between relative overflow-hidden group"
                                            >
                                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
                                                <div>
                                                    <div className="flex items-center justify-between gap-1 mb-1.5">
                                                        <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/60 tracking-wider">
                                                            {bundle.targetClass || 'All Classes'} Set
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-500">
                                                            {bundle.selectedItemIds?.length || 0} Items
                                                        </span>
                                                    </div>
                                                    <h4 className="font-extrabold text-xs text-slate-900 line-clamp-2 mt-1 leading-snug group-hover:text-indigo-600 transition-colors">
                                                        {bundle.title}
                                                    </h4>
                                                </div>
                                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                                    <div>
                                                        <span className="text-[10px] uppercase font-bold text-slate-400 block -mb-0.5">Bundle</span>
                                                        <span className="text-xs font-black text-emerald-600">
                                                            PKR {bundle.bundlePrice}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => addToCart(bundle, true)}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs shadow-emerald-500/20 group-hover:scale-105 transition-all"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        <span>Add Set</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Product Cards Grid */}
                        {filteredPosProducts.length === 0 ? (
                            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
                                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <h3 className="text-base font-bold text-slate-700">No products found</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                    Try adjusting your search query, class filter, or import standard class packages.
                                </p>
                                <button
                                    onClick={() => handleOpenTemplateModal(posClassFilter !== 'All' ? posClassFilter : 'Class 1')}
                                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span>Import Class Package Template</span>
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
                                {filteredPosProducts.map(product => {
                                    const isOutOfStock = product.stock <= 0;
                                    const isLowStock = product.stock > 0 && product.stock <= (product.lowStockThreshold || 5);

                                    // Theme config based on product category
                                    let theme = {
                                        cardBg: 'bg-gradient-to-b from-blue-50/50 via-white to-indigo-50/20 border-blue-200/90 hover:border-blue-400',
                                        accentBar: 'bg-gradient-to-r from-blue-500 to-indigo-600',
                                        iconBg: 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-blue-500/25',
                                        badgeBg: 'bg-blue-100/90 text-blue-800 border-blue-200/80',
                                        badgeLabel: 'Book / Syllabus',
                                        btnBg: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25',
                                        IconComponent: BookOpen
                                    };

                                    if (product.category === 'uniform') {
                                        theme = {
                                            cardBg: 'bg-gradient-to-b from-purple-50/50 via-white to-fuchsia-50/20 border-purple-200/90 hover:border-purple-400',
                                            accentBar: 'bg-gradient-to-r from-purple-500 to-pink-600',
                                            iconBg: 'bg-gradient-to-tr from-purple-600 to-pink-600 text-white shadow-purple-500/25',
                                            badgeBg: 'bg-purple-100/90 text-purple-800 border-purple-200/80',
                                            badgeLabel: 'Uniform',
                                            btnBg: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/25',
                                            IconComponent: Shirt
                                        };
                                    } else if (product.category === 'stationery') {
                                        theme = {
                                            cardBg: 'bg-gradient-to-b from-amber-50/50 via-white to-orange-50/20 border-amber-200/90 hover:border-amber-400',
                                            accentBar: 'bg-gradient-to-r from-amber-500 to-orange-500',
                                            iconBg: 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-amber-500/25',
                                            badgeBg: 'bg-amber-100/90 text-amber-800 border-amber-200/80',
                                            badgeLabel: 'Stationery',
                                            btnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/25',
                                            IconComponent: Tag
                                        };
                                    } else if (product.category === 'bundle') {
                                        theme = {
                                            cardBg: 'bg-gradient-to-b from-emerald-50/50 via-white to-teal-50/20 border-emerald-200/90 hover:border-emerald-400',
                                            accentBar: 'bg-gradient-to-r from-emerald-500 to-teal-600',
                                            iconBg: 'bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-emerald-500/25',
                                            badgeBg: 'bg-emerald-100/90 text-emerald-800 border-emerald-200/80',
                                            badgeLabel: 'Bundle Set',
                                            btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25',
                                            IconComponent: Package
                                        };
                                    }

                                    const TheIcon = theme.IconComponent;

                                    return (
                                        <div
                                            key={product.id}
                                            onClick={() => !isOutOfStock && addToCart(product, false)}
                                            className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between cursor-pointer select-none group relative overflow-hidden p-3.5 shadow-xs ${
                                                isOutOfStock
                                                    ? 'opacity-60 border-slate-200 bg-slate-50 cursor-not-allowed'
                                                    : `${theme.cardBg} hover:-translate-y-0.5 hover:shadow-md`
                                            }`}
                                        >
                                            {/* Solid Top Accent Bar */}
                                            <div className={`absolute top-0 left-0 right-0 h-1.5 ${isOutOfStock ? 'bg-slate-300' : theme.accentBar}`} />

                                            <div>
                                                {/* Header: Solid Modern Category Icon + Badge + Stock status */}
                                                <div className="flex items-start justify-between gap-2 mb-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-xs transition-transform duration-200 group-hover:scale-105 shrink-0 ${
                                                            isOutOfStock ? 'bg-slate-200 text-slate-400' : theme.iconBg
                                                        }`}>
                                                            <TheIcon className="w-5 h-5" />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border w-fit ${theme.badgeBg}`}>
                                                                {theme.badgeLabel}
                                                            </span>
                                                            {product.targetClass && (
                                                                <span className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
                                                                    {product.targetClass}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                                                        isOutOfStock
                                                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                                            : isLowStock
                                                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                    }`}>
                                                        {isOutOfStock ? 'Out of Stock' : `${product.stock} in stock`}
                                                    </span>
                                                </div>

                                                {/* Product Title */}
                                                <h4 className="font-extrabold text-xs md:text-sm text-slate-900 line-clamp-2 group-hover:text-indigo-600 transition-colors leading-snug">
                                                    {product.name}
                                                </h4>

                                                {/* Meta Details (Publisher / Size / SKU) */}
                                                <div className="mt-1.5 text-[11px] text-slate-500 font-medium line-clamp-1">
                                                    {product.category === 'uniform'
                                                        ? `${product.uniformType || 'Uniform'} ${product.size ? `• ${product.size}` : ''} ${product.gender ? `• ${product.gender}` : ''}`
                                                        : (product.publisher || product.sku || 'Standard Edition')}
                                                </div>
                                            </div>

                                            {/* Price & Action Button */}
                                            <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-slate-100/90">
                                                <div>
                                                    <span className="text-[10px] uppercase font-black text-slate-400 block -mb-0.5 tracking-wider">Price</span>
                                                    <span className="text-sm font-black text-slate-900 tracking-tight">
                                                        PKR {product.sellingPrice}
                                                    </span>
                                                </div>
                                                <button
                                                    disabled={isOutOfStock}
                                                    className={`h-8 px-3 rounded-xl flex items-center justify-center gap-1 text-xs font-bold transition-all duration-150 shadow-xs ${
                                                        isOutOfStock
                                                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                            : `${theme.btnBg} group-hover:scale-105 active:scale-95`
                                                    }`}
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    <span>Add</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Right: Sticky POS Register / Cart (4 Cols) */}
                    <div className="lg:col-span-4 sticky top-4 space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-lg shadow-slate-100 overflow-hidden flex flex-col">
                            {/* Register Header */}
                            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ShoppingCart className="w-5 h-5 text-indigo-400" />
                                    <span className="font-black text-sm tracking-tight">Active Register</span>
                                </div>
                                {cart.length > 0 && (
                                    <button
                                        onClick={clearCart}
                                        className="text-xs text-rose-300 hover:text-rose-100 font-bold transition-colors"
                                    >
                                        Clear Cart
                                    </button>
                                )}
                            </div>

                            {/* Cart Items List */}
                            <div className="p-4 max-h-[340px] overflow-y-auto divide-y divide-slate-100 space-y-2">
                                {cart.length === 0 ? (
                                    <div className="py-10 text-center text-slate-400">
                                        <ShoppingCart className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                                        <p className="text-xs font-bold text-slate-600">Register is empty</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            Tap items from catalog or select a class kit
                                        </p>
                                    </div>
                                ) : (
                                    cart.map((cartItem, idx) => (
                                        <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <h5 className="text-xs font-bold text-slate-900 truncate">
                                                    {cartItem.name}
                                                </h5>
                                                <div className="text-[11px] text-slate-500">
                                                    PKR {cartItem.price} {cartItem.size ? `• ${cartItem.size}` : ''}
                                                </div>
                                            </div>

                                            {/* Quantity Stepper */}
                                            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                                                <button
                                                    onClick={() => updateCartQty(idx, cartItem.quantity - 1)}
                                                    className="w-5 h-5 rounded bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shadow-2xs"
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="w-6 text-center text-xs font-black text-slate-900">
                                                    {cartItem.quantity}
                                                </span>
                                                <button
                                                    onClick={() => updateCartQty(idx, cartItem.quantity + 1)}
                                                    className="w-5 h-5 rounded bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shadow-2xs"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>

                                            <div className="text-right min-w-[65px]">
                                                <div className="text-xs font-black text-slate-900">
                                                    PKR {cartItem.price * cartItem.quantity}
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(idx)}
                                                    className="text-[10px] text-rose-500 hover:text-rose-700 font-bold"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Cart Summary & Calculations */}
                            {cart.length > 0 && (
                                <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between text-slate-600 font-medium">
                                            <span>Subtotal ({cart.reduce((a, b) => a + b.quantity, 0)} items)</span>
                                            <span className="font-bold text-slate-800">PKR {cartSubtotal}</span>
                                        </div>

                                        {/* Discount Input */}
                                        <div className="flex items-center justify-between gap-2 pt-1">
                                            <span className="text-slate-600 font-medium">Discount (PKR)</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={discount || ''}
                                                placeholder="0"
                                                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                                                className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-right text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>

                                        <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                                            <span className="text-sm font-black text-slate-900">Net Total</span>
                                            <span className="text-lg font-black text-emerald-600">PKR {cartTotal}</span>
                                        </div>
                                    </div>

                                    {/* Checkout Trigger Button */}
                                    <button
                                        onClick={() => setCheckoutModalOpen(true)}
                                        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        <span>Proceed to Checkout</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 2 & 3: INVENTORY MANAGER (BOOKS & UNIFORM) */}
            {/* ========================================================= */}
            {(activeTab === 'books_stationery' || activeTab === 'uniform') && (
                <div className="space-y-6">
                    {/* Top KPI Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                        {[
                            {
                                label: 'Total SKUs',
                                value: `${filteredInventoryItems.length} Items`,
                                subValue: 'Active Catalog',
                                icon: Package,
                                gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                                shadow: 'rgba(99, 102, 241, 0.4)'
                            },
                            {
                                label: 'Total Stock Units',
                                value: `${filteredInventoryItems.reduce((acc, it) => acc + (Number(it.stock) || 0), 0)} Units`,
                                subValue: 'In Inventory',
                                icon: TrendingUp,
                                gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                                shadow: 'rgba(16, 185, 129, 0.4)'
                            },
                            {
                                label: 'Stock Valuation',
                                value: `PKR ${filteredInventoryItems.reduce((acc, it) => acc + ((Number(it.stock) || 0) * (Number(it.costPrice) || Number(it.sellingPrice) || 0)), 0).toLocaleString()}`,
                                subValue: 'Asset Value',
                                icon: DollarSign,
                                gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                                shadow: 'rgba(139, 92, 246, 0.4)'
                            },
                            {
                                label: 'Low Stock Warnings',
                                value: `${filteredInventoryItems.filter(it => (Number(it.stock) || 0) <= (it.lowStockThreshold || 5)).length} SKUs`,
                                subValue: 'Action Needed',
                                icon: AlertTriangle,
                                gradient: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
                                shadow: 'rgba(244, 63, 94, 0.4)'
                            }
                        ].map((stat, i) => {
                            const Icon = stat.icon;
                            return (
                                <div
                                    key={i}
                                    className="rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
                                    style={{
                                        background: stat.gradient,
                                        color: 'white',
                                        boxShadow: `0 15px 25px -5px ${stat.shadow}`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        minHeight: '140px'
                                    }}
                                >
                                    {/* 2D Geometric Decorative Shape */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '-15%',
                                            right: '-10%',
                                            width: '120px',
                                            height: '120px',
                                            background: 'rgba(255, 255, 255, 0.12)',
                                            borderRadius: '30px',
                                            transform: 'rotate(20deg)',
                                            zIndex: 1
                                        }}
                                    />

                                    <div className="flex items-center justify-between relative z-10">
                                        <div
                                            style={{
                                                width: '46px',
                                                height: '46px',
                                                borderRadius: '14px',
                                                background: 'rgba(255, 255, 255, 0.2)',
                                                backdropFilter: 'blur(10px)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: '1px solid rgba(255, 255, 255, 0.3)'
                                            }}
                                        >
                                            <Icon size={24} color="white" />
                                        </div>
                                        {stat.subValue && (
                                            <span
                                                style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    background: 'rgba(255, 255, 255, 0.2)',
                                                    padding: '3px 10px',
                                                    borderRadius: '8px',
                                                    backdropFilter: 'blur(6px)',
                                                    border: '1px solid rgba(255, 255, 255, 0.25)'
                                                }}
                                            >
                                                {stat.subValue}
                                            </span>
                                        )}
                                    </div>

                                    <div className="relative z-10 mt-3">
                                        <p className="text-xs font-semibold text-white/85 uppercase tracking-wider mb-1">
                                            {stat.label}
                                        </p>
                                        <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                                            {stat.value}
                                        </h3>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
                        <div className="flex flex-1 items-center gap-3 w-full">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search by title, publisher, uniform size, SKU barcode..."
                                    value={invSearch}
                                    onChange={(e) => setInvSearch(e.target.value)}
                                    className="w-full pl-9 pr-3.5 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs md:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>

                            <select
                                value={invClassFilter}
                                onChange={(e) => setInvClassFilter(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="All">All Target Classes</option>
                                {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                            <button
                                onClick={() => setInvLowStockOnly(!invLowStockOnly)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                                    invLowStockOnly
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Low Stock Only</span>
                            </button>

                            <button
                                onClick={() => handleOpenItemModal()}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-200 flex items-center gap-1.5"
                            >
                                <Plus className="w-4 h-4" />
                                <span>New Item</span>
                            </button>
                        </div>
                    </div>

                    {/* Modern Inventory Table */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-black tracking-wider text-[10px]">
                                        <th className="py-3.5 px-4">Item Details</th>
                                        <th className="py-3.5 px-4">Category & Class</th>
                                        <th className="py-3.5 px-4">Cost Price</th>
                                        <th className="py-3.5 px-4">Selling Price</th>
                                        <th className="py-3.5 px-4">Margin</th>
                                        <th className="py-3.5 px-4">Stock Status</th>
                                        <th className="py-3.5 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredInventoryItems.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="py-12 text-center text-slate-400">
                                                <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                                                <p className="text-sm font-bold text-slate-600">No inventory records found</p>
                                                <p className="text-xs text-slate-400 mt-1">Add items or adjust your search filter</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredInventoryItems.map((item) => {
                                            const isLow = Number(item.stock) <= (item.lowStockThreshold || 5);
                                            const cost = Number(item.costPrice) || 0;
                                            const sell = Number(item.sellingPrice) || 0;
                                            const margin = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;

                                            return (
                                                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                                                    <td className="py-3.5 px-4">
                                                        <div className="font-bold text-slate-900 text-xs md:text-sm">
                                                            {item.name}
                                                        </div>
                                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                                            {item.sku ? `SKU: ${item.sku}` : ''} {item.publisher ? `• ${item.publisher}` : ''}
                                                            {item.size ? `• Size: ${item.size}` : ''}
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px]">
                                                                {item.category}
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                                                                {item.targetClass || 'General'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4 font-bold text-slate-600">
                                                        PKR {cost}
                                                    </td>
                                                    <td className="py-3.5 px-4 font-black text-slate-900">
                                                        PKR {sell}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                                                            margin >= 25 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                                                        }`}>
                                                            {margin}%
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-2.5 py-1 rounded-lg font-black text-[11px] ${
                                                                Number(item.stock) === 0
                                                                    ? 'bg-rose-100 text-rose-700'
                                                                    : isLow
                                                                    ? 'bg-amber-100 text-amber-800'
                                                                    : 'bg-emerald-100 text-emerald-800'
                                                            }`}>
                                                                {item.stock} in stock
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {/* Quick Restock */}
                                                            <button
                                                                onClick={() => {
                                                                    setRestockItem(item);
                                                                    setRestockQuantity(10);
                                                                    setRestockModalOpen(true);
                                                                }}
                                                                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] transition-colors"
                                                                title="Quick restock"
                                                            >
                                                                + Restock
                                                            </button>

                                                            {/* Edit */}
                                                            <button
                                                                onClick={() => handleOpenItemModal(item)}
                                                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                                title="Edit Item"
                                                            >
                                                                <Edit className="w-3.5 h-3.5" />
                                                            </button>

                                                            {/* Delete */}
                                                            <button
                                                                onClick={() => handleDeleteItem(item)}
                                                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                                                                title="Delete Item"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 4: CLASS SETS & BUNDLES STUDIO */}
            {/* ========================================================= */}
            {activeTab === 'bundles' && (
                <div className="space-y-6">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Class Package Bundles</h2>
                            <p className="text-xs text-slate-500">
                                Pre-packaged kits for fast POS checkout during session admissions
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleOpenTemplateModal('Class 1')}
                                className="px-3.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-xs font-bold"
                            >
                                <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                                Import Standard Kit
                            </button>
                            <button
                                onClick={() => {
                                    setBundleFormData({ title: '', targetClass: 'Class 1', bundlePrice: 0, selectedItemIds: [] });
                                    setBundleModalOpen(true);
                                }}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                            >
                                <Plus className="w-3.5 h-3.5 inline mr-1" />
                                Custom Bundle
                            </button>
                        </div>
                    </div>

                    {bundles.length === 0 ? (
                        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
                            <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-slate-700">No class bundles created yet</h3>
                            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                Save time by importing ready-made academic packages (Books + Copies + Uniform) for all classes.
                            </p>
                            <button
                                onClick={() => handleOpenTemplateModal('Class 1')}
                                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                            >
                                Import Class 1 Template
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {bundles.map(bundle => {
                                const includedItems = items.filter(it => (bundle.selectedItemIds || []).includes(it.id));
                                const retailTotal = includedItems.reduce((acc, it) => acc + (Number(it.sellingPrice) || 0), 0);

                                return (
                                    <div key={bundle.id} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 font-black text-xs uppercase tracking-wider">
                                                    {bundle.targetClass}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteBundle(bundle)}
                                                    className="text-slate-400 hover:text-rose-600 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <h3 className="font-bold text-sm text-slate-900 line-clamp-1 mt-1">
                                                {bundle.title}
                                            </h3>

                                            <div className="mt-3 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <div className="text-[11px] font-bold text-slate-600 flex justify-between">
                                                    <span>Included Items:</span>
                                                    <span>{includedItems.length} SKUs</span>
                                                </div>
                                                <div className="text-[11px] text-slate-400 flex justify-between">
                                                    <span>Retail Value:</span>
                                                    <span>PKR {retailTotal}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                                            <div>
                                                <span className="text-[10px] text-slate-400 uppercase font-bold block">Package Price</span>
                                                <span className="text-base font-black text-emerald-600">PKR {bundle.bundlePrice}</span>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    addToCart(bundle, true);
                                                    setActiveTab('pos');
                                                }}
                                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1"
                                            >
                                                <ShoppingCart className="w-3.5 h-3.5" />
                                                <span>Sell Set</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 5: SALES LEDGER & RECEIPTS */}
            {/* ========================================================= */}
            {activeTab === 'sales' && (
                <div className="space-y-6">
                    {/* Revenue Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                        {[
                            {
                                label: 'Total Store Revenue',
                                value: `PKR ${kpiMetrics.totalRevenue.toLocaleString()}`,
                                subValue: `${kpiMetrics.totalSalesCount} Completed Orders`,
                                icon: ShoppingBag,
                                gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                                shadow: 'rgba(99, 102, 241, 0.4)'
                            },
                            {
                                label: "Today's Sales",
                                value: `PKR ${kpiMetrics.todayRevenue.toLocaleString()}`,
                                subValue: 'Live Counter Total',
                                icon: TrendingUp,
                                gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                                shadow: 'rgba(16, 185, 129, 0.4)'
                            },
                            {
                                label: 'Cash Collected',
                                value: `PKR ${kpiMetrics.totalCash.toLocaleString()}`,
                                subValue: 'Direct Register',
                                icon: DollarSign,
                                gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                                shadow: 'rgba(14, 165, 233, 0.4)'
                            },
                            {
                                label: 'Student Fee Ledgers',
                                value: `PKR ${kpiMetrics.totalLedger.toLocaleString()}`,
                                subValue: 'Challan Monthly Charge',
                                icon: Users,
                                gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                                shadow: 'rgba(139, 92, 246, 0.4)'
                            }
                        ].map((stat, i) => {
                            const Icon = stat.icon;
                            return (
                                <div
                                    key={i}
                                    className="rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
                                    style={{
                                        background: stat.gradient,
                                        color: 'white',
                                        boxShadow: `0 15px 25px -5px ${stat.shadow}`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        minHeight: '140px'
                                    }}
                                >
                                    {/* 2D Geometric Decorative Shape */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '-15%',
                                            right: '-10%',
                                            width: '120px',
                                            height: '120px',
                                            background: 'rgba(255, 255, 255, 0.12)',
                                            borderRadius: '30px',
                                            transform: 'rotate(20deg)',
                                            zIndex: 1
                                        }}
                                    />

                                    <div className="flex items-center justify-between relative z-10">
                                        <div
                                            style={{
                                                width: '46px',
                                                height: '46px',
                                                borderRadius: '14px',
                                                background: 'rgba(255, 255, 255, 0.2)',
                                                backdropFilter: 'blur(10px)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: '1px solid rgba(255, 255, 255, 0.3)'
                                            }}
                                        >
                                            <Icon size={24} color="white" />
                                        </div>
                                        {stat.subValue && (
                                            <span
                                                style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    background: 'rgba(255, 255, 255, 0.2)',
                                                    padding: '3px 10px',
                                                    borderRadius: '8px',
                                                    backdropFilter: 'blur(6px)',
                                                    border: '1px solid rgba(255, 255, 255, 0.25)'
                                                }}
                                            >
                                                {stat.subValue}
                                            </span>
                                        )}
                                    </div>

                                    <div className="relative z-10 mt-3">
                                        <p className="text-xs font-semibold text-white/85 uppercase tracking-wider mb-1">
                                            {stat.label}
                                        </p>
                                        <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                                            {stat.value}
                                        </h3>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Sales Filter Bar */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
                        <div className="flex flex-1 items-center gap-3 w-full">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search receipt #, customer name, student..."
                                    value={salesSearch}
                                    onChange={(e) => setSalesSearch(e.target.value)}
                                    className="w-full pl-9 pr-3.5 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs md:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>

                            {/* Date Filter */}
                            <select
                                value={salesDateFilter}
                                onChange={(e) => setSalesDateFilter(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-semibold text-slate-800 focus:outline-none"
                            >
                                <option value="all">All Dates</option>
                                <option value="today">Today Only</option>
                                <option value="week">Past 7 Days</option>
                                <option value="month">This Month</option>
                            </select>

                            {/* Payment Filter */}
                            <select
                                value={salesPaymentFilter}
                                onChange={(e) => setSalesPaymentFilter(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-semibold text-slate-800 focus:outline-none"
                            >
                                <option value="all">All Payments</option>
                                <option value="cash">Cash Only</option>
                                <option value="fee_ledger">Fee Ledger Only</option>
                            </select>
                        </div>
                    </div>

                    {/* Sales Audit Table */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-black tracking-wider text-[10px]">
                                        <th className="py-3.5 px-4">Receipt #</th>
                                        <th className="py-3.5 px-4">Date & Time</th>
                                        <th className="py-3.5 px-4">Customer / Student</th>
                                        <th className="py-3.5 px-4">Items Count</th>
                                        <th className="py-3.5 px-4">Payment Mode</th>
                                        <th className="py-3.5 px-4">Net Total</th>
                                        <th className="py-3.5 px-4 text-right">Receipt Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredSales.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="py-12 text-center text-slate-400">
                                                <BarChart3 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                                                <p className="text-sm font-bold text-slate-600">No sales transactions found</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSales.map((sale, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="py-3.5 px-4 font-black text-slate-900 font-mono">
                                                    {sale.receiptNo}
                                                </td>
                                                <td className="py-3.5 px-4 text-slate-600 font-medium">
                                                    {sale.createdAtFormatted || (sale.timestamp ? new Date(sale.timestamp).toLocaleString() : 'Recent')}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="font-bold text-slate-900">
                                                        {sale.customerName || (sale.studentInfo?.name) || 'Walk-in'}
                                                    </div>
                                                    {sale.studentInfo && (
                                                        <div className="text-[10px] text-indigo-600 font-semibold">
                                                            {sale.studentInfo.className} (Roll #{sale.studentInfo.rollNo || 'N/A'})
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 font-bold text-slate-700">
                                                    {(sale.items || []).reduce((a, b) => a + (Number(b.quantity) || 1), 0)} units
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`px-2.5 py-1 rounded-md font-bold text-[10px] uppercase ${
                                                        sale.paymentMode === 'fee_ledger'
                                                            ? 'bg-purple-100 text-purple-800'
                                                            : 'bg-emerald-100 text-emerald-800'
                                                    }`}>
                                                        {sale.paymentMode === 'fee_ledger' ? 'Fee Ledger' : 'Cash'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                                                    PKR {sale.finalAmount}
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => downloadReceiptPDF(sale)}
                                                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                                                            title="Download PDF Receipt"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                        </button>

                                                        <button
                                                            onClick={() => sendWhatsAppReceiptDirect(sale)}
                                                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-xs transition-colors"
                                                            title="Resend WhatsApp Receipt"
                                                        >
                                                            <MessageSquare className="w-3.5 h-3.5" />
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                setActiveReceipt(sale);
                                                                setReceiptModalOpen(true);
                                                            }}
                                                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs transition-colors"
                                                            title="View Slip"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 1: CHECKOUT & PAYMENT DIALOG */}
            {/* ========================================================= */}
            {checkoutModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Complete POS Checkout</h3>
                                <p className="text-xs text-slate-500">Choose payment method and customer details</p>
                            </div>
                            <button
                                onClick={() => setCheckoutModalOpen(false)}
                                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCheckoutSubmit} className="mt-4 space-y-4">
                            {/* Payment Mode Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Method</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMode('cash')}
                                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                                            paymentMode === 'cash'
                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        <DollarSign className="w-4 h-4" />
                                        <span>Cash / Walk-in</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPaymentMode('fee_ledger')}
                                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                                            paymentMode === 'fee_ledger'
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        <CreditCard className="w-4 h-4" />
                                        <span>Student Fee Ledger</span>
                                    </button>
                                </div>
                            </div>

                            {/* Mode Specific Inputs */}
                            {paymentMode === 'cash' ? (
                                <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer / Parent Name (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Muhammad Ali"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 mb-1">WhatsApp Number (For instant slip)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 03001234567"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100">
                                    <div>
                                        <label className="block text-[11px] font-bold text-indigo-900 mb-1">Select Student's Class</label>
                                        <select
                                            value={selectedClassId}
                                            onChange={(e) => setSelectedClassId(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800"
                                            required
                                        >
                                            <option value="">-- Choose Class --</option>
                                            {classesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    {selectedClassId && (
                                        <div>
                                            <label className="block text-[11px] font-bold text-indigo-900 mb-1">Select Student</label>
                                            <div className="relative mb-2">
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    placeholder="Search student name / roll no..."
                                                    value={studentSearchQuery}
                                                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                                                    className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs"
                                                />
                                            </div>

                                            <div className="max-h-36 overflow-y-auto space-y-1 bg-white p-2 rounded-xl border border-indigo-100">
                                                {loadingStudents ? (
                                                    <div className="py-4 text-center text-xs text-slate-400 font-medium">Loading students...</div>
                                                ) : classStudents.filter(s => s.name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) || s.rollNo?.toString().includes(studentSearchQuery)).length === 0 ? (
                                                    <div className="py-3 text-center text-xs text-slate-400 font-medium">No student matched</div>
                                                ) : (
                                                    classStudents
                                                        .filter(s => s.name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) || s.rollNo?.toString().includes(studentSearchQuery))
                                                        .map(st => (
                                                            <div
                                                                key={st.id}
                                                                onClick={() => setSelectedStudent(st)}
                                                                className={`p-2 rounded-lg cursor-pointer text-xs flex items-center justify-between transition-all ${
                                                                    selectedStudent?.id === st.id
                                                                        ? 'bg-indigo-600 text-white font-bold'
                                                                        : 'hover:bg-slate-50 text-slate-700'
                                                                }`}
                                                            >
                                                                <span>{st.name} (Roll #{st.rollNumber || st.rollNo || 'N/A'})</span>
                                                                {selectedStudent?.id === st.id && <Check className="w-3.5 h-3.5" />}
                                                            </div>
                                                        ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Order Total Overview */}
                            <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between">
                                <div>
                                    <span className="text-[11px] text-slate-400 block font-bold">Total Amount to Charge</span>
                                    <span className="text-lg font-black text-emerald-400">PKR {cartTotal}</span>
                                </div>
                                <div className="text-right text-[11px] text-slate-400">
                                    <span>{cart.reduce((a, b) => a + b.quantity, 0)} items</span>
                                </div>
                            </div>

                            {/* WhatsApp Option */}
                            <label className="flex items-center gap-2 cursor-pointer pt-1">
                                <input
                                    type="checkbox"
                                    checked={sendWhatsAppReceipt}
                                    onChange={(e) => setSendWhatsAppReceipt(e.target.checked)}
                                    className="rounded text-indigo-600"
                                />
                                <span className="text-xs font-semibold text-slate-700">Open WhatsApp Slip immediately after sale</span>
                            </label>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isSubmittingOrder}
                                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                <CheckCircle className="w-4 h-4" />
                                <span>{isSubmittingOrder ? 'Processing...' : 'Confirm & Generate Slip'}</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 2: RECEIPT VIEW & PRINT */}
            {/* ========================================================= */}
            {receiptModalOpen && activeReceipt && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="text-base font-black text-slate-900">Receipt Generated</h3>
                            <button onClick={() => setReceiptModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Slip Design Box */}
                        <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 font-mono text-xs space-y-3">
                            <div className="text-center pb-2 border-b border-slate-200">
                                <h4 className="font-black text-sm text-slate-900">{schoolInfo.name}</h4>
                                <p className="text-[10px] text-slate-500">{schoolInfo.address || 'Store Department'}</p>
                                <p className="text-[10px] text-slate-500">Phone: {schoolInfo.phone || 'N/A'}</p>
                            </div>

                            <div className="space-y-1 text-[11px]">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Receipt #:</span>
                                    <span className="font-bold text-slate-900">{activeReceipt.receiptNo}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Customer:</span>
                                    <span className="font-bold text-slate-900">{activeReceipt.customerName}</span>
                                </div>
                                {activeReceipt.studentInfo && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Student:</span>
                                        <span className="font-bold text-indigo-600">{activeReceipt.studentInfo.className} (Roll: {activeReceipt.studentInfo.rollNo})</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Payment:</span>
                                    <span className="font-bold text-slate-900 uppercase">{activeReceipt.paymentMode}</span>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="pt-2 border-t border-slate-200 space-y-1">
                                {(activeReceipt.items || []).map((it, idx) => (
                                    <div key={idx} className="flex justify-between text-[11px]">
                                        <span className="truncate pr-2">{it.quantity}x {it.name}</span>
                                        <span className="font-bold">PKR {it.total}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px]">
                                <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span>PKR {activeReceipt.subtotal}</span>
                                </div>
                                {activeReceipt.discount > 0 && (
                                    <div className="flex justify-between text-rose-600">
                                        <span>Discount:</span>
                                        <span>- PKR {activeReceipt.discount}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-300">
                                    <span>Net Total:</span>
                                    <span>PKR {activeReceipt.finalAmount}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2.5 mt-4">
                            <button
                                onClick={() => sendWhatsAppReceiptDirect(activeReceipt)}
                                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                            >
                                <MessageSquare className="w-4 h-4" />
                                <span>WhatsApp Slip</span>
                            </button>

                            <button
                                onClick={() => downloadReceiptPDF(activeReceipt)}
                                className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download PDF</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 3: ADD / EDIT INVENTORY ITEM */}
            {/* ========================================================= */}
            {itemModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="text-base font-black text-slate-900">
                                {editingItem ? 'Edit Store Item' : 'Add New Store Item'}
                            </h3>
                            <button onClick={() => setItemModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveItem} className="mt-4 space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Item Title / Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Oxford Progressive English 1"
                                    value={itemFormData.name}
                                    onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Category</label>
                                    <select
                                        value={itemFormData.category}
                                        onChange={(e) => setItemFormData({ ...itemFormData, category: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                                    >
                                        <option value="book">📚 Book</option>
                                        <option value="uniform">👔 Uniform</option>
                                        <option value="stationery">✏️ Stationery / Item</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Target Class</label>
                                    <select
                                        value={itemFormData.targetClass}
                                        onChange={(e) => setItemFormData({ ...itemFormData, targetClass: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                                    >
                                        {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Category Specific Fields */}
                            {itemFormData.category === 'uniform' ? (
                                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                                    <div>
                                        <label className="block font-bold text-slate-600 mb-1 text-[10px]">Uniform Type</label>
                                        <select
                                            value={itemFormData.uniformType}
                                            onChange={(e) => setItemFormData({ ...itemFormData, uniformType: e.target.value })}
                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                        >
                                            {UNIFORM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block font-bold text-slate-600 mb-1 text-[10px]">Size</label>
                                        <select
                                            value={itemFormData.size}
                                            onChange={(e) => setItemFormData({ ...itemFormData, size: e.target.value })}
                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                        >
                                            {UNIFORM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block font-bold text-slate-600 mb-1 text-[10px]">Gender</label>
                                        <select
                                            value={itemFormData.gender}
                                            onChange={(e) => setItemFormData({ ...itemFormData, gender: e.target.value })}
                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                        >
                                            <option value="Unisex">Unisex</option>
                                            <option value="Boys">Boys</option>
                                            <option value="Girls">Girls</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Publisher / Brand</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Oxford University Press / PTB"
                                        value={itemFormData.publisher}
                                        onChange={(e) => setItemFormData({ ...itemFormData, publisher: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                                    />
                                </div>
                            )}

                            {/* Pricing & Stock Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Cost (PKR)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={itemFormData.costPrice}
                                        onChange={(e) => setItemFormData({ ...itemFormData, costPrice: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Selling (PKR)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={itemFormData.sellingPrice}
                                        onChange={(e) => setItemFormData({ ...itemFormData, sellingPrice: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-600"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Stock Qty</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={itemFormData.stock}
                                        onChange={(e) => setItemFormData({ ...itemFormData, stock: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Low Alert Qty</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={itemFormData.lowStockThreshold}
                                        onChange={(e) => setItemFormData({ ...itemFormData, lowStockThreshold: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-rose-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">SKU / Barcode Code (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. SKU-CLS1-ENG-01"
                                    value={itemFormData.sku}
                                    onChange={(e) => setItemFormData({ ...itemFormData, sku: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all"
                            >
                                {editingItem ? 'Save Changes' : 'Add to Inventory'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 4: QUICK RESTOCK DIALOG */}
            {/* ========================================================= */}
            {restockModalOpen && restockItem && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="text-sm font-black text-slate-900">Quick Restock</h3>
                            <button onClick={() => setRestockModalOpen(false)} className="p-1 text-slate-400">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleRestockSubmit} className="mt-3 space-y-3 text-xs">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <span className="font-bold text-slate-800 block text-xs">{restockItem.name}</span>
                                <span className="text-[11px] text-slate-500">Current Stock: {restockItem.stock} units</span>
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Units to Add</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={restockQuantity}
                                    onChange={(e) => setRestockQuantity(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-900"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                            >
                                Confirm Restock (+{restockQuantity} Units)
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 5: 1-CLICK CLASS TEMPLATE LOADER */}
            {/* ========================================================= */}
            {templateModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-black text-slate-900">1-Click Syllabus & Kit Loader</h3>
                                <p className="text-xs text-slate-500">Load standard books, copies, and uniform for session start</p>
                            </div>
                            <button onClick={() => setTemplateModalOpen(false)} className="p-1 text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Class Selector Carousel */}
                        <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-2">
                            {Object.keys(STANDARD_CLASS_TEMPLATES).map(cls => (
                                <button
                                    key={cls}
                                    type="button"
                                    onClick={() => handleSelectTemplateClass(cls)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                                        selectedTemplateClass === cls
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {cls}
                                </button>
                            ))}
                        </div>

                        {/* Items Checklist */}
                        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                            {templateDraftItems.map((draft, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => handleToggleDraftItem(idx)}
                                    className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition-all ${
                                        draft.selected
                                            ? 'bg-indigo-50/70 border-indigo-200 text-slate-900 font-medium'
                                            : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={draft.selected}
                                            onChange={() => {}}
                                            className="rounded text-indigo-600"
                                        />
                                        <div>
                                            <span className="font-bold">{draft.name}</span>
                                            <span className="text-[10px] text-slate-500 block">
                                                {draft.category} {draft.size ? `• ${draft.size}` : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="font-black text-emerald-600">PKR {draft.sellingPrice}</span>
                                </div>
                            ))}
                        </div>

                        {/* Import Summary & Button */}
                        <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-slate-700">
                                    {templateTotals.count} items selected
                                </span>
                                <span className="text-xs text-slate-400 block">
                                    Package Total: PKR {templateTotals.totalSelling}
                                </span>
                            </div>

                            <button
                                onClick={() => handleImportTemplateKit(true)}
                                disabled={isImportingTemplate}
                                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-200 transition-all disabled:opacity-50"
                            >
                                {isImportingTemplate ? 'Loading Template...' : `Import Kit & Create ${selectedTemplateClass} Bundle`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Store;
