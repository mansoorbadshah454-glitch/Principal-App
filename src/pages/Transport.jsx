import React, { useState, useEffect, useMemo } from 'react';
import {
    Bus, Search, Plus, Trash2, Edit, CheckCircle, AlertTriangle, Filter,
    ArrowRight, MapPin, Users, Phone, DollarSign, Calendar, Clock,
    FileText, ShieldCheck, X, ChevronRight, Eye, Sparkles, Navigation,
    Fuel, Wrench, Check, Send, Download, Printer, ArrowUpRight, CheckSquare,
    MessageSquare, AlertCircle, RefreshCw, Camera, Image as ImageIcon, Upload, ExternalLink
} from 'lucide-react';
import { db } from '../firebase';
import {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc,
    onSnapshot, writeBatch, increment
} from 'firebase/firestore';
import { useAuthPermissions } from '../context/AuthPermissionsContext';
import { useAlert } from '../context/AlertContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const VEHICLE_TYPES = [
    'HiAce Van (14-16 Seater)',
    'Toyota Coaster (25-30 Seater)',
    'Standard School Bus (40-50 Seater)',
    'Mini Van / Bolan (7-8 Seater)',
    'Auto Rickshaw / Qingqi',
    'Private Car / Staff Transport'
];

const MAINTENANCE_TYPES = [
    'Engine Oil & Filter Change',
    'Brake Pads & Service',
    'Tyre Replacement / Puncture',
    'Battery Replacement',
    'Engine Tuning & Plugs',
    'Suspension & Alignment',
    'AC & Electrical Repair',
    'Body Paint & Denting',
    'General Inspection'
];

