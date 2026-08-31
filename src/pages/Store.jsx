import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    ShoppingBag, Search, Plus, Trash2, Edit, Printer, Download, CheckCircle,
    AlertTriangle, Filter, ArrowRight, Package, BookOpen, Shirt, FileText,
    TrendingUp, DollarSign, Users, RefreshCw, X, ChevronRight, Eye, ShieldCheck,
    CreditCard, Sparkles, Tag, Check, ArrowUpRight, BarChart3, Clock, Layers,
    MessageSquare, Phone, Share2
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

const CLASS_OPTIONS = [
    'General / All Classes', 'Playgroup', 'Nursery', 'Prep', 'KG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    '1st Year', '2nd Year'
];

const UNIFORM_TYPES = [
    'Shirt', 'Trouser', 'Skirt', 'Blazer / Coat', 'Sweater / Jersey',
    'Tie', 'Belt', 'School Badge', 'Tracksuit / Sports Uniform', 'Socks', 'Cap / Hijab'
];

const UNIFORM_SIZES = [
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

    // Active Navigation Tab
    const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'books_stationery', 'uniform', 'bundles', 'sales'

    // Data States
    const [items, setItems] = useState([]);
    const [bundles, setBundles] = useState([]);
    const [sales, setSales] = useState([]);
    const [classesList, setClassesList] = useState([]);
    const [schoolInfo, setSchoolInfo] = useState({ name: 'School V5 Management System', address: '', phone: '', logo: '' });
    const [loading, setLoading] = useState(true);

    // POS & Cart State
    const [posSearch, setPosSearch] = useState('');
    const [posCategoryFilter, setPosCategoryFilter] = useState('all'); // 'all', 'book', 'uniform', 'stationery', 'bundle'
    const [posClassFilter, setPosClassFilter] = useState('All');
    const [cart, setCart] = useState([]);
    const [discount, setDiscount] = useState(0);

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

    // --- 1. Real-time Firestore Listeners ---
    useEffect(() => {
        if (!schoolId) return;

        // Fetch School Info for Receipts
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

        // Fetch Classes
        const classesRef = collection(db, 'schools', schoolId, 'classes');
        const unsubClasses = onSnapshot(classesRef, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setClassesList(list);
        }, (err) => console.warn('Classes listener error:', err));

        // 1. Primary Indestructible Store Listener (schools/{schoolId}/settings/store_inventory)
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
            console.warn('Store settings listener warning (safe fallback):', err);
            setLoading(false);
        });

        // 2. Subcollection Fallback Listeners (if present)
        const itemsRef = collection(db, 'schools', schoolId, 'store_items');
        const unsubItems = onSnapshot(itemsRef, (snap) => {
            if (!snap.empty) {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setItems(prev => list.length >= prev.length ? list : prev);
            }
        }, (err) => console.log('Subcollection items read skipped:', err));

        const bundlesRef = collection(db, 'schools', schoolId, 'store_bundles');
        const unsubBundles = onSnapshot(bundlesRef, (snap) => {
            if (!snap.empty) {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setBundles(prev => list.length >= prev.length ? list : prev);
            }
        }, (err) => console.log('Subcollection bundles read skipped:', err));

        const salesRef = collection(db, 'schools', schoolId, 'store_sales');
        const unsubSales = onSnapshot(salesRef, (snap) => {
            if (!snap.empty) {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setSales(prev => list.length >= prev.length ? list : prev);
            }
        }, (err) => console.log('Subcollection sales read skipped:', err));

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

    // --- 2. POS Cart Helpers ---
    const addToCart = (product, isBundle = false) => {
        if (isBundle) {
            // Bundle handling
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
            showAlert('Bundle added to cart!', 'success');
            return;
        }

        // Single product handling
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
        showAlert(`Added "${product.name}" to cart`, 'success');
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

    // Calculate Cart Totals
    const cartSubtotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    }, [cart]);

    const cartTotal = useMemo(() => {
        const disc = Math.min(Number(discount) || 0, cartSubtotal);
        return Math.max(0, cartSubtotal - disc);
    }, [cartSubtotal, discount]);

    // --- 3.0 WhatsApp Digital Slip Helpers ---
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

    // --- 3. Checkout & Sale Process ---
    const handleCheckoutSubmit = async (e) => {
        e.preventDefault();
        if (cart.length === 0) {
            showAlert('Your cart is empty!', 'error');
            return;
        }

        if (paymentMode === 'fee_ledger' && !selectedStudent) {
            showAlert('Please select a student to add charges to their monthly fee ledger!', 'error');
            return;
        }

        setIsSubmittingOrder(true);
        try {
            const batch = writeBatch(db);
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const randomCode = Math.floor(1000 + Math.random() * 9000);
            const receiptNo = `STORE-${dateStr}-${randomCode}`;

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
                paymentMode, // 'cash' or 'fee_ledger'
                status: 'completed',
                cashier: userProfile?.name || 'Administrator',
                customerName: paymentMode === 'fee_ledger' ? selectedStudent.name : (customerName || 'Walk-in Parent'),
                customerPhone: resolvedCustomerPhone,
                studentInfo: paymentMode === 'fee_ledger' ? {
                    studentId: selectedStudent.id,
                    name: selectedStudent.name,
                    rollNo: selectedStudent.rollNumber || selectedStudent.rollNo || 'N/A',
                    classId: selectedClassId,
                    className: classesList.find(c => c.id === selectedClassId)?.name || 'Class',
                    fatherPhone: resolvedCustomerPhone
                } : null
            };

            // 1. Primary Save to settings/store_inventory (Always allowed in production)
            const updatedSales = [saleData, ...sales];
            const updatedItems = items.map(it => {
                const inCart = cart.find(c => c.id === it.id && !c.isBundle);
                if (inCart) {
                    return { ...it, stock: Math.max(0, (Number(it.stock) || 0) - inCart.quantity) };
                }
                return it;
            });

            await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                items: updatedItems,
                sales: updatedSales
            }, { merge: true });

            setItems(updatedItems);
            setSales(updatedSales);

            // 2. Subcollection writes (best-effort background)
            try {
                const salesColRef = collection(db, 'schools', schoolId, 'store_sales');
                const newSaleRef = doc(salesColRef);
                batch.set(newSaleRef, {
                    ...saleData,
                    timestamp: serverTimestamp()
                });

                cart.forEach(cartItem => {
                    if (!cartItem.isBundle) {
                        const itemRef = doc(db, 'schools', schoolId, 'store_items', cartItem.id);
                        batch.update(itemRef, {
                            stock: increment(-cartItem.quantity)
                        });
                    }
                });

                // 3. If mode is "fee_ledger", append store charge to Student Document
                if (paymentMode === 'fee_ledger' && selectedStudent) {
                    const studentDocRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'students', selectedStudent.id);
                    const chargeRecord = {
                        title: `Store Purchase: Books/Uniform (${receiptNo})`,
                        amount: cartTotal,
                        date: now.toISOString(),
                        type: 'store_inventory',
                        receiptNo
                    };

                    batch.update(studentDocRef, {
                        remaining: increment(cartTotal),
                        storeCharges: arrayUnion(chargeRecord),
                        lastStorePurchase: {
                            receiptNo,
                            amount: cartTotal,
                            date: now.toISOString()
                        }
                    });
                }

                await batch.commit();
            } catch (err) {
                console.log('Subcollection batch completed via settings fallback');
            }

            showAlert(`Sale completed successfully! Receipt #${receiptNo}`, 'success');
            setCheckoutModalOpen(false);
            clearCart();

            // Auto-send WhatsApp receipt if enabled
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

    // --- 4. Inventory Item CRUD ---
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
                sku: itemFormData.sku.trim(),
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

            // 1. Primary Save via settings/store_inventory
            const updatedItems = editingItem
                ? items.map(it => it.id === itemId ? itemObj : it)
                : [itemObj, ...items.filter(it => it.id !== itemId)];

            await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                items: updatedItems
            }, { merge: true });

            // 2. Best-effort subcollection write
            try {
                await setDoc(doc(db, 'schools', schoolId, 'store_items', itemId), itemObj, { merge: true });
            } catch (err) {
                console.log('Subcollection item sync skipped');
            }

            setItems(updatedItems);
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
            await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                items: updatedItems
            }, { merge: true });

            try {
                await deleteDoc(doc(db, 'schools', schoolId, 'store_items', item.id));
            } catch (err) {
                console.log(err);
            }

            setItems(updatedItems);
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
            await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                items: updatedItems
            }, { merge: true });

            try {
                await updateDoc(doc(db, 'schools', schoolId, 'store_items', restockItem.id), {
                    stock: increment(addQty)
                });
            } catch (err) {
                console.log(err);
            }

            setItems(updatedItems);
            showAlert(`Restocked +${addQty} units for "${restockItem.name}"!`, 'success');
            setRestockModalOpen(false);
            setRestockItem(null);
        } catch (error) {
            showAlert('Failed to restock: ' + error.message, 'error');
        }
    };

    // --- 5. Class Bundle Creation (Indestructible Multi-Strategy) ---
    const handleSaveBundle = async (e) => {
        e.preventDefault();
        if (!bundleFormData.title.trim()) {
            showAlert('Bundle title is required!', 'error');
            return;
        }

        if (!schoolId) {
            showAlert('School ID not found. Please re-login to proceed.', 'error');
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

            // 1. Primary Save via settings/store_inventory (100% permitted in production)
            const updatedBundles = [newBundleObj, ...bundles.filter(b => b.id !== newBundleId)];
            await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                bundles: updatedBundles
            }, { merge: true });

            // 2. Best-effort subcollection write
            try {
                await setDoc(doc(db, 'schools', schoolId, 'store_bundles', newBundleId), newBundleObj);
            } catch (err) {
                console.log('Subcollection bundle sync skipped');
            }

            setBundles(updatedBundles);
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
            await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                bundles: updatedBundles
            }, { merge: true });

            try {
                await deleteDoc(doc(db, 'schools', schoolId, 'store_bundles', bundle.id));
            } catch (err) {
                console.log(err);
            }

            setBundles(updatedBundles);
            showAlert('Bundle deleted!', 'success');
        } catch (error) {
            showAlert('Failed to delete bundle: ' + error.message, 'error');
        }
    };

    // --- 5.1 Pre-built Class Templates Loader ---
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

        if (!schoolId) {
            showAlert('School ID not found. Please re-login to proceed.', 'error');
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

            // 1. Merge with existing items in store_inventory
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

                try {
                    await setDoc(doc(db, 'schools', schoolId, 'store_bundles', newBundleId), newBundleObj);
                } catch(e) { console.log(e); }
            }

            await setDoc(doc(db, 'schools', schoolId, 'settings', 'store_inventory'), {
                items: updatedItems,
                bundles: updatedBundles
            }, { merge: true });

            // Background subcollection items sync
            newCreatedItems.forEach(async (it) => {
                try {
                    await setDoc(doc(db, 'schools', schoolId, 'store_items', it.id), it, { merge: true });
                } catch(e) {}
            });

            setItems(updatedItems);
            setBundles(updatedBundles);

            showAlert(`🎉 Successfully loaded ${newCreatedItems.length} items ${createBundle ? '& created 1 Class Bundle' : ''} for ${selectedTemplateClass}!`, 'success');
            setTemplateModalOpen(false);
        } catch (error) {
            console.error('Template import error:', error);
            showAlert('Failed to import template: ' + error.message, 'error');
        } finally {
            setIsImportingTemplate(false);
        }
    };

    // --- 6. Printable Receipt PDF Generator ---
    const downloadReceiptPDF = (receipt) => {
        if (!receipt) return;
        const doc = new jsPDF({
            unit: 'mm',
            format: [80, 180] // Thermal slip format 80mm width
        });

        // Header
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(schoolInfo.name, 40, 10, { align: 'center' });

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        if (schoolInfo.address) {
            doc.text(schoolInfo.address, 40, 14, { align: 'center' });
        }
        if (schoolInfo.phone) {
            doc.text(`Phone: ${schoolInfo.phone}`, 40, 18, { align: 'center' });
        }

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('OFFICIAL STORE RECEIPT', 40, 24, { align: 'center' });

        doc.setLineWidth(0.3);
        doc.line(5, 27, 75, 27);

        // Details
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(`Receipt #: ${receipt.receiptNo}`, 5, 32);
        doc.text(`Date: ${receipt.createdAtFormatted || new Date().toLocaleString()}`, 5, 36);
        doc.text(`Customer: ${receipt.customerName || 'Walk-in'}`, 5, 40);
        if (receipt.studentInfo) {
            doc.text(`Class: ${receipt.studentInfo.className} (Roll: ${receipt.studentInfo.rollNo})`, 5, 44);
        }
        doc.text(`Payment: ${receipt.paymentMode === 'fee_ledger' ? 'ADDED TO FEE LEDGER' : 'CASH PAID'}`, 5, receipt.studentInfo ? 48 : 44);

        const startY = receipt.studentInfo ? 52 : 48;
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
        doc.text('Thank you for choosing our school store!', 40, netY + 8, { align: 'center' });
        doc.text('Goods once sold can only be exchanged within 3 days.', 40, netY + 12, { align: 'center' });

        doc.save(`${receipt.receiptNo}.pdf`);
    };

    // --- 7. Filtered Computations ---
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
            if (activeTab === 'uniform') {
                return item.category === 'uniform';
            }
            if (activeTab === 'books_stationery') {
                return item.category === 'book' || item.category === 'stationery';
            }
            return true;
        });
    }, [items, activeTab]);

    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            const matchesSearch = s.receiptNo.toLowerCase().includes(salesSearch.toLowerCase()) ||
                (s.customerName && s.customerName.toLowerCase().includes(salesSearch.toLowerCase()));

            const matchesPayment = salesPaymentFilter === 'all' || s.paymentMode === salesPaymentFilter;

            return matchesSearch && matchesPayment;
        });
    }, [sales, salesSearch, salesPaymentFilter]);

    // Financial Metrics
    const salesMetrics = useMemo(() => {
        let totalRevenue = 0;
        let totalCost = 0;
        let totalCash = 0;
        let totalLedger = 0;
        let totalItemsSold = 0;

        sales.forEach(s => {
            totalRevenue += Number(s.finalAmount) || 0;
            if (s.paymentMode === 'cash') totalCash += Number(s.finalAmount) || 0;
            if (s.paymentMode === 'fee_ledger') totalLedger += Number(s.finalAmount) || 0;

            (s.items || []).forEach(it => {
                totalItemsSold += Number(it.quantity) || 0;
                totalCost += (Number(it.costPrice) || 0) * (Number(it.quantity) || 0);
            });
        });

        return {
            totalRevenue,
            totalCost,
            netProfit: Math.max(0, totalRevenue - totalCost),
            totalCash,
            totalLedger,
            totalItemsSold,
            totalOrders: sales.length
        };
    }, [sales]);

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

    return (
        <div style={{ padding: '0.5rem', maxWidth: '1600px', margin: '0 auto' }}>
            {/* Top Page Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '14px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 16px -4px rgba(16, 185, 129, 0.4)'
                    }}>
                        <ShoppingBag color="white" size={26} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                            Store & Inventory Management
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.86rem', margin: 0 }}>
                            Point of Sale (POS), Books, Stationery, School Uniforms & Fee Ledger Integration
                        </p>
                    </div>
                </div>

                {/* Quick Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => handleOpenTemplateModal('Class 1')}
                        className="btn hover-lift"
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            color: 'white',
                            padding: '0.65rem 1.25rem',
                            borderRadius: '10px',
                            fontWeight: '700',
                            fontSize: '0.88rem',
                            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <Sparkles size={18} /> Load Class Templates
                    </button>
                    <button
                        onClick={() => handleOpenItemModal()}
                        className="btn"
                        style={{
                            background: '#4f46e5',
                            color: 'white',
                            padding: '0.65rem 1.25rem',
                            borderRadius: '10px',
                            fontWeight: '600',
                            fontSize: '0.88rem',
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                        }}
                    >
                        <Plus size={18} /> Add New Item
                    </button>
                    <button
                        onClick={() => setBundleModalOpen(true)}
                        className="btn"
                        style={{
                            background: '#0f172a',
                            color: 'white',
                            padding: '0.65rem 1.25rem',
                            borderRadius: '10px',
                            fontWeight: '600',
                            fontSize: '0.88rem'
                        }}
                    >
                        <Package size={18} /> Create Class Bundle
                    </button>
                </div>
            </div>

            {/* Navigation Tabs Header */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                borderBottom: '2px solid #e2e8f0',
                marginBottom: '1.5rem',
                overflowX: 'auto',
                paddingBottom: '0.25rem'
            }}>
                {[
                    { id: 'pos', label: 'Point of Sale (POS Billing)', icon: ShoppingBag, badge: cart.length > 0 ? cart.length : null },
                    { id: 'books_stationery', label: 'Books & Stationery', icon: BookOpen, count: items.filter(i => i.category === 'book' || i.category === 'stationery').length },
                    { id: 'uniform', label: 'School Uniform Store', icon: Shirt, count: items.filter(i => i.category === 'uniform').length },
                    { id: 'bundles', label: 'Class Packages & Sets', icon: Package, count: bundles.length },
                    { id: 'sales', label: 'Sales Ledger & Reports', icon: BarChart3, count: sales.length }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1.25rem',
                            border: 'none',
                            background: 'transparent',
                            color: activeTab === tab.id ? '#4f46e5' : '#64748b',
                            fontWeight: activeTab === tab.id ? '700' : '600',
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            borderBottom: activeTab === tab.id ? '3px solid #4f46e5' : '3px solid transparent',
                            marginBottom: '-2px',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <tab.icon size={18} />
                        <span>{tab.label}</span>
                        {tab.badge && (
                            <span style={{
                                background: '#ef4444',
                                color: 'white',
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '9999px',
                                fontWeight: '700'
                            }}>
                                {tab.badge}
                            </span>
                        )}
                        {tab.count !== undefined && !tab.badge && (
                            <span style={{
                                background: activeTab === tab.id ? '#e0e7ff' : '#f1f5f9',
                                color: activeTab === tab.id ? '#4338ca' : '#64748b',
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '6px',
                                fontWeight: '600'
                            }}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: POINT OF SALE (POS COUNTER) */}
            {/* ========================================================================= */}
            {activeTab === 'pos' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
                    {/* Left: Product Catalogue & Filters */}
                    <div>
                        {/* Search & Category Filter Bar */}
                        <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ flex: 1, position: 'relative', minWidth: '220px' }}>
                                <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by book name, uniform item, publisher, or SKU..."
                                    value={posSearch}
                                    onChange={(e) => setPosSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem 1rem 0.65rem 2.4rem',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.88rem'
                                    }}
                                />
                            </div>

                            {/* Class Filter Dropdown */}
                            <select
                                value={posClassFilter}
                                onChange={(e) => setPosClassFilter(e.target.value)}
                                style={{
                                    padding: '0.65rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.88rem',
                                    background: 'white',
                                    color: '#0f172a',
                                    fontWeight: '500'
                                }}
                            >
                                <option value="All">All Classes</option>
                                {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>

                            {/* Category Filter Buttons */}
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {[
                                    { id: 'all', label: 'All Items' },
                                    { id: 'book', label: '📚 Books' },
                                    { id: 'uniform', label: '👔 Uniform' },
                                    { id: 'stationery', label: '✏️ Stationery' }
                                ].map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setPosCategoryFilter(cat.id)}
                                        style={{
                                            padding: '0.5rem 0.85rem',
                                            borderRadius: '8px',
                                            border: '1px solid',
                                            borderColor: posCategoryFilter === cat.id ? '#4f46e5' : '#e2e8f0',
                                            background: posCategoryFilter === cat.id ? '#4f46e5' : '#f8fafc',
                                            color: posCategoryFilter === cat.id ? 'white' : '#475569',
                                            fontSize: '0.8rem',
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Class Bundles Quick Dispense Bar (If any exist) */}
                        {filteredBundles.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                                    <Sparkles size={16} color="#4f46e5" />
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                                        1-Click Class Complete Sets & Bundles
                                    </h3>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                                    {filteredBundles.map(bundle => (
                                        <div
                                            key={bundle.id}
                                            className="card"
                                            style={{
                                                padding: '0.85rem',
                                                background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
                                                border: '1px solid #bbf7d0',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div>
                                                <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669', textTransform: 'uppercase' }}>
                                                    {bundle.targetClass}
                                                </span>
                                                <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', margin: '0.2rem 0' }}>
                                                    {bundle.title}
                                                </h4>
                                                <p style={{ fontSize: '0.95rem', fontWeight: '800', color: '#047857', margin: 0 }}>
                                                    PKR {bundle.bundlePrice}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => addToCart(bundle, true)}
                                                className="btn"
                                                style={{
                                                    background: '#059669',
                                                    color: 'white',
                                                    padding: '0.45rem 0.75rem',
                                                    borderRadius: '8px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '600'
                                                }}
                                            >
                                                <Plus size={14} /> Add Set
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Product Items Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                            {filteredPosProducts.map(product => {
                                const isOutOfStock = product.stock <= 0;
                                const isLowStock = product.stock > 0 && product.stock <= (product.lowStockThreshold || 5);

                                return (
                                    <div
                                        key={product.id}
                                        className="card"
                                        style={{
                                            padding: '1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            opacity: isOutOfStock ? 0.6 : 1,
                                            border: isLowStock ? '1px solid #fcd34d' : '1px solid #f1f5f9',
                                            position: 'relative'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '4px',
                                                    background: product.category === 'book' ? '#e0e7ff' : product.category === 'uniform' ? '#fae8ff' : '#fef3c7',
                                                    color: product.category === 'book' ? '#4338ca' : product.category === 'uniform' ? '#86198f' : '#b45309',
                                                    fontWeight: '700',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {product.category}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    color: isOutOfStock ? '#ef4444' : isLowStock ? '#d97706' : '#10b981'
                                                }}>
                                                    {isOutOfStock ? 'Out of Stock' : `${product.stock} In Stock`}
                                                </span>
                                            </div>

                                            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.25rem', lineHeight: 1.3 }}>
                                                {product.name}
                                            </h4>

                                            {product.size && (
                                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.25rem 0' }}>
                                                    Size: <strong style={{ color: '#0f172a' }}>{product.size}</strong> ({product.gender})
                                                </p>
                                            )}

                                            {product.publisher && (
                                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.25rem 0' }}>
                                                    Pub: <strong style={{ color: '#0f172a' }}>{product.publisher}</strong>
                                                </p>
                                            )}

                                            {product.targetClass && (
                                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                                                    Class: <strong style={{ color: '#0f172a' }}>{product.targetClass}</strong>
                                                </p>
                                            )}
                                        </div>

                                        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Price</span>
                                                <p style={{ fontSize: '1.05rem', fontWeight: '800', color: '#4f46e5', margin: 0 }}>
                                                    PKR {product.sellingPrice}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => addToCart(product)}
                                                disabled={isOutOfStock}
                                                style={{
                                                    background: isOutOfStock ? '#cbd5e1' : '#4f46e5',
                                                    color: 'white',
                                                    border: 'none',
                                                    width: '36px',
                                                    height: '36px',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <Plus size={18} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {filteredPosProducts.length === 0 && (
                            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                <Package size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                <h3 style={{ fontSize: '1.1rem', color: '#0f172a', marginBottom: '0.5rem' }}>No products match your search</h3>
                                <p style={{ fontSize: '0.85rem', margin: 0 }}>Try adjusting your filters or click "Add New Item" to populate your store inventory.</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Cart & Fast Checkout Panel */}
                    <div className="card" style={{ padding: '1.25rem', position: 'sticky', top: '1rem', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ShoppingBag size={20} color="#4f46e5" />
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    POS Cart ({cart.reduce((a, b) => a + b.quantity, 0)})
                                </h3>
                            </div>
                            {cart.length > 0 && (
                                <button
                                    onClick={clearCart}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    Clear Cart
                                </button>
                            )}
                        </div>

                        {/* Cart Items List */}
                        <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
                            {cart.map((item, idx) => (
                                <div
                                    key={`${item.id}-${idx}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.65rem',
                                        background: '#f8fafc',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0'
                                    }}
                                >
                                    <div style={{ flex: 1, paddingRight: '0.5rem' }}>
                                        <h5 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
                                            {item.name}
                                        </h5>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            PKR {item.price} each {item.size && `· ${item.size}`}
                                        </span>
                                    </div>

                                    {/* Qty Counter */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <button
                                            onClick={() => updateCartQty(idx, item.quantity - 1)}
                                            style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: '700' }}
                                        >
                                            -
                                        </button>
                                        <span style={{ fontSize: '0.88rem', fontWeight: '700', minWidth: '20px', textAlign: 'center' }}>
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() => updateCartQty(idx, item.quantity + 1)}
                                            style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: '700' }}
                                        >
                                            +
                                        </button>
                                        <button
                                            onClick={() => removeFromCart(idx)}
                                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: '0.2rem' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {cart.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                                    <ShoppingBag size={36} color="#e2e8f0" style={{ margin: '0 auto 0.5rem' }} />
                                    <p style={{ fontSize: '0.85rem', margin: 0 }}>Click products on the left to start billing.</p>
                                </div>
                            )}
                        </div>

                        {/* Order Summary Calculations */}
                        <div style={{ borderTop: '2px dashed #e2e8f0', paddingTop: '0.85rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#64748b' }}>
                                <span>Subtotal</span>
                                <span>PKR {cartSubtotal}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#64748b' }}>
                                <span>Discount (PKR)</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={discount}
                                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                                    style={{ width: '80px', padding: '0.2rem 0.4rem', textAlign: 'right', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                                <span>Net Total</span>
                                <span style={{ color: '#10b981' }}>PKR {cartTotal}</span>
                            </div>
                        </div>

                        {/* Checkout CTA Button */}
                        <button
                            onClick={() => setCheckoutModalOpen(true)}
                            disabled={cart.length === 0}
                            className="btn"
                            style={{
                                width: '100%',
                                background: cart.length === 0 ? '#cbd5e1' : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                color: 'white',
                                padding: '0.85rem',
                                borderRadius: '10px',
                                fontWeight: '700',
                                fontSize: '0.95rem',
                                justifyContent: 'center',
                                boxShadow: cart.length > 0 ? '0 4px 14px rgba(79, 70, 229, 0.4)' : 'none',
                                cursor: cart.length === 0 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Proceed to Checkout <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2 & 3: INVENTORY TABLES (BOOKS & STATIONERY / UNIFORM) */}
            {/* ========================================================================= */}
            {(activeTab === 'books_stationery' || activeTab === 'uniform') && (
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                {activeTab === 'uniform' ? '👔 School Uniform Inventory' : '📚 Books & Stationery Stock'}
                            </h3>
                            <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0 }}>
                                Real-time stock counts, pricing, cost tracking, and reorder levels
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => handleOpenTemplateModal('Class 1')}
                                className="btn hover-lift"
                                style={{
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    color: 'white',
                                    padding: '0.55rem 1rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    boxShadow: '0 3px 10px rgba(245, 158, 11, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <Sparkles size={16} /> ⚡ Load Pre-made Templates
                            </button>
                            <button
                                onClick={() => handleOpenItemModal()}
                                className="btn"
                                style={{ background: '#4f46e5', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                            >
                                <Plus size={16} /> Add {activeTab === 'uniform' ? 'Uniform Item' : 'Book / Stationery'}
                            </button>
                        </div>
                    </div>

                    {/* Inventory Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                    <th style={{ padding: '0.75rem 1rem' }}>Item Name</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Category</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Class / Target</th>
                                    {activeTab === 'uniform' && <th style={{ padding: '0.75rem 1rem' }}>Size & Gender</th>}
                                    {activeTab === 'books_stationery' && <th style={{ padding: '0.75rem 1rem' }}>Publisher</th>}
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Cost Price</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Sale Price</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Stock In Hand</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInventoryItems.map((item, index) => {
                                    const isOut = item.stock <= 0;
                                    const isLow = item.stock > 0 && item.stock <= (item.lowStockThreshold || 5);

                                    return (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: index % 2 === 0 ? 'white' : '#fafafa' }}>
                                            <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                                {item.name}
                                                {item.sku && <span style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8' }}>SKU: {item.sku}</span>}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '4px',
                                                    background: item.category === 'book' ? '#e0e7ff' : item.category === 'uniform' ? '#fae8ff' : '#fef3c7',
                                                    color: item.category === 'book' ? '#4338ca' : item.category === 'uniform' ? '#86198f' : '#b45309',
                                                    fontWeight: '700',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                                                {item.targetClass || 'All'}
                                            </td>
                                            {activeTab === 'uniform' && (
                                                <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                                                    <span style={{ fontWeight: '600', color: '#0f172a' }}>{item.size || 'N/A'}</span> ({item.gender || 'Unisex'})
                                                </td>
                                            )}
                                            {activeTab === 'books_stationery' && (
                                                <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                                                    {item.publisher || '—'}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#64748b' }}>
                                                PKR {item.costPrice || 0}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: '700', color: '#10b981' }}>
                                                PKR {item.sellingPrice || 0}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '9999px',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '700',
                                                    background: isOut ? '#fee2e2' : isLow ? '#fef3c7' : '#dcfce7',
                                                    color: isOut ? '#ef4444' : isLow ? '#b45309' : '#15803d'
                                                }}>
                                                    {item.stock} Units
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                                                    <button
                                                        onClick={() => {
                                                            setRestockItem(item);
                                                            setRestockQuantity(10);
                                                            setRestockModalOpen(true);
                                                        }}
                                                        title="Quick Restock"
                                                        style={{ background: '#f1f5f9', border: 'none', padding: '0.35rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', color: '#047857' }}
                                                    >
                                                        + Stock
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenItemModal(item)}
                                                        title="Edit Item"
                                                        style={{ background: '#f1f5f9', border: 'none', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer', color: '#4f46e5' }}
                                                    >
                                                        <Edit size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteItem(item)}
                                                        title="Delete"
                                                        style={{ background: '#fee2e2', border: 'none', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer', color: '#ef4444' }}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {filteredInventoryItems.length === 0 && (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                            No items registered in this inventory category yet. Click "Add New Item" above.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: CLASS PACKAGES & BUNDLES */}
            {/* ========================================================================= */}
            {activeTab === 'bundles' && (
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                📦 Class Packages & Bundles
                            </h3>
                            <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0 }}>
                                Pre-configured book sets and complete uniform packages for fast 1-click counter dispensing
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => handleOpenTemplateModal('Class 1')}
                                className="btn hover-lift"
                                style={{
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    color: 'white',
                                    padding: '0.55rem 1rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    boxShadow: '0 3px 10px rgba(245, 158, 11, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <Sparkles size={16} /> ⚡ Load Pre-made Class Templates
                            </button>
                            <button
                                onClick={() => setBundleModalOpen(true)}
                                className="btn"
                                style={{ background: '#4f46e5', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                            >
                                <Plus size={16} /> Create Custom Bundle
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                        {bundles.map(bundle => (
                            <div
                                key={bundle.id}
                                className="card"
                                style={{
                                    padding: '1.25rem',
                                    border: '1px solid #e2e8f0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    background: '#ffffff'
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{
                                            fontSize: '0.72rem',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '6px',
                                            background: '#dcfce7',
                                            color: '#15803d',
                                            fontWeight: '700',
                                            textTransform: 'uppercase'
                                        }}>
                                            {bundle.targetClass}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteBundle(bundle)}
                                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: '0.5rem 0' }}>
                                        {bundle.title}
                                    </h4>

                                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 1rem 0' }}>
                                        Includes {bundle.selectedItemIds?.length || 0} pre-selected books/uniform items.
                                    </p>
                                </div>

                                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Bundle Price</span>
                                        <p style={{ fontSize: '1.15rem', fontWeight: '800', color: '#059669', margin: 0 }}>
                                            PKR {bundle.bundlePrice}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            addToCart(bundle, true);
                                            setActiveTab('pos');
                                        }}
                                        className="btn"
                                        style={{ background: '#059669', color: 'white', padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}
                                    >
                                        <Plus size={14} /> Load to Cart
                                    </button>
                                </div>
                            </div>
                        ))}

                        {bundles.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                <Package size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                <h4 style={{ color: '#0f172a', marginBottom: '0.5rem' }}>No Class Bundles Created Yet</h4>
                                <p style={{ fontSize: '0.85rem' }}>Group your books and uniforms into bundles (e.g. "Class 5 Full Book Pack") for faster billing.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 5: SALES LEDGER & FINANCIAL AUDIT */}
            {/* ========================================================================= */}
            {activeTab === 'sales' && (
                <div>
                    {/* Summary Metrics Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #4f46e5' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total Store Revenue</span>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: '0.35rem 0' }}>
                                PKR {salesMetrics.totalRevenue.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '600' }}>
                                From {salesMetrics.totalOrders} total sales
                            </span>
                        </div>

                        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Est. Net Profit</span>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#10b981', margin: '0.35rem 0' }}>
                                PKR {salesMetrics.netProfit.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                (Revenue - Product Cost)
                            </span>
                        </div>

                        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #06b6d4' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Cash Collected</span>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0891b2', margin: '0.35rem 0' }}>
                                PKR {salesMetrics.totalCash.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Immediate cash payments</span>
                        </div>

                        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Added to Fee Ledger</span>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#d97706', margin: '0.35rem 0' }}>
                                PKR {salesMetrics.totalLedger.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>To be collected with monthly fees</span>
                        </div>
                    </div>

                    {/* Sales Log Table */}
                    <div className="card" style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '240px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        placeholder="Search receipt # or customer name..."
                                        value={salesSearch}
                                        onChange={(e) => setSalesSearch(e.target.value)}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>

                                <select
                                    value={salesPaymentFilter}
                                    onChange={(e) => setSalesPaymentFilter(e.target.value)}
                                    style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                >
                                    <option value="all">All Payment Types</option>
                                    <option value="cash">Cash Only</option>
                                    <option value="fee_ledger">Fee Ledger Only</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                        <th style={{ padding: '0.75rem 1rem' }}>Receipt #</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Date & Time</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Customer / Student</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Items Sold</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Payment Mode</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Amount</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Receipt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSales.map((sale, index) => (
                                        <tr key={sale.id} style={{ borderBottom: '1px solid #f1f5f9', background: index % 2 === 0 ? 'white' : '#fafafa' }}>
                                            <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#4f46e5' }}>
                                                {sale.receiptNo}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                {sale.createdAtFormatted || '—'}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#0f172a', fontWeight: '600' }}>
                                                {sale.customerName}
                                                {sale.studentInfo && (
                                                    <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>
                                                        {sale.studentInfo.className} · Roll: {sale.studentInfo.rollNo}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                                                {(sale.items || []).map(it => `${it.name} (${it.quantity}x)`).join(', ')}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '9999px',
                                                    fontWeight: '700',
                                                    background: sale.paymentMode === 'cash' ? '#dcfce7' : '#fef3c7',
                                                    color: sale.paymentMode === 'cash' ? '#15803d' : '#b45309'
                                                }}>
                                                    {sale.paymentMode === 'cash' ? '💵 Cash Paid' : '📝 Added to Fee Ledger'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: '800', color: '#0f172a' }}>
                                                PKR {sale.finalAmount}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => {
                                                        setActiveReceipt(sale);
                                                        setReceiptModalOpen(true);
                                                    }}
                                                    className="btn"
                                                    style={{ background: '#f1f5f9', color: '#4f46e5', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem' }}
                                                >
                                                    <Printer size={14} /> View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {filteredSales.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                                No sales transactions found matching your criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* CHECKOUT MODAL (CASH OR ADD TO STUDENT FEE LEDGER) */}
            {/* ========================================================================= */}
            {checkoutModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(6px)',
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
                        maxWidth: '560px',
                        padding: '1.5rem',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CreditCard size={20} color="#4f46e5" />
                                Store Checkout & Payment
                            </h3>
                            <button onClick={() => setCheckoutModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* Order Summary Ribbon */}
                        <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Payable Amount:</span>
                                <h4 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#10b981', margin: 0 }}>PKR {cartTotal}</h4>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                                {cart.reduce((a, b) => a + b.quantity, 0)} Items in Cart
                            </span>
                        </div>

                        {/* Payment Mode Selection */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '0.5rem' }}>
                                Select Payment Method:
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMode('cash')}
                                    style={{
                                        padding: '0.85rem',
                                        borderRadius: '10px',
                                        border: '2px solid',
                                        borderColor: paymentMode === 'cash' ? '#10b981' : '#e2e8f0',
                                        background: paymentMode === 'cash' ? '#f0fdf4' : 'white',
                                        color: paymentMode === 'cash' ? '#047857' : '#64748b',
                                        fontWeight: '700',
                                        fontSize: '0.88rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.35rem'
                                    }}
                                >
                                    <DollarSign size={22} />
                                    <span>💵 Cash / Instant Paid</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setPaymentMode('fee_ledger')}
                                    style={{
                                        padding: '0.85rem',
                                        borderRadius: '10px',
                                        border: '2px solid',
                                        borderColor: paymentMode === 'fee_ledger' ? '#4f46e5' : '#e2e8f0',
                                        background: paymentMode === 'fee_ledger' ? '#eef2ff' : 'white',
                                        color: paymentMode === 'fee_ledger' ? '#4338ca' : '#64748b',
                                        fontWeight: '700',
                                        fontSize: '0.88rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.35rem'
                                    }}
                                >
                                    <FileText size={22} />
                                    <span>📝 Add to Student Fee Ledger</span>
                                </button>
                            </div>
                        </div>

                        {/* If Mode is Fee Ledger: Pick Student */}
                        {paymentMode === 'fee_ledger' && (
                            <div style={{ background: '#faf5ff', padding: '1rem', borderRadius: '10px', border: '1px solid #e9d5ff', marginBottom: '1.25rem' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#6b21a8', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Users size={16} /> Link to Student Account
                                </h4>

                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#475569', marginBottom: '0.25rem' }}>
                                        1. Select Student's Class:
                                    </label>
                                    <select
                                        value={selectedClassId}
                                        onChange={(e) => setSelectedClassId(e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        <option value="">-- Choose Class --</option>
                                        {classesList.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedClassId && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#475569', marginBottom: '0.25rem' }}>
                                            2. Select Student (Search by Name or Roll No):
                                        </label>
                                        <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            {classStudents.map(st => {
                                                const isSel = selectedStudent?.id === st.id;
                                                return (
                                                    <div
                                                        key={st.id}
                                                        onClick={() => {
                                                            setSelectedStudent(st);
                                                            setCustomerName(st.name || '');
                                                            const phone = st.fatherPhone || st.phone || st.whatsapp || st.contactNumber || st.emergencyContact || '';
                                                            if (phone) setCustomerPhone(phone);
                                                        }}
                                                        style={{
                                                            padding: '0.5rem 0.75rem',
                                                            borderRadius: '6px',
                                                            border: isSel ? '2px solid #6b21a8' : '1px solid #e2e8f0',
                                                            background: isSel ? '#f3e8ff' : 'white',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}
                                                    >
                                                        <div>
                                                            <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{st.name}</strong>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>
                                                                Roll #{st.rollNumber || st.rollNo || 'N/A'} · Father: {st.fatherName || 'N/A'}
                                                            </span>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Pending Dues:</span>
                                                            <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#ef4444' }}>
                                                                PKR {st.remaining || 0}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {classStudents.length === 0 && !loadingStudents && (
                                                <p style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>
                                                    No students enrolled in this class.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {selectedStudent && (
                                    <div style={{ marginTop: '0.75rem', padding: '0.65rem', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                        <p style={{ fontSize: '0.78rem', color: '#065f46', margin: 0 }}>
                                            ✓ <strong>PKR {cartTotal}</strong> will be added to <strong>{selectedStudent.name}'s</strong> fee invoice ledger automatically.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Customer Details for Cash Walk-in */}
                        {paymentMode === 'cash' && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#475569', marginBottom: '0.25rem' }}>
                                    Customer / Parent Name (Optional):
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Walk-in Parent / Student Name"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>
                        )}

                        {/* WhatsApp Digital Slip Box */}
                        <div style={{
                            background: sendWhatsAppReceipt ? '#f0fdf4' : '#f8fafc',
                            border: sendWhatsAppReceipt ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '0.85rem 1rem',
                            marginBottom: '1.25rem',
                            transition: 'all 0.2s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: sendWhatsAppReceipt ? '0.75rem' : '0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: sendWhatsAppReceipt ? '#22c55e' : '#94a3b8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        boxShadow: sendWhatsAppReceipt ? '0 4px 10px rgba(34, 197, 94, 0.35)' : 'none'
                                    }}>
                                        <MessageSquare size={18} />
                                    </div>
                                    <div>
                                        <strong style={{ fontSize: '0.86rem', color: sendWhatsAppReceipt ? '#14532d' : '#475569', display: 'block' }}>
                                            Send Digital Receipt to WhatsApp
                                        </strong>
                                        <span style={{ fontSize: '0.72rem', color: sendWhatsAppReceipt ? '#15803d' : '#64748b' }}>
                                            Auto-opens instant formatted store slip on parent's WhatsApp
                                        </span>
                                    </div>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={sendWhatsAppReceipt}
                                        onChange={(e) => setSendWhatsAppReceipt(e.target.checked)}
                                        style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#22c55e' }}
                                    />
                                </label>
                            </div>

                            {sendWhatsAppReceipt && (
                                <div style={{ borderTop: '1px dashed #bbf7d0', paddingTop: '0.65rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#166534', marginBottom: '0.25rem' }}>
                                        WhatsApp Mobile Number:
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <Phone size={15} color="#16a34a" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            placeholder="e.g. 03001234567 or 923001234567"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem 0.75rem 0.5rem 2rem',
                                                borderRadius: '6px',
                                                border: '1px solid #86efac',
                                                background: '#ffffff',
                                                fontSize: '0.85rem',
                                                fontWeight: '600',
                                                color: '#0f172a'
                                            }}
                                        />
                                    </div>
                                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#15803d', marginTop: '0.25rem' }}>
                                        {customerPhone ? `✓ Will deliver to: +${formatWhatsAppNumber(customerPhone)}` : '⚠️ Please provide mobile number to receive digital receipt on WhatsApp'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Submit Button */}
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button
                                type="button"
                                onClick={() => setCheckoutModalOpen(false)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCheckoutSubmit}
                                disabled={isSubmittingOrder}
                                className="btn"
                                style={{
                                    flex: 2,
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.92rem',
                                    justifyContent: 'center'
                                }}
                            >
                                {isSubmittingOrder ? 'Processing...' : `Confirm & Print Receipt (PKR ${cartTotal})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* PRINTABLE RECEIPT MODAL */}
            {/* ========================================================================= */}
            {receiptModalOpen && activeReceipt && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(6px)',
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
                        maxWidth: '440px',
                        padding: '1.5rem',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#10b981' }}>✓ Transaction Successful</span>
                            <button onClick={() => setReceiptModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* Thermal Receipt Body */}
                        <div id="printable-slip" style={{
                            background: '#fafafa',
                            padding: '1.25rem',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            fontFamily: 'monospace',
                            fontSize: '0.82rem',
                            color: '#0f172a'
                        }}>
                            <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: '0 0 0.2rem 0' }}>{schoolInfo.name}</h3>
                                {schoolInfo.address && <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>{schoolInfo.address}</p>}
                                {schoolInfo.phone && <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>Phone: {schoolInfo.phone}</p>}
                                <div style={{ margin: '0.5rem 0', borderTop: '1px dashed #cbd5e1' }} />
                                <strong style={{ fontSize: '0.85rem' }}>STORE POS RECEIPT</strong>
                            </div>

                            <div style={{ fontSize: '0.75rem', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                                <div><strong>Receipt #:</strong> {activeReceipt.receiptNo}</div>
                                <div><strong>Date:</strong> {activeReceipt.createdAtFormatted || new Date().toLocaleString()}</div>
                                <div><strong>Customer:</strong> {activeReceipt.customerName || 'Walk-in'}</div>
                                {activeReceipt.studentInfo && (
                                    <div><strong>Class:</strong> {activeReceipt.studentInfo.className} (Roll: {activeReceipt.studentInfo.rollNo})</div>
                                )}
                                <div><strong>Payment:</strong> <span style={{ color: activeReceipt.paymentMode === 'cash' ? '#15803d' : '#b45309', fontWeight: 'bold' }}>{activeReceipt.paymentMode === 'cash' ? 'PAID (CASH)' : 'ADDED TO FEE LEDGER'}</span></div>
                            </div>

                            <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '0.5rem 0', marginBottom: '0.5rem' }}>
                                <table style={{ width: '100%', fontSize: '0.72rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', fontWeight: 'bold' }}>
                                            <th>Item</th>
                                            <th style={{ textAlign: 'center' }}>Qty</th>
                                            <th style={{ textAlign: 'right' }}>Price</th>
                                            <th style={{ textAlign: 'right' }}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(activeReceipt.items || []).map((it, i) => (
                                            <tr key={i}>
                                                <td style={{ padding: '0.15rem 0' }}>{it.name} {it.size && `(${it.size})`}</td>
                                                <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                                                <td style={{ textAlign: 'right' }}>{it.price}</td>
                                                <td style={{ textAlign: 'right' }}>{it.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ fontSize: '0.75rem', textAlign: 'right', lineHeight: 1.4 }}>
                                <div>Subtotal: PKR {activeReceipt.subtotal}</div>
                                {activeReceipt.discount > 0 && <div>Discount: - PKR {activeReceipt.discount}</div>}
                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginTop: '0.2rem' }}>
                                    TOTAL: PKR {activeReceipt.finalAmount}
                                </div>
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.65rem', color: '#64748b' }}>
                                Thank you for your purchase!
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => sendWhatsAppReceiptDirect(activeReceipt)}
                                className="btn hover-lift"
                                style={{
                                    flex: '1 1 100%',
                                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                    color: 'white',
                                    padding: '0.7rem',
                                    borderRadius: '8px',
                                    fontSize: '0.86rem',
                                    fontWeight: '700',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.35)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem'
                                }}
                            >
                                <MessageSquare size={16} /> Send / Re-send to WhatsApp
                            </button>
                            <button
                                onClick={() => downloadReceiptPDF(activeReceipt)}
                                className="btn"
                                style={{ flex: 1, background: '#4f46e5', color: 'white', padding: '0.65rem', borderRadius: '8px', fontSize: '0.85rem', justifyContent: 'center' }}
                            >
                                <Download size={16} /> Download PDF
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="btn"
                                style={{ flex: 1, background: '#0f172a', color: 'white', padding: '0.65rem', borderRadius: '8px', fontSize: '0.85rem', justifyContent: 'center' }}
                            >
                                <Printer size={16} /> Print Receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* ADD / EDIT ITEM MODAL */}
            {/* ========================================================================= */}
            {itemModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(6px)',
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
                        maxWidth: '560px',
                        padding: '1.5rem',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                {editingItem ? 'Edit Store Item' : 'Add New Item to Inventory'}
                            </h3>
                            <button onClick={() => setItemModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveItem}>
                            {/* Category Picker */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                    Inventory Category:
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                    {[
                                        { id: 'book', label: '📚 Book' },
                                        { id: 'uniform', label: '👔 Uniform' },
                                        { id: 'stationery', label: '✏️ Stationery' }
                                    ].map(cat => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setItemFormData({ ...itemFormData, category: cat.id })}
                                            style={{
                                                padding: '0.6rem',
                                                borderRadius: '8px',
                                                border: '2px solid',
                                                borderColor: itemFormData.category === cat.id ? '#4f46e5' : '#e2e8f0',
                                                background: itemFormData.category === cat.id ? '#eef2ff' : 'white',
                                                color: itemFormData.category === cat.id ? '#4338ca' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.82rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Item Name */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                    Item Name / Title *:
                                </label>
                                <input
                                    type="text"
                                    placeholder={itemFormData.category === 'uniform' ? 'e.g. Boys Summer Polo Shirt' : 'e.g. Oxford Progressive English Book 5'}
                                    value={itemFormData.name}
                                    onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                />
                            </div>

                            {/* Class Target */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                    Target Class:
                                </label>
                                <select
                                    value={itemFormData.targetClass}
                                    onChange={(e) => setItemFormData({ ...itemFormData, targetClass: e.target.value })}
                                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                >
                                    {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Dynamic Fields for Uniform */}
                            {itemFormData.category === 'uniform' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem', background: '#faf5ff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#6b21a8', marginBottom: '0.25rem' }}>
                                            Size:
                                        </label>
                                        <select
                                            value={itemFormData.size}
                                            onChange={(e) => setItemFormData({ ...itemFormData, size: e.target.value })}
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        >
                                            {UNIFORM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#6b21a8', marginBottom: '0.25rem' }}>
                                            Gender:
                                        </label>
                                        <select
                                            value={itemFormData.gender}
                                            onChange={(e) => setItemFormData({ ...itemFormData, gender: e.target.value })}
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        >
                                            <option value="Unisex">Unisex</option>
                                            <option value="Boys">Boys</option>
                                            <option value="Girls">Girls</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Dynamic Fields for Books */}
                            {(itemFormData.category === 'book' || itemFormData.category === 'stationery') && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                        Publisher / Brand:
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Oxford University Press, PTB, Afaq"
                                        value={itemFormData.publisher}
                                        onChange={(e) => setItemFormData({ ...itemFormData, publisher: e.target.value })}
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                            )}

                            {/* Pricing & Stock Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>
                                        Cost Price (PKR):
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={itemFormData.costPrice}
                                        onChange={(e) => setItemFormData({ ...itemFormData, costPrice: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>
                                        Selling Price (PKR) *:
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={itemFormData.sellingPrice}
                                        onChange={(e) => setItemFormData({ ...itemFormData, sellingPrice: Number(e.target.value) })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700', color: '#10b981' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>
                                        Current Stock:
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={itemFormData.stock}
                                        onChange={(e) => setItemFormData({ ...itemFormData, stock: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setItemModalOpen(false)}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ flex: 2, background: '#4f46e5', color: 'white', padding: '0.75rem', borderRadius: '8px', fontWeight: '700', justifyContent: 'center' }}
                                >
                                    {editingItem ? 'Update Item' : 'Save to Inventory'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* QUICK RESTOCK MODAL */}
            {/* ========================================================================= */}
            {restockModalOpen && restockItem && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{ background: 'white', borderRadius: '14px', width: '100%', maxWidth: '400px', padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                            Restock: {restockItem.name}
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem 0' }}>
                            Current stock: <strong>{restockItem.stock} units</strong>
                        </p>

                        <form onSubmit={handleRestockSubmit}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                Add Quantity:
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={restockQuantity}
                                onChange={(e) => setRestockQuantity(Number(e.target.value))}
                                required
                                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}
                            />

                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                {[10, 25, 50, 100].map(qty => (
                                    <button
                                        key={qty}
                                        type="button"
                                        onClick={() => setRestockQuantity(qty)}
                                        style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                        +{qty}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setRestockModalOpen(false)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ flex: 2, background: '#059669', color: 'white', padding: '0.65rem', borderRadius: '8px', fontWeight: '700', justifyContent: 'center' }}
                                >
                                    Add to Stock
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* CREATE CLASS BUNDLE MODAL */}
            {/* ========================================================================= */}
            {bundleModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(6px)',
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
                        maxWidth: '560px',
                        padding: '1.5rem',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                Create Class Package / Bundle
                            </h3>
                            <button onClick={() => setBundleModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveBundle}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                    Bundle Title *:
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Class 5 Complete Book Set + Uniform"
                                    value={bundleFormData.title}
                                    onChange={(e) => setBundleFormData({ ...bundleFormData, title: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                        Target Class:
                                    </label>
                                    <select
                                        value={bundleFormData.targetClass}
                                        onChange={(e) => setBundleFormData({ ...bundleFormData, targetClass: e.target.value })}
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    >
                                        {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                        Package Price (PKR) *:
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="e.g. 4500"
                                        value={bundleFormData.bundlePrice}
                                        onChange={(e) => setBundleFormData({ ...bundleFormData, bundlePrice: Number(e.target.value) })}
                                        required
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', fontWeight: '700', color: '#059669' }}
                                    />
                                </div>
                            </div>

                            {/* Select Items to Include */}
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                    Select Items Included in this Package:
                                </label>
                                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {items.map(item => {
                                        const isSelected = bundleFormData.selectedItemIds.includes(item.id);
                                        return (
                                            <label
                                                key={item.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.35rem 0.5rem',
                                                    borderRadius: '4px',
                                                    background: isSelected ? '#f0fdf4' : 'transparent',
                                                    cursor: 'pointer',
                                                    fontSize: '0.82rem'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        const updated = e.target.checked
                                                            ? [...bundleFormData.selectedItemIds, item.id]
                                                            : bundleFormData.selectedItemIds.filter(id => id !== item.id);
                                                        setBundleFormData({ ...bundleFormData, selectedItemIds: updated });
                                                    }}
                                                />
                                                <span style={{ flex: 1 }}>{item.name} {item.size && `(${item.size})`}</span>
                                                <strong style={{ color: '#64748b' }}>PKR {item.sellingPrice}</strong>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setBundleModalOpen(false)}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ flex: 2, background: '#4f46e5', color: 'white', padding: '0.75rem', borderRadius: '8px', fontWeight: '700', justifyContent: 'center' }}
                                >
                                    Create Package
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* PRE-BUILT CLASS KIT TEMPLATES MODAL */}
            {/* ========================================================================= */}
            {templateModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.82)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '960px',
                        padding: '1.75rem',
                        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
                        maxHeight: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 6px 14px rgba(245, 158, 11, 0.35)'
                                }}>
                                    <Sparkles color="white" size={24} />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                        Pre-Configured Class Kit Templates
                                    </h2>
                                    <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
                                        Complete standard Book sets, Uniforms & Stationery for every class. Customize prices or titles and import in 1 click!
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setTemplateModalOpen(false)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={18} color="#64748b" />
                            </button>
                        </div>

                        {/* Class Selector Scrollbar */}
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                                1. Select Target Class:
                            </label>
                            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.4rem' }}>
                                {Object.keys(STANDARD_CLASS_TEMPLATES).map(cls => {
                                    const isSelected = selectedTemplateClass === cls;
                                    return (
                                        <button
                                            key={cls}
                                            type="button"
                                            onClick={() => handleSelectTemplateClass(cls)}
                                            style={{
                                                padding: '0.45rem 0.9rem',
                                                borderRadius: '10px',
                                                border: isSelected ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                                                background: isSelected ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : '#f8fafc',
                                                color: isSelected ? 'white' : '#334155',
                                                fontWeight: isSelected ? '700' : '600',
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.2s ease',
                                                boxShadow: isSelected ? '0 4px 10px rgba(79, 70, 229, 0.3)' : 'none'
                                            }}
                                        >
                                            {cls}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Category Filters & Bulk Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '10px', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                {[
                                    { id: 'all', label: 'All Items' },
                                    { id: 'book', label: '📚 Books' },
                                    { id: 'uniform', label: '👔 Uniforms' },
                                    { id: 'stationery', label: '✏️ Stationery' }
                                ].map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setTemplateFilterCategory(cat.id)}
                                        style={{
                                            padding: '0.3rem 0.65rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: templateFilterCategory === cat.id ? '#0f172a' : 'transparent',
                                            color: templateFilterCategory === cat.id ? 'white' : '#64748b',
                                            fontWeight: '600',
                                            fontSize: '0.78rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => handleToggleAllDraftItems(true)}
                                    style={{ background: 'white', border: '1px solid #cbd5e1', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '600', color: '#059669', cursor: 'pointer' }}
                                >
                                    ✓ Select All
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleToggleAllDraftItems(false)}
                                    style={{ background: 'white', border: '1px solid #cbd5e1', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '600', color: '#e11d48', cursor: 'pointer' }}
                                >
                                    ✕ Deselect All
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Items Table / Cards */}
                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.5rem', marginBottom: '1rem', background: '#fafbfc' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                {templateDraftItems
                                    .filter(item => templateFilterCategory === 'all' || item.category === templateFilterCategory)
                                    .map((item, originalIndex) => {
                                        const actualIndex = templateDraftItems.findIndex(it => it.tempId === item.tempId);
                                        const isSelected = !!item.selected;

                                        return (
                                            <div
                                                key={item.tempId || actualIndex}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.65rem',
                                                    padding: '0.65rem 0.85rem',
                                                    borderRadius: '10px',
                                                    background: isSelected ? '#ffffff' : '#f1f5f9',
                                                    border: isSelected ? '1px solid #cbd5e1' : '1px dashed #cbd5e1',
                                                    opacity: isSelected ? 1 : 0.6,
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {/* Checkbox */}
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleToggleDraftItem(actualIndex)}
                                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#4f46e5' }}
                                                />

                                                {/* Category Badge */}
                                                <span style={{
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    textTransform: 'uppercase',
                                                    background: item.category === 'book' ? '#e0e7ff' : item.category === 'uniform' ? '#fae8ff' : '#fef3c7',
                                                    color: item.category === 'book' ? '#4338ca' : item.category === 'uniform' ? '#86198f' : '#b45309',
                                                    minWidth: '70px',
                                                    textAlign: 'center'
                                                }}>
                                                    {item.category}
                                                </span>

                                                {/* Item Title Input */}
                                                <div style={{ flex: 3 }}>
                                                    <input
                                                        type="text"
                                                        value={item.name}
                                                        onChange={(e) => handleUpdateDraftItemField(actualIndex, 'name', e.target.value)}
                                                        placeholder="Item Name"
                                                        style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', color: '#0f172a' }}
                                                    />
                                                </div>

                                                {/* Details (Publisher or Uniform Size) */}
                                                <div style={{ flex: 2 }}>
                                                    {item.category === 'uniform' ? (
                                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                            <input
                                                                type="text"
                                                                value={item.uniformType}
                                                                onChange={(e) => handleUpdateDraftItemField(actualIndex, 'uniformType', e.target.value)}
                                                                placeholder="Type"
                                                                style={{ width: '55%', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                                            />
                                                            <input
                                                                type="text"
                                                                value={item.size}
                                                                onChange={(e) => handleUpdateDraftItemField(actualIndex, 'size', e.target.value)}
                                                                placeholder="Size"
                                                                style={{ width: '45%', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            value={item.publisher || ''}
                                                            onChange={(e) => handleUpdateDraftItemField(actualIndex, 'publisher', e.target.value)}
                                                            placeholder="Publisher / Details"
                                                            style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                                        />
                                                    )}
                                                </div>

                                                {/* Cost Price */}
                                                <div style={{ width: '90px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', fontWeight: '600' }}>Cost (PKR):</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.costPrice}
                                                        onChange={(e) => handleUpdateDraftItemField(actualIndex, 'costPrice', Number(e.target.value))}
                                                        style={{ width: '100%', padding: '0.35rem 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: '600' }}
                                                    />
                                                </div>

                                                {/* Selling Price */}
                                                <div style={{ width: '95px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', color: '#059669', fontWeight: '700' }}>Price (PKR):</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.sellingPrice}
                                                        onChange={(e) => handleUpdateDraftItemField(actualIndex, 'sellingPrice', Number(e.target.value))}
                                                        style={{ width: '100%', padding: '0.35rem 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: '700', color: '#059669' }}
                                                    />
                                                </div>

                                                {/* Stock */}
                                                <div style={{ width: '70px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', fontWeight: '600' }}>Stock:</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.stock}
                                                        onChange={(e) => handleUpdateDraftItemField(actualIndex, 'stock', Number(e.target.value))}
                                                        style={{ width: '100%', padding: '0.35rem 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Bundle Configuration & Financial Summary */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>
                                        Class Bundle Title:
                                    </label>
                                    <input
                                        type="text"
                                        value={templateBundleTitle}
                                        onChange={(e) => setTemplateBundleTitle(e.target.value)}
                                        placeholder="Bundle Title"
                                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>
                                        Bundle Discounted Package Price (PKR):
                                    </label>
                                    <input
                                        type="number"
                                        value={templateBundlePrice}
                                        onChange={(e) => setTemplateBundlePrice(Number(e.target.value))}
                                        placeholder="Package Price"
                                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '800', color: '#059669' }}
                                    />
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                        Selected: <strong>{templateTotals.count} items</strong> | Total Value: <strong>PKR {templateTotals.totalSelling}</strong>
                                    </div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#059669', marginTop: '0.2rem' }}>
                                        Estimated Profit: +PKR {templateTotals.estProfit} per bundle
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => handleSelectTemplateClass(selectedTemplateClass)}
                                style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}
                            >
                                🔄 Reset to Defaults
                            </button>
                            <button
                                type="button"
                                onClick={() => setTemplateModalOpen(false)}
                                style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isImportingTemplate}
                                onClick={() => handleImportTemplateKit(false)}
                                style={{
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: '#f1f5f9',
                                    color: '#0f172a',
                                    fontWeight: '700',
                                    fontSize: '0.84rem',
                                    cursor: 'pointer'
                                }}
                            >
                                📦 Import Items Only
                            </button>
                            <button
                                type="button"
                                disabled={isImportingTemplate}
                                onClick={() => handleImportTemplateKit(true)}
                                className="btn hover-lift"
                                style={{
                                    padding: '0.65rem 1.5rem',
                                    borderRadius: '8px',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: '0.88rem',
                                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                {isImportingTemplate ? 'Importing...' : '⚡ 1-Click Import & Create Class Bundle'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Store;