const Transport = () => {
    const { schoolId: authSchoolId, userProfile } = useAuthPermissions();
    const { showAlert } = useAlert();

    // Fallback School ID resolution
    const [schoolId, setSchoolId] = useState(() => {
        if (authSchoolId) return authSchoolId;
        try {
            const sess = localStorage.getItem('manual_session');
            if (sess) {
                const p = JSON.parse(sess);
                return p.schoolId || p.uid || '';
            }
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

    // Navigation Tabs
    const [activeTab, setActiveTab] = useState('fleet'); // 'fleet', 'routes', 'allocations', 'fuel_logs', 'attendance'

    // School Profile Info
    const [schoolInfo, setSchoolInfo] = useState({
        name: 'School Transport System',
        phone: '',
        address: ''
    });

    // Core Transport State
    const [vehicles, setVehicles] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [allocations, setAllocations] = useState([]);
    const [fuelLogs, setFuelLogs] = useState([]);
    const [attendanceLogs, setAttendanceLogs] = useState({}); // { "YYYY-MM-DD_routeId_trip": { studentId: 'boarded' } }

    // Classes & Students Cache
    const [classesList, setClassesList] = useState([]);
    const [classStudents, setClassStudents] = useState([]);
    const [allStudentsCache, setAllStudentsCache] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    // Filter & Search States
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [routeSearch, setRouteSearch] = useState('');
    const [allocationSearch, setAllocationSearch] = useState('');
    const [allocationClassFilter, setAllocationClassFilter] = useState('All');
    const [allocationRouteFilter, setAllocationRouteFilter] = useState('All');
    const [fuelVehicleFilter, setFuelVehicleFilter] = useState('All');
    const [expenseMonthFilter, setExpenseMonthFilter] = useState(() => new Date().toISOString().slice(0, 7));

    // Receipt Lightbox State
    const [viewingReceipt, setViewingReceipt] = useState(null);

    // Daily Attendance Date & Route Selection
    const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [attendanceRouteId, setAttendanceRouteId] = useState('');
    const [attendanceTripType, setAttendanceTripType] = useState('morning'); // 'morning', 'afternoon'

    // -------------------------------------------------------------
    // Modals State
    // -------------------------------------------------------------
    // 1. Vehicle Modal
    const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [vehicleFormData, setVehicleFormData] = useState({
        regNo: '',
        type: 'HiAce Van (14-16 Seater)',
        capacity: 15,
        modelYear: '',
        status: 'Active', // 'Active', 'Maintenance', 'Off Duty'
        driverName: '',
        driverPhone: '',
        driverLicense: '',
        driverCnic: '',
        helperName: '',
        helperPhone: '',
        fitnessExpiry: '',
        tokenTaxExpiry: '',
        insuranceExpiry: '',
        notes: ''
    });

    // 2. Route Modal
    const [routeModalOpen, setRouteModalOpen] = useState(false);
    const [editingRoute, setEditingRoute] = useState(null);
    const [routeFormData, setRouteFormData] = useState({
        title: '',
        vehicleId: '',
        startPoint: '',
        endPoint: 'School Campus',
        morningDepartureTime: '06:45 AM',
        afternoonDepartureTime: '01:45 PM',
        monthlyBaseFare: 2500,
        stops: [
            { stopName: '', morningTime: '07:00 AM', afternoonTime: '02:00 PM', fare: 2500 }
        ],
        notes: ''
    });

    // 3. Student Allocation Modal
    const [allocationModalOpen, setAllocationModalOpen] = useState(false);
    const [allocSelectedClassId, setAllocSelectedClassId] = useState('');
    const [allocSelectedStudent, setAllocSelectedStudent] = useState(null);
    const [allocRouteId, setAllocRouteId] = useState('');
    const [allocStopName, setAllocStopName] = useState('');
    const [allocMonthlyFare, setAllocMonthlyFare] = useState(2500);
    const [allocTripType, setAllocTripType] = useState('both'); // 'both', 'morning_only', 'afternoon_only'
    const [allocParentPhone, setAllocParentPhone] = useState('');
    const [isSavingAllocation, setIsSavingAllocation] = useState(false);

    // 4. Fuel & Maintenance Log Modal
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [logFormData, setLogFormData] = useState({
        type: 'fuel', // 'fuel', 'maintenance'
        vehicleId: '',
        date: new Date().toISOString().slice(0, 10),
        liters: 0,
        ratePerLiter: 280,
        totalCost: 0,
        odometerKm: '',
        maintenanceType: 'Engine Oil & Filter Change',
        vendorName: '',
        receiptUrl: '',
        receiptFileName: '',
        notes: ''
    });

    // -------------------------------------------------------------
    // 1. Real-time Firestore Listeners
    // -------------------------------------------------------------
    useEffect(() => {
        if (!schoolId) return;

        // Fetch School Profile
        getDoc(doc(db, 'schools', schoolId)).then(snap => {
            if (snap.exists()) {
                const d = snap.data();
                setSchoolInfo({
                    name: d.name || d.schoolName || 'School Transport Management',
                    phone: d.phone || d.contactNumber || '',
                    address: d.address || ''
                });
            }
        }).catch(console.error);

        // Fetch Classes
        getDocs(collection(db, `schools/${schoolId}/classes`)).then(snap => {
            const cls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setClassesList(cls);
        }).catch(console.error);

        // Real-time Transport Management Master Doc
        const unsub = onSnapshot(doc(db, 'schools', schoolId, 'settings', 'transport_management'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
                setRoutes(Array.isArray(data.routes) ? data.routes : []);
                setAllocations(Array.isArray(data.allocations) ? data.allocations : []);
                setFuelLogs(Array.isArray(data.fuelLogs) ? data.fuelLogs : []);
                setAttendanceLogs(data.attendanceLogs || {});
            } else {
                // Initialize default sample data if empty
                initializeSampleTransport();
            }
            setLoadingData(false);
        }, (err) => {
            console.error('Transport listener error:', err);
            setLoadingData(false);
        });

        return () => unsub();
    }, [schoolId]);

    // Load students for selected class in Allocation Modal
    useEffect(() => {
        if (!schoolId || !allocSelectedClassId) {
            setClassStudents([]);
            return;
        }

        getDocs(collection(db, `schools/${schoolId}/classes/${allocSelectedClassId}/students`))
            .then(snap => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setClassStudents(list);
            })
            .catch(console.error);
    }, [schoolId, allocSelectedClassId]);

    // Initialize Default Transport Setup if First Time
    const initializeSampleTransport = async () => {
        if (!schoolId) return;
        const initialVehicles = [
            {
                id: `veh_${Date.now()}_1`,
                regNo: 'LEA-4821',
                type: 'HiAce Van (14-16 Seater)',
                capacity: 15,
                modelYear: '2021',
                status: 'Active',
                driverName: 'Muhammad Aslam',
                driverPhone: '0301-7654321',
                driverLicense: 'LHR-984210',
                driverCnic: '35202-1234567-1',
                helperName: 'Rashid Ali',
                helperPhone: '0305-9876543',
                fitnessExpiry: '2026-12-31',
                tokenTaxExpiry: '2026-09-30',
                insuranceExpiry: '2026-11-15',
                createdAt: new Date().toISOString()
            },
            {
                id: `veh_${Date.now()}_2`,
                regNo: 'LEC-9012',
                type: 'Toyota Coaster (25-30 Seater)',
                capacity: 28,
                modelYear: '2022',
                status: 'Active',
                driverName: 'Tariq Mehmood',
                driverPhone: '0321-4567890',
                driverLicense: 'LHR-552190',
                driverCnic: '35201-9876543-5',
                helperName: 'Imran Khan',
                helperPhone: '0333-1122334',
                fitnessExpiry: '2026-10-31',
                tokenTaxExpiry: '2026-12-31',
                insuranceExpiry: '2026-10-15',
                createdAt: new Date().toISOString()
            }
        ];

        const initialRoutes = [
            {
                id: `route_${Date.now()}_1`,
                title: 'Route #1: Gulberg & Model Town Express',
                vehicleId: initialVehicles[0].id,
                startPoint: 'Main Market Gulberg',
                endPoint: 'School Main Campus',
                morningDepartureTime: '06:45 AM',
                afternoonDepartureTime: '01:45 PM',
                monthlyBaseFare: 2500,
                stops: [
                    { stopName: 'Gulberg Main Market', morningTime: '07:00 AM', afternoonTime: '02:00 PM', fare: 2500 },
                    { stopName: 'Liberty Chowk Roundabout', morningTime: '07:12 AM', afternoonTime: '02:12 PM', fare: 2800 },
                    { stopName: 'Model Town C-Block Park', morningTime: '07:25 AM', afternoonTime: '02:25 PM', fare: 3200 },
                    { stopName: 'Kalma Chowk Metro Station', morningTime: '07:35 AM', afternoonTime: '02:35 PM', fare: 3500 }
                ],
                notes: 'Morning pick-up starts at 06:55 AM sharp.'
            }
        ];

        try {
            await setDoc(doc(db, 'schools', schoolId, 'settings', 'transport_management'), {
                vehicles: initialVehicles,
                routes: initialRoutes,
                allocations: [],
                fuelLogs: [],
                attendanceLogs: {}
            }, { merge: true });
        } catch (e) {
            console.error('Failed to init transport:', e);
        }
    };

    // -------------------------------------------------------------
    // Helper: Save Master State to Firestore (Guaranteed Zero-Error)
    // -------------------------------------------------------------
    const saveTransportState = async (updates) => {
        if (!schoolId) {
            showAlert('School ID not found. Please re-login.', 'error');
            return false;
        }
        try {
            await setDoc(doc(db, 'schools', schoolId, 'settings', 'transport_management'), updates, { merge: true });
            return true;
        } catch (error) {
            console.error('Transport save error:', error);
            showAlert('Failed to save data: ' + error.message, 'error');
            return false;
        }
    };

    // -------------------------------------------------------------
    // WhatsApp Utilities
    // -------------------------------------------------------------
    const formatWhatsAppPhone = (phone) => {
        if (!phone) return '';
        let clean = phone.toString().replace(/[^0-9]/g, '');
        if (clean.startsWith('0092')) clean = clean.slice(2);
        else if (clean.startsWith('03')) clean = '92' + clean.slice(1);
        else if (clean.startsWith('3') && clean.length === 10) clean = '92' + clean;
        return clean;
    };

    // Send Route & Timing Details to Parent
    const sendRouteDetailsWhatsApp = (alloc) => {
        const studentName = alloc.studentName || 'Student';
        const route = routes.find(r => r.id === alloc.routeId);
        const vehicle = vehicles.find(v => v.id === (route ? route.vehicleId : alloc.vehicleId));
        const stop = (route?.stops || []).find(s => s.stopName === alloc.stopName) || { morningTime: '07:15 AM', afternoonTime: '02:00 PM', fare: alloc.monthlyFare };

        let text = `🏫 *${schoolInfo.name.toUpperCase()} - TRANSPORT ALLOCATION*\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `Assalam-o-Alaikum Dear Parent,\n`;
        text += `Your child *${studentName}* (Class: *${alloc.className}*) is successfully allocated to the School Transport Fleet.\n\n`;
        text += `🚌 *Van Reg No:* \`${vehicle ? vehicle.regNo : 'School Van'}\` (${vehicle ? vehicle.type : 'Van'})\n`;
        text += `🗺️ *Assigned Route:* ${route ? route.title : 'School Route'}\n`;
        text += `📍 *Designated Stop:* *${alloc.stopName}*\n`;
        text += `⏰ *Morning Pickup Time:* *${stop.morningTime || '07:15 AM'}*\n`;
        text += `🏠 *Afternoon Drop Time:* *${stop.afternoonTime || '02:00 PM'}*\n`;
        text += `💵 *Monthly Transport Fee:* PKR ${alloc.monthlyFare}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        if (vehicle && vehicle.driverName) {
            text += `👨‍✈️ *Driver:* ${vehicle.driverName} (📞 ${vehicle.driverPhone})\n`;
        }
        if (vehicle && vehicle.helperName) {
            text += `🤝 *Conductor / Helper:* ${vehicle.helperName} (📞 ${vehicle.helperPhone})\n`;
        }
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Please ensure student is present at the stop 5 minutes prior to pickup time._\n`;
        text += `_For transport queries, contact: ${schoolInfo.phone || 'School Office'}_`;

        const phone = formatWhatsAppPhone(alloc.parentPhone || alloc.fatherPhone);
        if (phone) {
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }
    };

    // Send Boarding Alert to Parent
    const sendBoardingAlertWhatsApp = (alloc, status = 'boarded') => {
        const route = routes.find(r => r.id === alloc.routeId);
        const vehicle = vehicles.find(v => v.id === (route ? route.vehicleId : ''));
        const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const tripLabel = attendanceTripType === 'morning' ? 'Morning Pick-up Trip' : 'Afternoon Drop Trip';

        let text = `🏫 *${schoolInfo.name.toUpperCase()} - TRANSPORT ALERT*\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `Assalam-o-Alaikum Dear Parent,\n`;
        text += `This is to notify that *${alloc.studentName}* (${alloc.className}) has *${status.toUpperCase()}* the school transport for *${tripLabel}*.\n\n`;
        text += `🚌 *Vehicle:* ${vehicle ? vehicle.regNo : 'School Van'}\n`;
        text += `📍 *Stop:* ${alloc.stopName}\n`;
        text += `⏰ *Timestamp:* ${nowTime}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Student safety is our top priority. Wishing a safe journey!_`;

        const phone = formatWhatsAppPhone(alloc.parentPhone || alloc.fatherPhone);
        if (phone) {
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }
    };

    // -------------------------------------------------------------
    // 2. Vehicle CRUD Handlers
    // -------------------------------------------------------------
    const handleOpenVehicleModal = (veh = null) => {
        if (veh) {
            setEditingVehicle(veh);
            setVehicleFormData({
                regNo: veh.regNo || '',
                type: veh.type || 'HiAce Van (14-16 Seater)',
                capacity: veh.capacity || 15,
                modelYear: veh.modelYear || '',
                status: veh.status || 'Active',
                driverName: veh.driverName || '',
                driverPhone: veh.driverPhone || '',
                driverLicense: veh.driverLicense || '',
                driverCnic: veh.driverCnic || '',
                helperName: veh.helperName || '',
                helperPhone: veh.helperPhone || '',
                fitnessExpiry: veh.fitnessExpiry || '',
                tokenTaxExpiry: veh.tokenTaxExpiry || '',
                insuranceExpiry: veh.insuranceExpiry || '',
                notes: veh.notes || ''
            });
        } else {
            setEditingVehicle(null);
            setVehicleFormData({
                regNo: '',
                type: 'HiAce Van (14-16 Seater)',
                capacity: 15,
                modelYear: '',
                status: 'Active',
                driverName: '',
                driverPhone: '',
                driverLicense: '',
                driverCnic: '',
                helperName: '',
                helperPhone: '',
                fitnessExpiry: '',
                tokenTaxExpiry: '',
                insuranceExpiry: '',
                notes: ''
            });
        }
        setVehicleModalOpen(true);
    };

    const handleSaveVehicle = async (e) => {
        e.preventDefault();
        if (!vehicleFormData.regNo.trim()) {
            showAlert('Registration number is required!', 'error');
            return;
        }

        const newId = editingVehicle ? editingVehicle.id : `veh_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const vehObj = {
            ...vehicleFormData,
            id: newId,
            capacity: Number(vehicleFormData.capacity) || 15,
            regNo: vehicleFormData.regNo.trim().toUpperCase(),
            updatedAt: new Date().toISOString()
        };

        const updatedVehicles = editingVehicle
            ? vehicles.map(v => v.id === editingVehicle.id ? vehObj : v)
            : [vehObj, ...vehicles];

        const ok = await saveTransportState({ vehicles: updatedVehicles });
        if (ok) {
            setVehicles(updatedVehicles);
            showAlert(editingVehicle ? 'Vehicle updated successfully!' : 'New vehicle added to fleet!', 'success');
            setVehicleModalOpen(false);
        }
    };

    const handleDeleteVehicle = async (veh) => {
        if (!window.confirm(`Delete vehicle "${veh.regNo}" (${veh.driverName}) from fleet?`)) return;
        const updated = vehicles.filter(v => v.id !== veh.id);
        const ok = await saveTransportState({ vehicles: updated });
        if (ok) {
            setVehicles(updated);
            showAlert('Vehicle removed from fleet!', 'success');
        }
    };

    // -------------------------------------------------------------
    // 3. Route CRUD Handlers
    // -------------------------------------------------------------
    const handleOpenRouteModal = (rt = null) => {
        if (rt) {
            setEditingRoute(rt);
            setRouteFormData({
                title: rt.title || '',
                vehicleId: rt.vehicleId || '',
                startPoint: rt.startPoint || '',
                endPoint: rt.endPoint || 'School Campus',
                morningDepartureTime: rt.morningDepartureTime || '06:45 AM',
                afternoonDepartureTime: rt.afternoonDepartureTime || '01:45 PM',
                monthlyBaseFare: rt.monthlyBaseFare || 2500,
                stops: Array.isArray(rt.stops) && rt.stops.length > 0 ? rt.stops : [{ stopName: '', morningTime: '07:00 AM', afternoonTime: '02:00 PM', fare: 2500 }],
                notes: rt.notes || ''
            });
        } else {
            setEditingRoute(null);
            setRouteFormData({
                title: '',
                vehicleId: vehicles[0]?.id || '',
                startPoint: '',
                endPoint: 'School Campus',
                morningDepartureTime: '06:45 AM',
                afternoonDepartureTime: '01:45 PM',
                monthlyBaseFare: 2500,
                stops: [
                    { stopName: 'Stop 1: Main Commercial Chowk', morningTime: '07:00 AM', afternoonTime: '02:00 PM', fare: 2500 },
                    { stopName: 'Stop 2: Residential Sector Gate', morningTime: '07:15 AM', afternoonTime: '02:15 PM', fare: 3000 }
                ],
                notes: ''
            });
        }
        setRouteModalOpen(true);
    };

    const handleAddStopToForm = () => {
        setRouteFormData(prev => ({
            ...prev,
            stops: [
                ...prev.stops,
                { stopName: `Stop ${prev.stops.length + 1}`, morningTime: '07:20 AM', afternoonTime: '02:20 PM', fare: prev.monthlyBaseFare || 2500 }
            ]
        }));
    };

    const handleRemoveStopFromForm = (index) => {
        if (routeFormData.stops.length <= 1) {
            showAlert('Route must have at least one stop!', 'warning');
            return;
        }
        setRouteFormData(prev => ({
            ...prev,
            stops: prev.stops.filter((_, idx) => idx !== index)
        }));
    };

    const handleUpdateStopField = (index, field, value) => {
        setRouteFormData(prev => ({
            ...prev,
            stops: prev.stops.map((st, idx) => idx === index ? { ...st, [field]: value } : st)
        }));
    };

    const handleSaveRoute = async (e) => {
        e.preventDefault();
        if (!routeFormData.title.trim()) {
            showAlert('Route title is required!', 'error');
            return;
        }

        const validStops = routeFormData.stops.filter(s => s.stopName.trim());
        if (validStops.length === 0) {
            showAlert('Please specify at least one valid stop name!', 'error');
            return;
        }

        const newId = editingRoute ? editingRoute.id : `route_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const routeObj = {
            ...routeFormData,
            id: newId,
            stops: validStops.map(s => ({
                ...s,
                fare: Number(s.fare) || Number(routeFormData.monthlyBaseFare) || 2500
            })),
            monthlyBaseFare: Number(routeFormData.monthlyBaseFare) || 2500,
            updatedAt: new Date().toISOString()
        };

        const updatedRoutes = editingRoute
            ? routes.map(r => r.id === editingRoute.id ? routeObj : r)
            : [routeObj, ...routes];

        const ok = await saveTransportState({ routes: updatedRoutes });
        if (ok) {
            setRoutes(updatedRoutes);
            showAlert(editingRoute ? 'Route updated successfully!' : 'New transport route created!', 'success');
            setRouteModalOpen(false);
        }
    };

    const handleDeleteRoute = async (rt) => {
        if (!window.confirm(`Delete route "${rt.title}"?`)) return;
        const updated = routes.filter(r => r.id !== rt.id);
        const ok = await saveTransportState({ routes: updated });
        if (ok) {
            setRoutes(updated);
            showAlert('Route deleted!', 'success');
        }
    };

    // -------------------------------------------------------------
    // 4. Student Transport Allocation Handlers
    // -------------------------------------------------------------
    const handleOpenAllocationModal = () => {
        setAllocSelectedClassId(classesList[0]?.id || '');
        setAllocSelectedStudent(null);
        setAllocRouteId(routes[0]?.id || '');
        setAllocStopName(routes[0]?.stops[0]?.stopName || '');
        setAllocMonthlyFare(routes[0]?.stops[0]?.fare || 2500);
        setAllocTripType('both');
        setAllocParentPhone('');
        setAllocationModalOpen(true);
    };

    const handleRouteChangeInAlloc = (routeId) => {
        setAllocRouteId(routeId);
        const targetRoute = routes.find(r => r.id === routeId);
        if (targetRoute && targetRoute.stops && targetRoute.stops.length > 0) {
            setAllocStopName(targetRoute.stops[0].stopName);
            setAllocMonthlyFare(targetRoute.stops[0].fare || targetRoute.monthlyBaseFare || 2500);
        }
    };

    const handleStopChangeInAlloc = (stopName) => {
        setAllocStopName(stopName);
        const targetRoute = routes.find(r => r.id === allocRouteId);
        if (targetRoute) {
            const foundStop = (targetRoute.stops || []).find(s => s.stopName === stopName);
            if (foundStop) setAllocMonthlyFare(foundStop.fare);
        }
    };

    const handleSaveAllocation = async (e) => {
        e.preventDefault();
        if (!allocSelectedStudent) {
            showAlert('Please select a student!', 'error');
            return;
        }
        if (!allocRouteId || !allocStopName) {
            showAlert('Please select a route and pickup stop!', 'error');
            return;
        }

        const targetRoute = routes.find(r => r.id === allocRouteId);
        const targetVehicle = vehicles.find(v => v.id === targetRoute?.vehicleId);
        const className = classesList.find(c => c.id === allocSelectedClassId)?.name || 'Class';

        // Check vehicle capacity
        const currentRouteAllocations = allocations.filter(a => a.routeId === allocRouteId && a.studentId !== allocSelectedStudent.id);
        const maxCapacity = targetVehicle ? Number(targetVehicle.capacity) || 15 : 20;

        if (currentRouteAllocations.length >= maxCapacity) {
            if (!window.confirm(`Warning: Vehicle "${targetVehicle?.regNo}" is at maximum capacity (${maxCapacity} seats). Do you want to proceed anyway?`)) {
                return;
            }
        }

        setIsSavingAllocation(true);
        try {
            const allocId = `alloc_${allocSelectedStudent.id}`;
            const allocObj = {
                id: allocId,
                studentId: allocSelectedStudent.id,
                studentName: allocSelectedStudent.name,
                rollNo: allocSelectedStudent.rollNumber || allocSelectedStudent.rollNo || 'N/A',
                classId: allocSelectedClassId,
                className: className,
                routeId: allocRouteId,
                routeName: targetRoute?.title || 'Route',
                stopName: allocStopName,
                monthlyFare: Number(allocMonthlyFare) || 0,
                tripType: allocTripType,
                vehicleId: targetRoute?.vehicleId || '',
                vehicleRegNo: targetVehicle?.regNo || 'School Van',
                parentPhone: allocParentPhone || allocSelectedStudent.fatherPhone || allocSelectedStudent.phone || allocSelectedStudent.whatsapp || '',
                fatherName: allocSelectedStudent.fatherName || '',
                enrolledAt: new Date().toISOString()
            };

            const updatedAllocations = [allocObj, ...allocations.filter(a => a.studentId !== allocSelectedStudent.id)];

            // 1. Save to master Transport state
            await saveTransportState({ allocations: updatedAllocations });

            // 2. Sync to Student document in Firestore so fee ledger automatically recognizes transport charge
            try {
                const studentDocRef = doc(db, `schools/${schoolId}/classes/${allocSelectedClassId}/students`, allocSelectedStudent.id);
                await setDoc(studentDocRef, {
                    transportEnrolled: true,
                    transportFee: Number(allocMonthlyFare) || 0,
                    transportRouteId: allocRouteId,
                    transportStopName: allocStopName,
                    transportVehicleRegNo: targetVehicle?.regNo || '',
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (err) {
                console.log('Student doc transport flag sync skipped');
            }

            setAllocations(updatedAllocations);
            showAlert(`🎉 ${allocSelectedStudent.name} successfully enrolled in Transport!`, 'success');
            setAllocationModalOpen(false);

            // Ask to send WhatsApp timing notification
            if (allocObj.parentPhone) {
                if (window.confirm(`Would you like to send route timing details to parent (${allocObj.parentPhone}) on WhatsApp now?`)) {
                    sendRouteDetailsWhatsApp(allocObj);
                }
            }
        } catch (error) {
            console.error('Allocation error:', error);
            showAlert('Failed to allocate transport: ' + error.message, 'error');
        } finally {
            setIsSavingAllocation(false);
        }
    };

    const handleDeleteAllocation = async (alloc) => {
        if (!window.confirm(`Remove ${alloc.studentName} from school transport?`)) return;

        try {
            const updated = allocations.filter(a => a.id !== alloc.id);
            await saveTransportState({ allocations: updated });

            // Clear student document transport flags
            try {
                const studentDocRef = doc(db, `schools/${schoolId}/classes/${alloc.classId}/students`, alloc.studentId);
                await setDoc(studentDocRef, {
                    transportEnrolled: false,
                    transportFee: 0,
                    transportRouteId: '',
                    transportStopName: ''
                }, { merge: true });
            } catch (e) { }

            setAllocations(updated);
            showAlert(`${alloc.studentName} removed from transport.`, 'success');
        } catch (error) {
            showAlert('Failed to remove allocation: ' + error.message, 'error');
        }
    };

    // -------------------------------------------------------------
    // 5. Fuel & Maintenance Log Handlers
    // -------------------------------------------------------------
    const handleOpenLogModal = (type = 'fuel') => {
        setLogFormData({
            type,
            vehicleId: vehicles[0]?.id || '',
            date: new Date().toISOString().slice(0, 10),
            liters: 20,
            ratePerLiter: 285,
            totalCost: 5700,
            odometerKm: '',
            maintenanceType: 'Engine Oil & Filter Change',
            vendorName: '',
            receiptUrl: '',
            receiptFileName: '',
            notes: ''
        });
        setLogModalOpen(true);
    };

    const handleReceiptFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 8 * 1024 * 1024) {
            showAlert('Receipt image size should be less than 8MB', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDim = 1200;
                let width = img.width;
                let height = img.height;
                if (width > height && width > maxDim) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else if (height > maxDim) {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
                setLogFormData(prev => ({
                    ...prev,
                    receiptUrl: compressedBase64,
                    receiptFileName: file.name
                }));
                showAlert('Receipt proof attached!', 'success');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    const handleSaveFuelLog = async (e) => {
        e.preventDefault();
        if (!logFormData.vehicleId) {
            showAlert('Please select a vehicle!', 'error');
            return;
        }

        const logId = `log_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const targetVehicle = vehicles.find(v => v.id === logFormData.vehicleId);

        const calculatedCost = logFormData.type === 'fuel'
            ? (Number(logFormData.liters) || 0) * (Number(logFormData.ratePerLiter) || 0)
            : Number(logFormData.totalCost) || 0;

        const logObj = {
            ...logFormData,
            id: logId,
            vehicleRegNo: targetVehicle ? targetVehicle.regNo : 'Van',
            totalCost: calculatedCost,
            liters: Number(logFormData.liters) || 0,
            ratePerLiter: Number(logFormData.ratePerLiter) || 0,
            receiptUrl: logFormData.receiptUrl || '',
            receiptFileName: logFormData.receiptFileName || '',
            createdAt: new Date().toISOString()
        };

        const updatedLogs = [logObj, ...fuelLogs];
        const ok = await saveTransportState({ fuelLogs: updatedLogs });
        if (ok) {
            setFuelLogs(updatedLogs);
            showAlert(logFormData.type === 'fuel' ? 'Fuel entry logged!' : 'Maintenance expense logged!', 'success');
            setLogModalOpen(false);
        }
    };

    const handleDeleteFuelLog = async (logItem) => {
        if (!window.confirm(`Delete this ${logItem.type} entry?`)) return;
        const updated = fuelLogs.filter(l => l.id !== logItem.id);
        const ok = await saveTransportState({ fuelLogs: updated });
        if (ok) {
            setFuelLogs(updated);
            showAlert('Log entry deleted!', 'success');
        }
    };

    // --- Monthly Transport Expense Report PDF Generator ---
    const downloadMonthlyExpenseReportPDF = () => {
        const targetMonth = expenseMonthFilter || new Date().toISOString().slice(0, 7);
        const filtered = fuelLogs.filter(l => {
            const matchesVehicle = fuelVehicleFilter === 'All' || l.vehicleId === fuelVehicleFilter;
            const matchesMonth = !expenseMonthFilter || (l.date && l.date.startsWith(expenseMonthFilter));
            return matchesVehicle && matchesMonth;
        });

        if (filtered.length === 0) {
            showAlert('No fuel or maintenance logs found for selected month/filter!', 'warning');
            return;
        }

        const doc = new jsPDF();

        // School Header
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text((schoolInfo.name || 'School Transport Management').toUpperCase(), 105, 12, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('MONTHLY TRANSPORT FUEL & FLEET EXPENSE STATEMENT', 105, 18, { align: 'center' });

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Period / Month: ${targetMonth}   |   Generated: ${new Date().toLocaleDateString()}   |   Vehicle: ${fuelVehicleFilter === 'All' ? 'All Fleet' : (vehicles.find(v => v.id === fuelVehicleFilter)?.regNo || 'Selected')}`, 105, 23, { align: 'center' });

        let totalFuelLiters = 0;
        let totalFuelExpense = 0;
        let totalMaintExpense = 0;

        filtered.forEach(l => {
            if (l.type === 'fuel') {
                totalFuelLiters += Number(l.liters) || 0;
                totalFuelExpense += Number(l.totalCost) || 0;
            } else {
                totalMaintExpense += Number(l.totalCost) || 0;
            }
        });

        const netOperatingExpense = totalFuelExpense + totalMaintExpense;

        // KPI Summary Box Table
        autoTable(doc, {
            startY: 28,
            head: [['Total Fuel Liters', 'Total Fuel Cost', 'Total Repair/Maint Cost', 'Net Fleet Operating Expense']],
            body: [[
                `${totalFuelLiters.toLocaleString()} Liters`,
                `PKR ${totalFuelExpense.toLocaleString()}`,
                `PKR ${totalMaintExpense.toLocaleString()}`,
                `PKR ${netOperatingExpense.toLocaleString()}`
            ]],
            headStyles: { fillColor: [15, 23, 42], halign: 'center' },
            bodyStyles: { halign: 'center', fontStyle: 'bold' },
            theme: 'grid'
        });

        // Itemized Table
        const tableBody = filtered.map((l, idx) => {
            const details = l.type === 'fuel'
                ? `${l.liters} Ltr @ PKR ${l.ratePerLiter}/L`
                : l.maintenanceType;
            return [
                idx + 1,
                l.date || '—',
                l.vehicleRegNo || 'Van',
                l.type === 'fuel' ? 'Fuel Fill-up' : 'Service/Repair',
                details,
                l.odometerKm ? `${l.odometerKm} KM` : '—',
                l.vendorName || '—',
                l.receiptUrl ? 'Yes (Attached)' : 'No Slip',
                `PKR ${l.totalCost}`
            ];
        });

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 7,
            head: [['#', 'Date', 'Vehicle', 'Type', 'Service / Fuel Details', 'Odometer', 'Vendor/Pump', 'Receipt', 'Total (PKR)']],
            body: tableBody,
            headStyles: { fillColor: [2, 132, 199] },
            styles: { fontSize: 8 },
            columnStyles: {
                8: { halign: 'right', fontStyle: 'bold' }
            },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        // Signatures
        const finalY = doc.lastAutoTable.finalY + 16;
        if (finalY < 270) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('Prepared By: ___________________', 20, finalY);
            doc.text('Transport Officer: ___________________', 85, finalY);
            doc.text('Principal / Admin: ___________________', 150, finalY);
        }

        doc.save(`Transport_Expense_Report_${targetMonth}.pdf`);
        showAlert(`Monthly Transport Expense Report (${targetMonth}) downloaded!`, 'success');
    };

    // -------------------------------------------------------------
    // 6. Daily Boarding Attendance Handlers
    // -------------------------------------------------------------
    const getAttendanceKey = () => {
        const rId = attendanceRouteId || (routes[0]?.id || 'all');
        return `${attendanceDate}_${rId}_${attendanceTripType}`;
    };

    const handleToggleStudentBoarding = async (studentId, currentStatus) => {
        const key = getAttendanceKey();
        const nextStatus = currentStatus === 'boarded' ? 'absent' : 'boarded';
        const updatedSubMap = {
            ...(attendanceLogs[key] || {}),
            [studentId]: nextStatus
        };

        const updatedMasterMap = {
            ...attendanceLogs,
            [key]: updatedSubMap
        };

        setAttendanceLogs(updatedMasterMap);
        await saveTransportState({ attendanceLogs: updatedMasterMap });

        // Optionally send WhatsApp alert if boarded
        if (nextStatus === 'boarded') {
            const alloc = allocations.find(a => a.studentId === studentId);
            if (alloc && alloc.parentPhone) {
                sendBoardingAlertWhatsApp(alloc, 'boarded');
            }
        }
    };

    const handleMarkAllBoarded = async () => {
        const key = getAttendanceKey();
        const currentRouteAllocs = allocations.filter(a => !attendanceRouteId || a.routeId === attendanceRouteId);
        const updatedSubMap = { ...(attendanceLogs[key] || {}) };

        currentRouteAllocs.forEach(a => {
            updatedSubMap[a.studentId] = 'boarded';
        });

        const updatedMasterMap = {
            ...attendanceLogs,
            [key]: updatedSubMap
        };

        setAttendanceLogs(updatedMasterMap);
        await saveTransportState({ attendanceLogs: updatedMasterMap });
        showAlert(`All ${currentRouteAllocs.length} students marked boarded for today's trip!`, 'success');
    };

    // -------------------------------------------------------------
    // Financial & Capacity Metrics Computation
    // -------------------------------------------------------------
    const metrics = useMemo(() => {
        const totalVehicles = vehicles.length;
        const activeVehicles = vehicles.filter(v => v.status === 'Active').length;
        const totalCapacity = vehicles.reduce((acc, v) => acc + (Number(v.capacity) || 0), 0);
        const totalEnrolled = allocations.length;
        const availableSeats = Math.max(0, totalCapacity - totalEnrolled);
        const monthlyRevenue = allocations.reduce((acc, a) => acc + (Number(a.monthlyFare) || 0), 0);

        const currentMonthPrefix = new Date().toISOString().slice(0, 7);
        let monthlyFuelCost = 0;
        let monthlyMaintCost = 0;

        fuelLogs.forEach(l => {
            if (l.date && l.date.startsWith(currentMonthPrefix)) {
                if (l.type === 'fuel') monthlyFuelCost += Number(l.totalCost) || 0;
                if (l.type === 'maintenance') monthlyMaintCost += Number(l.totalCost) || 0;
            }
        });

        const totalExpense = monthlyFuelCost + monthlyMaintCost;
        const netProfit = Math.max(0, monthlyRevenue - totalExpense);

        return {
            totalVehicles,
            activeVehicles,
            totalCapacity,
            totalEnrolled,
            availableSeats,
            monthlyRevenue,
            monthlyFuelCost,
            monthlyMaintCost,
            totalExpense,
            netProfit
        };
    }, [vehicles, allocations, fuelLogs]);

    // -------------------------------------------------------------
    // Printable Transport List PDF Generator
    // -------------------------------------------------------------
    const downloadTransportReportPDF = () => {
        const doc = new jsPDF();

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(schoolInfo.name, 105, 12, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('OFFICIAL TRANSPORT & VAN FLEET DIRECTORY', 105, 18, { align: 'center' });
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 23, { align: 'center' });

        const tableBody = allocations.map((a, idx) => {
            const rt = routes.find(r => r.id === a.routeId);
            return [
                idx + 1,
                a.studentName,
                a.className,
                a.vehicleRegNo,
                a.stopName,
                `PKR ${a.monthlyFare}`,
                a.parentPhone || '—'
            ];
        });

        autoTable(doc, {
            startY: 28,
            head: [['#', 'Student Name', 'Class', 'Van No', 'Pickup Stop', 'Monthly Fee', 'Parent Contact']],
            body: tableBody,
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        doc.save(`Transport_Roster_${new Date().toISOString().slice(0, 10)}.pdf`);
        showAlert('Transport Roster PDF downloaded!', 'success');
    };

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
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 16px -4px rgba(2, 132, 199, 0.4)'
                    }}>
                        <Bus color="white" size={26} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                            Transport & Van Fleet Management
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.86rem', margin: 0 }}>
                            School Vans, Bus Routes, Stops, Student Seat Allocations, Fuel Logs & WhatsApp Notifications
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={downloadTransportReportPDF}
                        className="btn"
                        style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            padding: '0.65rem 1rem',
                            borderRadius: '10px',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            cursor: 'pointer'
                        }}
                    >
                        <Download size={16} /> Export PDF Roster
                    </button>
                    <button
                        onClick={handleOpenAllocationModal}
                        className="btn hover-lift"
                        style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            padding: '0.65rem 1.25rem',
                            borderRadius: '10px',
                            fontWeight: '700',
                            fontSize: '0.88rem',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <Users size={18} /> + Allocate Student Seat
                    </button>
                    <button
                        onClick={() => handleOpenVehicleModal()}
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
                        <Plus size={18} /> Add New Vehicle
                    </button>
                </div>
            </div>

            {/* Quick Metrics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #0284c7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Fleet Size</span>
                        <Bus size={18} color="#0284c7" />
                    </div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: '0.3rem 0' }}>
                        {metrics.totalVehicles} Vehicles
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '600' }}>
                        🟢 {metrics.activeVehicles} Active on Road
                    </span>
                </div>

                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #10b981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Enrolled Students</span>
                        <Users size={18} color="#10b981" />
                    </div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#10b981', margin: '0.3rem 0' }}>
                        {metrics.totalEnrolled} Students
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {metrics.totalCapacity} Total Seats ({metrics.availableSeats} Vacant)
                    </span>
                </div>

                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #6366f1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Monthly Fare Revenue</span>
                        <DollarSign size={18} color="#6366f1" />
                    </div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#4f46e5', margin: '0.3rem 0' }}>
                        PKR {metrics.monthlyRevenue.toLocaleString()}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        From {routes.length} Active Routes
                    </span>
                </div>

                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Fuel & Repairs (Month)</span>
                        <Fuel size={18} color="#f59e0b" />
                    </div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#d97706', margin: '0.3rem 0' }}>
                        PKR {metrics.totalExpense.toLocaleString()}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Fuel: {metrics.monthlyFuelCost} | Maint: {metrics.monthlyMaintCost}
                    </span>
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
                    { id: 'fleet', label: '🚐 Fleet & Vehicles', count: vehicles.length },
                    { id: 'routes', label: '🗺️ Routes & Stops', count: routes.length },
                    { id: 'allocations', label: '🎓 Student Allocations', count: allocations.length },
                    { id: 'fuel_logs', label: '⛽ Fuel & Maintenance', count: fuelLogs.length },
                    { id: 'attendance', label: '📋 Daily Boarding Attendance' }
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
                            color: activeTab === tab.id ? '#0284c7' : '#64748b',
                            fontWeight: activeTab === tab.id ? '700' : '600',
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            borderBottom: activeTab === tab.id ? '3px solid #0284c7' : '3px solid transparent',
                            marginBottom: '-2px',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <span>{tab.label}</span>
                        {tab.count !== undefined && (
                            <span style={{
                                background: activeTab === tab.id ? '#e0f2fe' : '#f1f5f9',
                                color: activeTab === tab.id ? '#0369a1' : '#64748b',
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
            {/* TAB 1: FLEET & VEHICLES DIRECTORY */}
            {/* ========================================================================= */}
            {activeTab === 'fleet' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ position: 'relative', width: '320px' }}>
                            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Search by Reg No, Driver, or Model..."
                                value={vehicleSearch}
                                onChange={(e) => setVehicleSearch(e.target.value)}
                                style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            />
                        </div>

                        <button
                            onClick={() => handleOpenVehicleModal()}
                            className="btn"
                            style={{ background: '#0284c7', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                        >
                            <Plus size={16} /> Register New Van / Bus
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
                        {vehicles
                            .filter(v => v.regNo.toLowerCase().includes(vehicleSearch.toLowerCase()) || (v.driverName && v.driverName.toLowerCase().includes(vehicleSearch.toLowerCase())))
                            .map(veh => {
                                const enrolledCount = allocations.filter(a => a.vehicleId === veh.id).length;
                                const isFull = enrolledCount >= veh.capacity;

                                return (
                                    <div
                                        key={veh.id}
                                        className="card"
                                        style={{
                                            padding: '1.25rem',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            background: '#ffffff',
                                            borderRadius: '14px',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                        }}
                                    >
                                        <div>
                                            {/* Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <span style={{
                                                        padding: '0.2rem 0.55rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '800',
                                                        background: '#0f172a',
                                                        color: '#ffffff',
                                                        letterSpacing: '0.05em'
                                                    }}>
                                                        {veh.regNo}
                                                    </span>
                                                    <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: '0.35rem 0 0 0' }}>
                                                        {veh.type}
                                                    </h3>
                                                </div>

                                                <span style={{
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '9999px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    background: veh.status === 'Active' ? '#dcfce7' : veh.status === 'Maintenance' ? '#fef3c7' : '#f1f5f9',
                                                    color: veh.status === 'Active' ? '#15803d' : veh.status === 'Maintenance' ? '#b45309' : '#64748b'
                                                }}>
                                                    ● {veh.status}
                                                </span>
                                            </div>

                                            {/* Seat Capacity Progress Bar */}
                                            <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '0.85rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', fontWeight: '700', marginBottom: '0.3rem' }}>
                                                    <span style={{ color: '#64748b' }}>Seat Occupancy</span>
                                                    <span style={{ color: isFull ? '#ef4444' : '#10b981' }}>
                                                        {enrolledCount} / {veh.capacity} Seats Filled
                                                    </span>
                                                </div>
                                                <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: `${Math.min(100, (enrolledCount / (veh.capacity || 1)) * 100)}%`,
                                                        background: isFull ? '#ef4444' : 'linear-gradient(90deg, #10b981, #059669)',
                                                        borderRadius: '9999px'
                                                    }} />
                                                </div>
                                            </div>

                                            {/* Driver & Staff Info */}
                                            <div style={{ fontSize: '0.82rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
                                                <div>
                                                    <strong style={{ color: '#0f172a' }}>Driver:</strong> {veh.driverName || 'Not Assigned'}
                                                    {veh.driverPhone && (
                                                        <span style={{ marginLeft: '0.35rem', color: '#0284c7', fontWeight: '600' }}>
                                                            ({veh.driverPhone})
                                                        </span>
                                                    )}
                                                </div>
                                                {veh.driverLicense && (
                                                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                                        License: <strong>{veh.driverLicense}</strong> | CNIC: {veh.driverCnic || '—'}
                                                    </div>
                                                )}
                                                {veh.helperName && (
                                                    <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                                                        Conductor / Helper: <strong>{veh.helperName}</strong> ({veh.helperPhone || '—'})
                                                    </div>
                                                )}
                                            </div>

                                            {/* Document Expiry Warnings */}
                                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                                                {veh.fitnessExpiry && (
                                                    <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>
                                                        Fitness: {veh.fitnessExpiry}
                                                    </span>
                                                )}
                                                {veh.tokenTaxExpiry && (
                                                    <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>
                                                        Token: {veh.tokenTaxExpiry}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                                            {veh.driverPhone && (
                                                <button
                                                    onClick={() => window.open(`https://wa.me/${formatWhatsAppPhone(veh.driverPhone)}`, '_blank')}
                                                    className="btn"
                                                    style={{ background: '#dcfce7', color: '#15803d', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem' }}
                                                >
                                                    <MessageSquare size={14} /> WhatsApp
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleOpenVehicleModal(veh)}
                                                className="btn"
                                                style={{ flex: 1, background: '#f1f5f9', color: '#334155', padding: '0.35rem', borderRadius: '6px', fontSize: '0.78rem', justifyContent: 'center' }}
                                            >
                                                <Edit size={14} /> Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteVehicle(veh)}
                                                style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.35rem 0.6rem', borderRadius: '6px', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: ROUTES & STOPS MANAGER */}
            {/* ========================================================================= */}
            {activeTab === 'routes' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ position: 'relative', width: '320px' }}>
                            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Search by Route name or Stop..."
                                value={routeSearch}
                                onChange={(e) => setRouteSearch(e.target.value)}
                                style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            />
                        </div>

                        <button
                            onClick={() => handleOpenRouteModal()}
                            className="btn"
                            style={{ background: '#0284c7', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                        >
                            <Plus size={16} /> Create New Route
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {routes
                            .filter(r => r.title.toLowerCase().includes(routeSearch.toLowerCase()) || (r.stops && r.stops.some(s => s.stopName.toLowerCase().includes(routeSearch.toLowerCase()))))
                            .map(route => {
                                const assignedVehicle = vehicles.find(v => v.id === route.vehicleId);
                                const routeAllocs = allocations.filter(a => a.routeId === route.id);

                                return (
                                    <div
                                        key={route.id}
                                        className="card"
                                        style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '14px', background: '#ffffff' }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <div>
                                                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.25rem 0' }}>
                                                    {route.title}
                                                </h3>
                                                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
                                                    <span>🚐 Assigned Van: <strong>{assignedVehicle ? assignedVehicle.regNo : 'Unassigned'}</strong></span>
                                                    <span>👨‍✈️ Driver: <strong>{assignedVehicle ? assignedVehicle.driverName : 'Unassigned'}</strong></span>
                                                    <span>👥 <strong>{routeAllocs.length} Students Allocated</strong></span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleOpenRouteModal(route)}
                                                    className="btn"
                                                    style={{ background: '#f1f5f9', color: '#4f46e5', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}
                                                >
                                                    <Edit size={14} /> Edit Route & Stops
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteRoute(route)}
                                                    style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer' }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Stops Timeline Table */}
                                        <div style={{ overflowX: 'auto', background: '#f8fafc', borderRadius: '10px', padding: '0.5rem', border: '1px solid #e2e8f0' }}>
                                            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                                                        <th style={{ padding: '0.5rem' }}>Stop Sequence</th>
                                                        <th style={{ padding: '0.5rem' }}>Stop Name / Landmark</th>
                                                        <th style={{ padding: '0.5rem' }}>Morning Pickup Time</th>
                                                        <th style={{ padding: '0.5rem' }}>Afternoon Drop Time</th>
                                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Monthly Stop Fare</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(route.stops || []).map((stop, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '0.5rem', fontWeight: '700', color: '#0284c7' }}>
                                                                Stop #{idx + 1}
                                                            </td>
                                                            <td style={{ padding: '0.5rem', fontWeight: '600', color: '#0f172a' }}>
                                                                📍 {stop.stopName}
                                                            </td>
                                                            <td style={{ padding: '0.5rem', color: '#059669', fontWeight: '600' }}>
                                                                ⏰ {stop.morningTime || '07:15 AM'}
                                                            </td>
                                                            <td style={{ padding: '0.5rem', color: '#d97706', fontWeight: '600' }}>
                                                                🏠 {stop.afternoonTime || '02:00 PM'}
                                                            </td>
                                                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '800', color: '#0f172a' }}>
                                                                PKR {stop.fare}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}

                        {routes.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                <MapPin size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                <h4>No Transport Routes Configured Yet</h4>
                                <p>Click "Create New Route" above to define stops and pickup timings.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: STUDENT TRANSPORT ALLOCATIONS */}
            {/* ========================================================================= */}
            {activeTab === 'allocations' && (
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', width: '260px' }}>
                                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by student name, roll no..."
                                    value={allocationSearch}
                                    onChange={(e) => setAllocationSearch(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <select
                                value={allocationClassFilter}
                                onChange={(e) => setAllocationClassFilter(e.target.value)}
                                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            >
                                <option value="All">All Classes</option>
                                {classesList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>

                            <select
                                value={allocationRouteFilter}
                                onChange={(e) => setAllocationRouteFilter(e.target.value)}
                                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            >
                                <option value="All">All Routes</option>
                                {routes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                            </select>
                        </div>

                        <button
                            onClick={handleOpenAllocationModal}
                            className="btn hover-lift"
                            style={{ background: '#10b981', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                        >
                            <Plus size={16} /> Allocate Student Seat
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                    <th style={{ padding: '0.75rem 1rem' }}>Student Name</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Class</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Assigned Van</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Pickup Stop</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Monthly Fee</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Parent Contact</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocations
                                    .filter(a => {
                                        const matchesSearch = a.studentName.toLowerCase().includes(allocationSearch.toLowerCase()) ||
                                            (a.rollNo && a.rollNo.toString().includes(allocationSearch));
                                        const matchesClass = allocationClassFilter === 'All' || a.className === allocationClassFilter;
                                        const matchesRoute = allocationRouteFilter === 'All' || a.routeId === allocationRouteFilter;
                                        return matchesSearch && matchesClass && matchesRoute;
                                    })
                                    .map(alloc => (
                                        <tr key={alloc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                                {alloc.studentName}
                                                <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>
                                                    Father: {alloc.fatherName || 'N/A'} · Roll #{alloc.rollNo}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                                                {alloc.className}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#0f172a', color: 'white', fontSize: '0.72rem', fontWeight: '700' }}>
                                                    {alloc.vehicleRegNo}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#0284c7', fontWeight: '600' }}>
                                                📍 {alloc.stopName}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: '800', color: '#10b981' }}>
                                                PKR {alloc.monthlyFare}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#64748b' }}>
                                                {alloc.parentPhone || '—'}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem' }}>
                                                    <button
                                                        onClick={() => sendRouteDetailsWhatsApp(alloc)}
                                                        title="Send WhatsApp Route & Timings"
                                                        className="btn"
                                                        style={{ background: '#dcfce7', color: '#15803d', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.76rem' }}
                                                    >
                                                        <MessageSquare size={14} /> Send WhatsApp
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAllocation(alloc)}
                                                        title="Remove from Transport"
                                                        style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                {allocations.length === 0 && (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                            No students enrolled in school transport yet. Click "Allocate Student Seat" above.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: FUEL & MAINTENANCE LOGBOOK */}
            {/* ========================================================================= */}
            {activeTab === 'fuel_logs' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>Filter by Vehicle:</label>
                                <select
                                    value={fuelVehicleFilter}
                                    onChange={(e) => setFuelVehicleFilter(e.target.value)}
                                    style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                >
                                    <option value="All">All Fleet Vehicles</option>
                                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNo} ({v.type})</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>Billing Month / Period:</label>
                                <input
                                    type="month"
                                    value={expenseMonthFilter}
                                    onChange={(e) => setExpenseMonthFilter(e.target.value)}
                                    style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ alignSelf: 'flex-end' }}>
                                <button
                                    onClick={downloadMonthlyExpenseReportPDF}
                                    className="btn"
                                    style={{
                                        background: '#0284c7',
                                        color: 'white',
                                        padding: '0.55rem 1rem',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        fontWeight: '700',
                                        boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
                                    }}
                                >
                                    <Download size={15} /> Download Monthly Statement (PDF)
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => handleOpenLogModal('fuel')}
                                className="btn hover-lift"
                                style={{ background: '#f59e0b', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700' }}
                            >
                                <Fuel size={16} /> + Log Fuel Entry
                            </button>
                            <button
                                onClick={() => handleOpenLogModal('maintenance')}
                                className="btn hover-lift"
                                style={{ background: '#4f46e5', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700' }}
                            >
                                <Wrench size={16} /> + Log Repair / Service
                            </button>
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1.25rem' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                        <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Vehicle</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Details / Service</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Odometer (KM)</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Receipt / Proof</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Expense</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fuelLogs
                                        .filter(l => {
                                            const matchesVeh = fuelVehicleFilter === 'All' || l.vehicleId === fuelVehicleFilter;
                                            const matchesMo = !expenseMonthFilter || (l.date && l.date.startsWith(expenseMonthFilter));
                                            return matchesVeh && matchesMo;
                                        })
                                        .map(log => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                    <span style={{
                                                        padding: '0.2rem 0.55rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '700',
                                                        background: log.type === 'fuel' ? '#fef3c7' : '#e0e7ff',
                                                        color: log.type === 'fuel' ? '#b45309' : '#4338ca'
                                                    }}>
                                                        {log.type === 'fuel' ? '⛽ Fuel Fill-up' : '🔧 Service / Repair'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                                    {log.vehicleRegNo}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#64748b' }}>
                                                    {log.date}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#334155' }}>
                                                    {log.type === 'fuel'
                                                        ? `${log.liters} Liters @ PKR ${log.ratePerLiter}/L`
                                                        : log.maintenanceType}
                                                    {log.vendorName && <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>Vendor: {log.vendorName}</span>}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#64748b' }}>
                                                    {log.odometerKm ? `${log.odometerKm} KM` : '—'}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                    {log.receiptUrl ? (
                                                        <button
                                                            onClick={() => setViewingReceipt(log)}
                                                            className="btn hover-lift"
                                                            style={{
                                                                background: '#ecfdf5',
                                                                border: '1px solid #a7f3d0',
                                                                color: '#059669',
                                                                padding: '0.25rem 0.6rem',
                                                                borderRadius: '6px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '700',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.3rem',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <Eye size={13} /> View Receipt
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                            No Slip Attached
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: '800', color: '#e11d48' }}>
                                                    PKR {log.totalCost}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleDeleteFuelLog(log)}
                                                        style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}

                                    {fuelLogs.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                                No fuel or maintenance records logged yet.
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
            {/* TAB 5: DAILY BOARDING ATTENDANCE */}
            {/* ========================================================================= */}
            {activeTab === 'attendance' && (
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>Trip Date:</label>
                                <input
                                    type="date"
                                    value={attendanceDate}
                                    onChange={(e) => setAttendanceDate(e.target.value)}
                                    style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>Select Route / Van:</label>
                                <select
                                    value={attendanceRouteId}
                                    onChange={(e) => setAttendanceRouteId(e.target.value)}
                                    style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                >
                                    <option value="">All Routes</option>
                                    {routes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>Trip Slot:</label>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setAttendanceTripType('morning')}
                                        style={{
                                            padding: '0.45rem 0.75rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: attendanceTripType === 'morning' ? '#0284c7' : '#f1f5f9',
                                            color: attendanceTripType === 'morning' ? 'white' : '#64748b',
                                            fontWeight: '700',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🌅 Morning Pickup
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAttendanceTripType('afternoon')}
                                        style={{
                                            padding: '0.45rem 0.75rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: attendanceTripType === 'afternoon' ? '#0284c7' : '#f1f5f9',
                                            color: attendanceTripType === 'afternoon' ? 'white' : '#64748b',
                                            fontWeight: '700',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🏠 Afternoon Drop
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleMarkAllBoarded}
                            className="btn hover-lift"
                            style={{ background: '#10b981', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                        >
                            ✓ Mark All Boarded (Safe)
                        </button>
                    </div>

                    {/* Boarding Checklist Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                    <th style={{ padding: '0.75rem 1rem' }}>Student Name</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Class</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Stop Name</th>
                                    <th style={{ padding: '0.75rem 1rem' }}>Assigned Van</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Boarding Status</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>WhatsApp Alert</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocations
                                    .filter(a => !attendanceRouteId || a.routeId === attendanceRouteId)
                                    .map(alloc => {
                                        const key = getAttendanceKey();
                                        const status = (attendanceLogs[key] && attendanceLogs[key][alloc.studentId]) || 'pending';

                                        return (
                                            <tr key={alloc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                                    {alloc.studentName}
                                                    <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>
                                                        Father: {alloc.fatherName || 'N/A'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                                                    {alloc.className}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#0284c7', fontWeight: '600' }}>
                                                    📍 {alloc.stopName}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#0f172a', fontWeight: '600' }}>
                                                    {alloc.vehicleRegNo}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleToggleStudentBoarding(alloc.studentId, status)}
                                                        style={{
                                                            padding: '0.35rem 0.85rem',
                                                            borderRadius: '9999px',
                                                            border: 'none',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            background: status === 'boarded' ? '#dcfce7' : status === 'absent' ? '#fee2e2' : '#f1f5f9',
                                                            color: status === 'boarded' ? '#15803d' : status === 'absent' ? '#ef4444' : '#64748b'
                                                        }}
                                                    >
                                                        {status === 'boarded' ? '✓ Boarded (Safe)' : status === 'absent' ? '✕ Absent' : '⏳ Pending'}
                                                    </button>
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => sendBoardingAlertWhatsApp(alloc, status === 'boarded' ? 'boarded' : 'reached')}
                                                        className="btn"
                                                        style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem' }}
                                                    >
                                                        <MessageSquare size={13} /> Send Alert
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                {allocations.length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                            No students enrolled in this route.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 1. ADD / EDIT VEHICLE MODAL */}
            {/* ========================================================================= */}
            {vehicleModalOpen && (
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
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '600px', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                {editingVehicle ? 'Edit Vehicle Profile' : 'Register New Vehicle'}
                            </h3>
                            <button onClick={() => setVehicleModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveVehicle}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Registration Number *:</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. LEA-2024 or KHI-8891"
                                        value={vehicleFormData.regNo}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, regNo: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Seating Capacity *:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={vehicleFormData.capacity}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, capacity: Number(e.target.value) })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Vehicle Type:</label>
                                    <select
                                        value={vehicleFormData.type}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, type: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Status:</label>
                                    <select
                                        value={vehicleFormData.status}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, status: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Maintenance">Maintenance</option>
                                        <option value="Off Duty">Off Duty</option>
                                    </select>
                                </div>
                            </div>

                            {/* Driver Profile */}
                            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>👨‍✈️ Driver Information</span>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Driver Full Name"
                                        value={vehicleFormData.driverName}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, driverName: e.target.value })}
                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Mobile / WhatsApp (0300...)"
                                        value={vehicleFormData.driverPhone}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, driverPhone: e.target.value })}
                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Driving License No"
                                        value={vehicleFormData.driverLicense}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, driverLicense: e.target.value })}
                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Driver CNIC (35201-...)"
                                        value={vehicleFormData.driverCnic}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, driverCnic: e.target.value })}
                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                    />
                                </div>
                            </div>

                            {/* Helper / Conductor */}
                            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>🤝 Conductor / Helper (Optional)</span>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Helper Name"
                                        value={vehicleFormData.helperName}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, helperName: e.target.value })}
                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Helper Phone No"
                                        value={vehicleFormData.helperPhone}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, helperPhone: e.target.value })}
                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                    />
                                </div>
                            </div>

                            {/* Document Expiries */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#64748b' }}>Fitness Expiry:</label>
                                    <input
                                        type="date"
                                        value={vehicleFormData.fitnessExpiry}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, fitnessExpiry: e.target.value })}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#64748b' }}>Token Tax Expiry:</label>
                                    <input
                                        type="date"
                                        value={vehicleFormData.tokenTaxExpiry}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, tokenTaxExpiry: e.target.value })}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#64748b' }}>Insurance Expiry:</label>
                                    <input
                                        type="date"
                                        value={vehicleFormData.insuranceExpiry}
                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, insuranceExpiry: e.target.value })}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setVehicleModalOpen(false)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ flex: 2, background: '#0284c7', color: 'white', padding: '0.65rem', borderRadius: '8px', fontWeight: '700', justifyContent: 'center' }}
                                >
                                    {editingVehicle ? 'Update Vehicle' : 'Save to Fleet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 2. ADD / EDIT ROUTE MODAL */}
            {/* ========================================================================= */}
            {routeModalOpen && (
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
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '680px', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                {editingRoute ? 'Edit Transport Route & Stops' : 'Create New Route'}
                            </h3>
                            <button onClick={() => setRouteModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveRoute}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Route Title *:</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Route #3: Shadman -> Gulberg -> Campus"
                                    value={routeFormData.title}
                                    onChange={(e) => setRouteFormData({ ...routeFormData, title: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Assigned Van / Bus:</label>
                                    <select
                                        value={routeFormData.vehicleId}
                                        onChange={(e) => setRouteFormData({ ...routeFormData, vehicleId: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        <option value="">-- Select Vehicle --</option>
                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNo} ({v.type})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Default Monthly Base Fare (PKR):</label>
                                    <input
                                        type="number"
                                        value={routeFormData.monthlyBaseFare}
                                        onChange={(e) => setRouteFormData({ ...routeFormData, monthlyBaseFare: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700', color: '#10b981' }}
                                    />
                                </div>
                            </div>

                            {/* Dynamic Stops Builder */}
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a' }}>
                                        📍 Route Stops & Pickup Sequence:
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddStopToForm}
                                        style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        + Add Next Stop
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto', padding: '0.35rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fafbfc' }}>
                                    {routeFormData.stops.map((stop, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'white', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0284c7', minWidth: '22px' }}>
                                                #{idx + 1}
                                            </span>
                                            <input
                                                type="text"
                                                placeholder="Stop Landmark (e.g. Liberty Chowk)"
                                                value={stop.stopName}
                                                onChange={(e) => handleUpdateStopField(idx, 'stopName', e.target.value)}
                                                style={{ flex: 3, padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Pick (07:15 AM)"
                                                value={stop.morningTime}
                                                onChange={(e) => handleUpdateStopField(idx, 'morningTime', e.target.value)}
                                                style={{ width: '95px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Drop (02:00 PM)"
                                                value={stop.afternoonTime}
                                                onChange={(e) => handleUpdateStopField(idx, 'afternoonTime', e.target.value)}
                                                style={{ width: '95px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Fare"
                                                value={stop.fare}
                                                onChange={(e) => handleUpdateStopField(idx, 'fare', Number(e.target.value))}
                                                style={{ width: '75px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: '700', color: '#10b981' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveStopFromForm(idx)}
                                                style={{ background: '#fee2e2', border: 'none', color: '#ef4444', borderRadius: '4px', padding: '0.35rem', cursor: 'pointer' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setRouteModalOpen(false)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ flex: 2, background: '#0284c7', color: 'white', padding: '0.65rem', borderRadius: '8px', fontWeight: '700', justifyContent: 'center' }}
                                >
                                    {editingRoute ? 'Update Route' : 'Save Route'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 3. ALLOCATE STUDENT TRANSPORT SEAT MODAL */}
            {/* ========================================================================= */}
            {allocationModalOpen && (
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
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '580px', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Users color="#10b981" size={20} /> Allocate Student to Transport
                            </h3>
                            <button onClick={() => setAllocationModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAllocation}>
                            {/* Class Selection */}
                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>1. Select Class:</label>
                                <select
                                    value={allocSelectedClassId}
                                    onChange={(e) => {
                                        setAllocSelectedClassId(e.target.value);
                                        setAllocSelectedStudent(null);
                                    }}
                                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                >
                                    {classesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            {/* Student Picker */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>2. Pick Student:</label>
                                <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    {classStudents.map(st => {
                                        const isSel = allocSelectedStudent?.id === st.id;
                                        return (
                                            <div
                                                key={st.id}
                                                onClick={() => {
                                                    setAllocSelectedStudent(st);
                                                    setAllocParentPhone(st.fatherPhone || st.phone || st.whatsapp || '');
                                                }}
                                                style={{
                                                    padding: '0.45rem 0.65rem',
                                                    borderRadius: '6px',
                                                    border: isSel ? '2px solid #10b981' : '1px solid #e2e8f0',
                                                    background: isSel ? '#ecfdf5' : 'white',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div>
                                                    <strong style={{ fontSize: '0.82rem', color: '#0f172a' }}>{st.name}</strong>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                                                        Father: {st.fatherName || 'N/A'} · Roll #{st.rollNumber || st.rollNo || 'N/A'}
                                                    </span>
                                                </div>
                                                {st.transportEnrolled && (
                                                    <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: '700' }}>
                                                        Already Enrolled
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {classStudents.length === 0 && (
                                        <p style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                                            No students found in this class.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Route & Stop Selection */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>3. Assigned Route:</label>
                                    <select
                                        value={allocRouteId}
                                        onChange={(e) => handleRouteChangeInAlloc(e.target.value)}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        {routes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>4. Pickup Stop:</label>
                                    <select
                                        value={allocStopName}
                                        onChange={(e) => handleStopChangeInAlloc(e.target.value)}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        {(routes.find(r => r.id === allocRouteId)?.stops || []).map((s, idx) => (
                                            <option key={idx} value={s.stopName}>{s.stopName} (PKR {s.fare})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Monthly Transport Fare & Parent Contact */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Monthly Transport Fee (PKR) *:</label>
                                    <input
                                        type="number"
                                        value={allocMonthlyFare}
                                        onChange={(e) => setAllocMonthlyFare(Number(e.target.value))}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '800', color: '#10b981' }}
                                    />
                                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Syncs to monthly fee voucher</span>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Parent WhatsApp Phone:</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 03001234567"
                                        value={allocParentPhone}
                                        onChange={(e) => setAllocParentPhone(e.target.value)}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>For timing broadcast alerts</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setAllocationModalOpen(false)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingAllocation || !allocSelectedStudent}
                                    className="btn"
                                    style={{
                                        flex: 2,
                                        background: !allocSelectedStudent ? '#cbd5e1' : '#10b981',
                                        color: 'white',
                                        padding: '0.65rem',
                                        borderRadius: '8px',
                                        fontWeight: '700',
                                        justifyContent: 'center',
                                        cursor: !allocSelectedStudent ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isSavingAllocation ? 'Allocating...' : '✓ Confirm Transport Seat'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 4. FUEL & MAINTENANCE ENTRY MODAL */}
            {/* ========================================================================= */}
            {logModalOpen && (
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
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '540px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                {logFormData.type === 'fuel' ? '⛽ Log Vehicle Fuel Entry' : '🔧 Log Repair / Service Expense'}
                            </h3>
                            <button onClick={() => setLogModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveFuelLog}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Vehicle *:</label>
                                    <select
                                        value={logFormData.vehicleId}
                                        onChange={(e) => setLogFormData({ ...logFormData, vehicleId: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        <option value="">-- Select Van / Bus --</option>
                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNo} ({v.driverName})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Date *:</label>
                                    <input
                                        type="date"
                                        value={logFormData.date}
                                        onChange={(e) => setLogFormData({ ...logFormData, date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            {logFormData.type === 'fuel' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Liters:</label>
                                        <input
                                            type="number"
                                            value={logFormData.liters}
                                            onChange={(e) => setLogFormData({ ...logFormData, liters: Number(e.target.value) })}
                                            required
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Rate / Liter:</label>
                                        <input
                                            type="number"
                                            value={logFormData.ratePerLiter}
                                            onChange={(e) => setLogFormData({ ...logFormData, ratePerLiter: Number(e.target.value) })}
                                            required
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Total PKR:</label>
                                        <input
                                            type="text"
                                            readOnly
                                            value={(Number(logFormData.liters) || 0) * (Number(logFormData.ratePerLiter) || 0)}
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '800', color: '#e11d48', background: '#fff1f2' }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Maintenance Type:</label>
                                        <select
                                            value={logFormData.maintenanceType}
                                            onChange={(e) => setLogFormData({ ...logFormData, maintenanceType: e.target.value })}
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                        >
                                            {MAINTENANCE_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Cost (PKR) *:</label>
                                        <input
                                            type="number"
                                            value={logFormData.totalCost}
                                            onChange={(e) => setLogFormData({ ...logFormData, totalCost: Number(e.target.value) })}
                                            required
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '800', color: '#e11d48' }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Odometer KM Reading (Optional):</label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 45200"
                                        value={logFormData.odometerKm}
                                        onChange={(e) => setLogFormData({ ...logFormData, odometerKm: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Petrol Pump / Workshop:</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Shell Pump Gulberg"
                                        value={logFormData.vendorName}
                                        onChange={(e) => setLogFormData({ ...logFormData, vendorName: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            {/* Receipt / Invoice Bill Upload Proof */}
                            <div style={{
                                background: '#f8fafc',
                                border: '1.5px dashed #cbd5e1',
                                borderRadius: '10px',
                                padding: '1rem',
                                marginBottom: '1.25rem',
                                textAlign: 'center'
                            }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#334155', marginBottom: '0.4rem' }}>
                                    🧾 Attach Receipt / Bill Proof (Photo or Scan):
                                </label>

                                {logFormData.receiptUrl ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ecfdf5', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <img
                                                src={logFormData.receiptUrl}
                                                alt="Receipt Preview"
                                                style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                            />
                                            <div style={{ textAlign: 'left' }}>
                                                <strong style={{ fontSize: '0.78rem', color: '#065f46', display: 'block' }}>
                                                    ✓ Receipt Photo Attached
                                                </strong>
                                                <span style={{ fontSize: '0.7rem', color: '#047857' }}>
                                                    {logFormData.receiptFileName || 'receipt_slip.jpg'}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setLogFormData(prev => ({ ...prev, receiptUrl: '', receiptFileName: '' }))}
                                            style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}
                                        >
                                            Remove Slip
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <label
                                            htmlFor="receipt-file-input"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                background: '#ffffff',
                                                border: '1px solid #0284c7',
                                                color: '#0284c7',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '8px',
                                                fontSize: '0.8rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.15)'
                                            }}
                                        >
                                            <Camera size={16} /> Choose Receipt Image / Take Photo
                                        </label>
                                        <input
                                            id="receipt-file-input"
                                            type="file"
                                            accept="image/*"
                                            onChange={handleReceiptFileChange}
                                            style={{ display: 'none' }}
                                        />
                                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', marginTop: '0.4rem' }}>
                                            Supports JPG, PNG, WEBP (Auto-compressed)
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setLogModalOpen(false)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ flex: 2, background: logFormData.type === 'fuel' ? '#f59e0b' : '#4f46e5', color: 'white', padding: '0.65rem', borderRadius: '8px', fontWeight: '700', justifyContent: 'center' }}
                                >
                                    Save Log Entry
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 5. RECEIPT VIEWER LIGHTBOX MODAL */}
            {/* ========================================================================= */}
            {viewingReceipt && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10001,
                    padding: '1rem'
                }}>
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '640px',
                        padding: '1.5rem',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        maxHeight: '92vh',
                        overflowY: 'auto'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                            <div>
                                <span style={{
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    background: viewingReceipt.type === 'fuel' ? '#fef3c7' : '#e0e7ff',
                                    color: viewingReceipt.type === 'fuel' ? '#b45309' : '#4338ca',
                                    fontSize: '0.72rem',
                                    fontWeight: '800'
                                }}>
                                    {viewingReceipt.type === 'fuel' ? '⛽ FUEL BILL SLIP' : '🔧 SERVICE / REPAIR BILL'}
                                </span>
                                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
                                    {viewingReceipt.vehicleRegNo} — {viewingReceipt.date}
                                </h3>
                                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
                                    Amount: <strong style={{ color: '#e11d48' }}>PKR {viewingReceipt.totalCost}</strong>
                                    {viewingReceipt.vendorName && ` · Vendor: ${viewingReceipt.vendorName}`}
                                    {viewingReceipt.liters > 0 && ` · ${viewingReceipt.liters} Liters`}
                                </p>
                            </div>
                            <button
                                onClick={() => setViewingReceipt(null)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Image Preview Container */}
                        <div style={{
                            background: '#0f172a',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '320px',
                            maxHeight: '520px',
                            marginBottom: '1rem',
                            border: '1px solid #334155'
                        }}>
                            <img
                                src={viewingReceipt.receiptUrl}
                                alt="Fuel Slip Proof"
                                style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }}
                            />
                        </div>

                        {/* Footer Action Buttons */}
                        <div style={{ display: 'flex', gap: '0.6rem' }}>
                            <button
                                onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = viewingReceipt.receiptUrl;
                                    link.download = `Receipt_${viewingReceipt.vehicleRegNo}_${viewingReceipt.date}.jpg`;
                                    link.click();
                                }}
                                className="btn"
                                style={{ flex: 1, background: '#0284c7', color: 'white', padding: '0.65rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', justifyContent: 'center' }}
                            >
                                <Download size={15} /> Download Slip
                            </button>
                            <button
                                onClick={() => {
                                    const win = window.open();
                                    win.document.write(`<img src="${viewingReceipt.receiptUrl}" style="max-width:100%; height:auto;" />`);
                                }}
                                className="btn"
                                style={{ flex: 1, background: '#334155', color: 'white', padding: '0.65rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', justifyContent: 'center' }}
                            >
                                <ExternalLink size={15} /> Open Full Size
                            </button>
                            <button
                                onClick={() => setViewingReceipt(null)}
                                style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '700', cursor: 'pointer' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Transport;
