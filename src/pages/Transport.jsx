import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Bus, Truck, Search, Plus, Trash2, Edit, CheckCircle, AlertTriangle, Filter,
    ArrowRight, MapPin, Users, Phone, DollarSign, Calendar, Clock,
    FileText, ShieldCheck, X, ChevronRight, Eye, Sparkles, Navigation,
    Fuel, Wrench, Check, Send, Download, Printer, ArrowUpRight, CheckSquare,
    MessageSquare, AlertCircle, RefreshCw, Camera, Image as ImageIcon, Upload, ExternalLink,
    Key, Shield, Smartphone, Copy, Lock, EyeOff, UserCheck, UserX, Radio, Navigation2,
    GraduationCap
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, auth, functions, firebaseConfig } from '../firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as authSignOut } from 'firebase/auth';
import {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc,
    onSnapshot, writeBatch, increment
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
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

    // Local cache helper to ensure data never vanishes on refresh or network glitches
    const getCachedTransport = (sid) => {
        if (!sid) return null;
        try {
            const raw = localStorage.getItem(`transport_cache_${sid}`);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    };

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
        let unsubAuth = null;
        if (authSchoolId) {
            setSchoolId(authSchoolId);
        } else {
            // Priority 1: Check manual session
            try {
                const sess = localStorage.getItem('manual_session');
                if (sess) {
                    const p = JSON.parse(sess);
                    if (p.schoolId || p.uid) {
                        setSchoolId(p.schoolId || p.uid);
                        return;
                    }
                }
            } catch (e) {}

            // Priority 2: Firebase Auth token claim
            unsubAuth = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const tokenResult = await user.getIdTokenResult();
                        if (tokenResult.claims?.schoolId) {
                            setSchoolId(tokenResult.claims.schoolId);
                            return;
                        }
                    } catch (e) {}
                }
                // Priority 3: Fallback query
                getDocs(collection(db, 'schools')).then(snap => {
                    if (!snap.empty) setSchoolId(snap.docs[0].id);
                }).catch(console.error);
            });
        }
        return () => {
            if (unsubAuth) unsubAuth();
        };
    }, [authSchoolId]);

    // Grand Top-Level Navigation Mode
    const [grandTab, setGrandTab] = useState('radar'); // 'radar' or 'fleet_management'

    // Management Sub-Tabs
    const [activeTab, setActiveTab] = useState('fleet'); // 'fleet', 'drivers', 'routes', 'allocations', 'fuel_logs', 'attendance'

    // Live GPS Tracking & Telematics States (Overview Tab)
    const [liveTrackingData, setLiveTrackingData] = useState({}); // { [vehicleId]: trackingDoc }
    const [selectedOverviewVehicleId, setSelectedOverviewVehicleId] = useState('all');
    const [overviewTripType, setOverviewTripType] = useState('morning'); // 'morning', 'afternoon'
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersLayerRef = useRef(null);
    const polylineLayerRef = useRef(null);

    // Live GPS Simulation Demo State (Presentation Mode)
    const [isSimulating, setIsSimulating] = useState(false);
    const simTimerRef = useRef(null);
    const simStepRef = useRef(0);

    // School Profile Info
    const [schoolInfo, setSchoolInfo] = useState({
        name: 'School Transport System',
        phone: '',
        address: ''
    });

    const initialCache = getCachedTransport(schoolId);

    // Core Transport State (Pre-filled from local cache for 0ms visual flash)
    const [vehicles, setVehicles] = useState(() => (initialCache?.vehicles && initialCache.vehicles.length > 0 ? initialCache.vehicles : []));
    const [routes, setRoutes] = useState(() => (initialCache?.routes && initialCache.routes.length > 0 ? initialCache.routes : []));
    const [allocations, setAllocations] = useState(() => (initialCache?.allocations && initialCache.allocations.length > 0 ? initialCache.allocations : []));
    const [fuelLogs, setFuelLogs] = useState(() => (initialCache?.fuelLogs || []));
    const [attendanceLogs, setAttendanceLogs] = useState(() => (initialCache?.attendanceLogs || {})); // { "YYYY-MM-DD_routeId_trip": { studentId: 'boarded' } }
    const [drivers, setDrivers] = useState(() => (initialCache?.drivers || []));

    // Classes & Students Cache
    const [classesList, setClassesList] = useState([]);
    const [classStudents, setClassStudents] = useState([]);
    const [allStudentsCache, setAllStudentsCache] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    // Filter & Search States
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [driverSearch, setDriverSearch] = useState('');
    const [routeSearch, setRouteSearch] = useState('');
    const [allocationSearch, setAllocationSearch] = useState('');
    const [allocationClassFilter, setAllocationClassFilter] = useState('All');
    const [allocationRouteFilter, setAllocationRouteFilter] = useState('All');
    const [fuelVehicleFilter, setFuelVehicleFilter] = useState('All');
    const [expenseMonthFilter, setExpenseMonthFilter] = useState(() => new Date().toISOString().slice(0, 7));

    // Receipt Lightbox State
    const [viewingReceipt, setViewingReceipt] = useState(null);

    // 0. Driver Account Modal State
    const [driverModalOpen, setDriverModalOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState(null);
    const [isSavingDriver, setIsSavingDriver] = useState(false);
    const [driverPasswordVisible, setDriverPasswordVisible] = useState(false);
    const [driverFormData, setDriverFormData] = useState({
        name: '',
        phone: '',
        email: '',
        password: '',
        cnic: '',
        licenseNo: '',
        assignedVehicleId: '',
        status: 'Active',
        notes: ''
    });

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
    const [vehicleModalTab, setVehicleModalTab] = useState('vehicle'); // 'vehicle' or 'route'
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

    // Slide 3: Vehicle Direct Student Allocation States
    const [slideAllocClassId, setSlideAllocClassId] = useState('');
    const [slideAllocStudentId, setSlideAllocStudentId] = useState('');
    const [slideAllocStopName, setSlideAllocStopName] = useState('');
    const [slideAllocMonthlyFare, setSlideAllocMonthlyFare] = useState(2500);
    const [slideAllocTripType, setSlideAllocTripType] = useState('both');
    const [slideAllocStudentsList, setSlideAllocStudentsList] = useState([]);
    const [isLoadingSlideStudents, setIsLoadingSlideStudents] = useState(false);

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
    const [showRouteTimingDropdown, setShowRouteTimingDropdown] = useState(false);

    // 3. Student Allocation Modal
    const [allocationModalOpen, setAllocationModalOpen] = useState(false);
    const [editingAllocation, setEditingAllocation] = useState(null);
    const [allocSelectedClassId, setAllocSelectedClassId] = useState('');
    const [allocSelectedStudent, setAllocSelectedStudent] = useState(null);
    const [allocRouteId, setAllocRouteId] = useState('');
    const [allocStopName, setAllocStopName] = useState('');
    const [isCustomStop, setIsCustomStop] = useState(false);
    const [customStopName, setCustomStopName] = useState('');
    const [saveCustomStopToRoute, setSaveCustomStopToRoute] = useState(true);
    const [isQuickAddingStop, setIsQuickAddingStop] = useState(false);
    const [quickStopData, setQuickStopData] = useState({ stopName: '', morningTime: '07:15 AM', afternoonTime: '02:00 PM', fare: 2500 });
    const [allocMonthlyFare, setAllocMonthlyFare] = useState(2500);
    const [allocTripType, setAllocTripType] = useState('both'); // 'both', 'morning_only', 'afternoon_only'
    const [allocParentPhone, setAllocParentPhone] = useState('');
    const [allocStudentSearch, setAllocStudentSearch] = useState('');
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
                const fetchedVehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
                const fetchedRoutes = Array.isArray(data.routes) ? data.routes : [];
                const fetchedAllocations = Array.isArray(data.allocations) ? data.allocations : [];
                const fetchedFuelLogs = Array.isArray(data.fuelLogs) ? data.fuelLogs : [];
                const fetchedAttendanceLogs = data.attendanceLogs || {};

                // If Firestore is completely empty, check if we have local cache or seed samples
                if (fetchedVehicles.length === 0 && fetchedRoutes.length === 0) {
                    const cache = getCachedTransport(schoolId);
                    if (cache?.vehicles?.length > 0 || cache?.routes?.length > 0) {
                        setVehicles(cache.vehicles || []);
                        setRoutes(cache.routes || []);
                        setAllocations(cache.allocations || []);
                        setFuelLogs(cache.fuelLogs || []);
                        setAttendanceLogs(cache.attendanceLogs || {});
                        // Push cached data back to Firestore to restore
                        setDoc(doc(db, 'schools', schoolId, 'settings', 'transport_management'), {
                            vehicles: cache.vehicles || [],
                            routes: cache.routes || [],
                            allocations: cache.allocations || [],
                            fuelLogs: cache.fuelLogs || [],
                            attendanceLogs: cache.attendanceLogs || {}
                        }, { merge: true }).catch(console.error);
                    } else {
                        initializeSampleTransport();
                    }
                } else {
                    setVehicles(fetchedVehicles);
                    setRoutes(fetchedRoutes);
                    setAllocations(fetchedAllocations);
                    setFuelLogs(fetchedFuelLogs);
                    setAttendanceLogs(fetchedAttendanceLogs);
                    try {
                        localStorage.setItem(`transport_cache_${schoolId}`, JSON.stringify({
                            vehicles: fetchedVehicles,
                            routes: fetchedRoutes,
                            allocations: fetchedAllocations,
                            fuelLogs: fetchedFuelLogs,
                            attendanceLogs: fetchedAttendanceLogs
                        }));
                    } catch (e) {}
                }

                if (Array.isArray(data.drivers) && data.drivers.length > 0) {
                    setDrivers(prev => {
                        const map = new Map();
                        data.drivers.forEach(d => map.set(d.id, d));
                        prev.forEach(d => map.set(d.id, { ...map.get(d.id), ...d }));
                        return Array.from(map.values());
                    });
                }
            } else {
                // Document not found: Check cache first, else init sample
                const cache = getCachedTransport(schoolId);
                if (cache?.vehicles?.length > 0) {
                    setVehicles(cache.vehicles);
                    setRoutes(cache.routes || []);
                    setAllocations(cache.allocations || []);
                    setFuelLogs(cache.fuelLogs || []);
                    setAttendanceLogs(cache.attendanceLogs || {});
                    setDoc(doc(db, 'schools', schoolId, 'settings', 'transport_management'), cache, { merge: true }).catch(console.error);
                } else {
                    initializeSampleTransport();
                }
            }
            setLoadingData(false);
        }, (err) => {
            console.error('Transport listener error:', err);
            const cache = getCachedTransport(schoolId);
            if (cache?.vehicles?.length > 0) {
                setVehicles(cache.vehicles);
                setRoutes(cache.routes || []);
                setAllocations(cache.allocations || []);
                setFuelLogs(cache.fuelLogs || []);
            }
            setLoadingData(false);
        });

        // Real-time Drivers Collection Listener
        const unsubDrivers = onSnapshot(collection(db, `schools/${schoolId}/drivers`), (snap) => {
            if (!snap.empty) {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setDrivers(prev => {
                    const map = new Map();
                    prev.forEach(d => map.set(d.id, d));
                    list.forEach(d => map.set(d.id, { ...map.get(d.id), ...d }));
                    return Array.from(map.values());
                });
            }
        }, (err) => {
            console.warn('Drivers subcollection listener notice:', err.message);
        });

        // 3. Real-time Live GPS Telematics Stream Listener
        const unsubLiveTracking = onSnapshot(collection(db, 'schools', schoolId, 'live_tracking'), (snap) => {
            const tracking = {};
            snap.docs.forEach(d => {
                tracking[d.id] = { id: d.id, ...d.data() };
            });
            setLiveTrackingData(tracking);
        }, (err) => {
            console.warn('Live tracking telemetry listener notice:', err.message);
        });

        return () => {
            unsub();
            unsubDrivers();
            unsubLiveTracking();
        };
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

    // Load students for Slide 3 in Vehicle Modal
    useEffect(() => {
        if (!schoolId || !slideAllocClassId) {
            setSlideAllocStudentsList([]);
            return;
        }
        setIsLoadingSlideStudents(true);
        getDocs(collection(db, `schools/${schoolId}/classes/${slideAllocClassId}/students`))
            .then(snap => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setSlideAllocStudentsList(list);
            })
            .catch(console.error)
            .finally(() => setIsLoadingSlideStudents(false));
    }, [schoolId, slideAllocClassId]);

    // -------------------------------------------------------------
    // Leaflet Real-Time Interactive Map Synchronization (Overview Tab)
    // -------------------------------------------------------------
    useEffect(() => {
        if (grandTab !== 'radar') {
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.remove();
                } catch (e) {}
                mapInstanceRef.current = null;
                markersLayerRef.current = null;
                polylineLayerRef.current = null;
            }
            return;
        }

        if (!mapContainerRef.current) return;

        // 1. Initialize Map Instance if not created
        if (!mapInstanceRef.current) {
            // Clean up any stale leaflet ID on DOM node
            if (mapContainerRef.current._leaflet_id) {
                mapContainerRef.current._leaflet_id = null;
            }

            try {
                const map = L.map(mapContainerRef.current, {
                    center: [31.5204, 74.3587],
                    zoom: 13,
                    zoomControl: true,
                    attributionControl: false
                });

                // 100% Free OpenStreetMap Carto Tiles
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap'
                }).addTo(map);

                markersLayerRef.current = L.layerGroup().addTo(map);
                polylineLayerRef.current = L.layerGroup().addTo(map);
                mapInstanceRef.current = map;
            } catch (err) {
                console.warn('Leaflet initialization warning:', err);
            }
        }

        const map = mapInstanceRef.current;
        const markersGroup = markersLayerRef.current;
        const polylineGroup = polylineLayerRef.current;

        if (!map || !markersGroup || !polylineGroup) return;

        try {
            markersGroup.clearLayers();
            polylineGroup.clearLayers();

            const bounds = L.latLngBounds([]);

            // Determine which vehicles to display
            const targetVehicles = selectedOverviewVehicleId === 'all'
                ? vehicles
                : vehicles.filter(v => v.id === selectedOverviewVehicleId);

            // Find active route for selected vehicle
            let activeRoute = null;
            if (selectedOverviewVehicleId !== 'all') {
                activeRoute = routes.find(r => r.vehicleId === selectedOverviewVehicleId) || routes[0];
            } else if (routes.length > 0) {
                activeRoute = routes[0];
            }

            // Draw Route Stops Sequence & Polyline if Route exists
            const routeCoords = [];
            if (activeRoute && Array.isArray(activeRoute.stops) && activeRoute.stops.length > 0) {
                activeRoute.stops.forEach((stop, idx) => {
                    let lat = Number(stop.latitude);
                    let lng = Number(stop.longitude);
                    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                        // Spread coordinates along route for visual realism
                        lat = 31.5204 + (idx * 0.012) - 0.02;
                        lng = 74.3587 + (idx * 0.014) - 0.015;
                    }

                    const stopLatLng = L.latLng(lat, lng);
                    routeCoords.push(stopLatLng);
                    bounds.extend(stopLatLng);

                    // Custom High-Res Stop DivIcon
                    const stopIcon = L.divIcon({
                        className: 'custom-stop-marker',
                        html: `<div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: white; border: 2.5px solid white; box-shadow: 0 4px 12px rgba(2,132,199,0.45); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px;">#${idx + 1}</div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });

                    const stopMarker = L.marker(stopLatLng, { icon: stopIcon }).bindPopup(`
                        <div style="font-family: inherit; padding: 4px; min-width: 170px;">
                            <div style="font-weight: 800; color: #0284c7; font-size: 13px; margin-bottom: 3px;">📍 Stop #${idx + 1}: ${stop.stopName || 'Route Stop'}</div>
                            <div style="font-size: 11px; color: #475569; margin-bottom: 2px;">🌅 <b>Pick:</b> ${stop.morningTime || '07:15 AM'} | 🌇 <b>Drop:</b> ${stop.afternoonTime || '02:00 PM'}</div>
                            <div style="font-size: 11px; color: #10b981; font-weight: 700;">Fare: PKR ${stop.fare || 2500} / mo</div>
                        </div>
                    `);
                    markersGroup.addLayer(stopMarker);
                });

                // School Campus Terminal Pin
                const schoolLatLng = L.latLng(31.5350, 74.3750);
                routeCoords.push(schoolLatLng);
                bounds.extend(schoolLatLng);

                const schoolIcon = L.divIcon({
                    className: 'custom-school-marker',
                    html: `<div style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: white; border: 2px solid white; box-shadow: 0 4px 14px rgba(79,70,229,0.45); border-radius: 8px; padding: 4px 10px; display: flex; align-items: center; gap: 4px; font-weight: 800; font-size: 11px; white-space: nowrap;">🏫 School Campus</div>`,
                    iconSize: [110, 32],
                    iconAnchor: [55, 16]
                });
                const schoolMarker = L.marker(schoolLatLng, { icon: schoolIcon }).bindPopup(`
                    <div style="font-family: inherit; padding: 4px;">
                        <div style="font-weight: 800; color: #4f46e5; font-size: 13px;">🏫 ${schoolInfo.name || 'School Campus'}</div>
                        <div style="font-size: 11px; color: #64748b;">Central Transport Terminal</div>
                    </div>
                `);
                markersGroup.addLayer(schoolMarker);

                // Draw Route Polyline
                const polyline = L.polyline(routeCoords, {
                    color: '#0284c7',
                    weight: 4,
                    opacity: 0.85,
                    dashArray: '8, 8',
                    lineCap: 'round'
                });
                polylineGroup.addLayer(polyline);
            }

            // Draw Vehicle Markers with real-time GPS telemetry
            targetVehicles.forEach((veh, vIdx) => {
                const live = liveTrackingData[veh.id] || {};
                const isLive = live.isLive && (live.tripStatus === 'in_progress' || live.tripStatus === 'active');
                const speed = live.speedKmH || 0;
                const heading = live.heading || 0;

                let lat = Number(live.latitude);
                let lng = Number(live.longitude);
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                    // Fallback coordinates near start of route
                    lat = 31.5204 + (vIdx * 0.008 - 0.004);
                    lng = 74.3587 + (vIdx * 0.008 - 0.004);
                }

                const vehLatLng = L.latLng(lat, lng);
                bounds.extend(vehLatLng);

                const vanIcon = L.divIcon({
                    className: 'custom-van-marker',
                    html: `
                        <div style="position: relative; width: 38px; height: 38px;">
                            ${isLive ? '<div style="position: absolute; width: 54px; height: 54px; top: -8px; left: -8px; border-radius: 50%; background: rgba(16, 185, 129, 0.3); animation: pulse 1.5s infinite;"></div>' : ''}
                            <div style="background: ${isLive ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #475569 0%, #334155 100%)'}; color: white; border: 2.5px solid white; box-shadow: 0 4px 14px rgba(0,0,0,0.35); border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; font-size: 18px; transform: rotate(${heading}deg); transition: transform 0.3s ease;">
                                🚐
                            </div>
                            <div style="position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); background: #0f172a; color: white; padding: 2px 7px; border-radius: 5px; font-size: 10px; font-weight: 800; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.2);">
                                ${veh.regNo} ${isLive ? `(${speed} km/h)` : ''}
                            </div>
                        </div>
                    `,
                    iconSize: [38, 38],
                    iconAnchor: [19, 19]
                });

                const vanMarker = L.marker(vehLatLng, { icon: vanIcon }).bindPopup(`
                    <div style="font-family: inherit; padding: 6px; min-width: 190px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
                            <b style="font-size: 13px; color: #0f172a;">🚐 ${veh.regNo}</b>
                            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${isLive ? '#dcfce7' : '#f1f5f9'}; color: ${isLive ? '#15803d' : '#64748b'}; font-weight: 800;">
                                ${isLive ? '🟢 IN TRANSIT' : '⚪ STANDBY'}
                            </span>
                        </div>
                        <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">👤 Driver: <b>${veh.driverName || 'Unassigned'}</b></div>
                        <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">📞 Contact: <b>${veh.driverPhone || 'N/A'}</b></div>
                        <div style="font-size: 11px; color: #0284c7; margin-bottom: 4px; font-weight: 800;">🚀 Speed: ${speed} km/h</div>
                        <div style="font-size: 10px; color: #94a3b8;">🕒 Last Synced: ${live.lastTimestamp ? new Date(live.lastTimestamp).toLocaleTimeString() : 'Awaiting Trip'}</div>
                    </div>
                `);
                markersGroup.addLayer(vanMarker);
            });

            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
            }
        } catch (syncErr) {
            console.warn('Map layer sync error:', syncErr);
        }

        const resizeTimer = setTimeout(() => {
            if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
        }, 300);

        return () => {
            clearTimeout(resizeTimer);
        };
    }, [grandTab, selectedOverviewVehicleId, vehicles, routes, liveTrackingData, schoolInfo]);

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
            setVehicles(initialVehicles);
            setRoutes(initialRoutes);
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
            // Update local cache
            try {
                const existingCache = getCachedTransport(schoolId) || {};
                localStorage.setItem(`transport_cache_${schoolId}`, JSON.stringify({
                    ...existingCache,
                    ...updates
                }));
            } catch (ce) {}
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
    // 1.5. Driver Accounts CRUD & WhatsApp Handlers
    // -------------------------------------------------------------
    const handleOpenDriverModal = (drv = null) => {
        if (drv) {
            setEditingDriver(drv);
            setDriverFormData({
                name: drv.name || '',
                phone: drv.phone || '',
                email: drv.email || '',
                password: '', // Kept empty unless changing password
                cnic: drv.cnic || '',
                licenseNo: drv.licenseNo || '',
                assignedVehicleId: drv.assignedVehicleId || '',
                status: drv.status || 'Active',
                notes: drv.notes || ''
            });
        } else {
            setEditingDriver(null);
            setDriverFormData({
                name: '',
                phone: '',
                email: '',
                password: 'driver' + Math.floor(1000 + Math.random() * 9000), // Auto-suggest password
                cnic: '',
                licenseNo: '',
                assignedVehicleId: '',
                status: 'Active',
                notes: ''
            });
        }
        setDriverPasswordVisible(false);
        setDriverModalOpen(true);
    };

    const handleSaveDriver = async (e) => {
        e.preventDefault();
        if (!schoolId) {
            showAlert('Error: School ID is missing. Please reload the page.', 'error');
            return;
        }

        if (!driverFormData.name.trim()) {
            showAlert('Driver full name is required!', 'error');
            return;
        }
        if (!driverFormData.email.trim()) {
            showAlert('Driver login email is required!', 'error');
            return;
        }

        setIsSavingDriver(true);

        try {
            if (editingDriver) {
                // Update Existing Driver Record
                const updateData = {
                    ...editingDriver,
                    name: driverFormData.name.trim(),
                    phone: driverFormData.phone.trim(),
                    email: driverFormData.email.trim(),
                    cnic: driverFormData.cnic.trim(),
                    licenseNo: driverFormData.licenseNo.trim(),
                    assignedVehicleId: driverFormData.assignedVehicleId || '',
                    status: driverFormData.status || 'Active',
                    notes: driverFormData.notes || '',
                    updatedAt: new Date().toISOString()
                };

                // Update in Local and Master Transport Document
                const updatedDrivers = drivers.map(d => d.id === editingDriver.id ? updateData : d);
                setDrivers(updatedDrivers);

                // Update assigned vehicle if needed
                let updatedVehicles = vehicles;
                if (driverFormData.assignedVehicleId) {
                    updatedVehicles = vehicles.map(v => {
                        if (v.id === driverFormData.assignedVehicleId) {
                            return {
                                ...v,
                                driverName: updateData.name,
                                driverPhone: updateData.phone,
                                driverLicense: updateData.licenseNo,
                                driverCnic: updateData.cnic,
                                driverEmail: updateData.email,
                                driverId: editingDriver.id
                            };
                        }
                        return v;
                    });
                    setVehicles(updatedVehicles);
                }

                await saveTransportState({ drivers: updatedDrivers, vehicles: updatedVehicles });

                // Try subcollection update defensively
                try {
                    await setDoc(doc(db, `schools/${schoolId}/drivers`, editingDriver.id), updateData, { merge: true });
                } catch (subErr) {
                    console.warn("Subcollection driver write notice:", subErr);
                }

                showAlert('Driver profile updated successfully!', 'success');
                setDriverModalOpen(false);
            } else {
                // Create New Driver
                if (!driverFormData.password || driverFormData.password.trim().length < 6) {
                    showAlert('Password must be at least 6 characters!', 'error');
                    setIsSavingDriver(false);
                    return;
                }

                let newDriverUid = null;

                // 1. Create Firebase Auth user via isolated secondary App
                try {
                    const tempApp = initializeApp(firebaseConfig, `DriverAuth_${Date.now()}`);
                    try {
                        const tempAuth = getAuth(tempApp);
                        const cred = await createUserWithEmailAndPassword(
                            tempAuth,
                            driverFormData.email.trim(),
                            driverFormData.password.trim()
                        );
                        newDriverUid = cred.user.uid;
                        await authSignOut(tempAuth);
                    } finally {
                        await deleteApp(tempApp);
                    }
                } catch (authErr) {
                    if (authErr.code === 'auth/email-already-in-use') {
                        throw new Error(`Email "${driverFormData.email.trim()}" is already registered in Firebase Auth with a previous password. Please use a fresh email (e.g. adnan.driver@school.com) so the new password is set correctly.`);
                    } else {
                        throw authErr;
                    }
                }

                if (!newDriverUid) {
                    newDriverUid = `driver_${Date.now()}`;
                }

                // 2. Build Driver Record
                const driverRecord = {
                    id: newDriverUid,
                    uid: newDriverUid,
                    name: driverFormData.name.trim(),
                    phone: driverFormData.phone.trim(),
                    email: driverFormData.email.trim(),
                    password: driverFormData.password.trim(), // Stored for Principal's WhatsApp convenience
                    cnic: driverFormData.cnic.trim(),
                    licenseNo: driverFormData.licenseNo.trim(),
                    assignedVehicleId: driverFormData.assignedVehicleId || '',
                    status: driverFormData.status || 'Active',
                    notes: driverFormData.notes || '',
                    role: 'driver',
                    schoolId: schoolId,
                    createdAt: new Date().toISOString()
                };

                // 3. Save into Master Transport Document (Always authorized for Principal)
                const updatedDrivers = [driverRecord, ...drivers.filter(d => d.id !== newDriverUid)];
                setDrivers(updatedDrivers);

                let updatedVehicles = vehicles;
                if (driverFormData.assignedVehicleId) {
                    updatedVehicles = vehicles.map(v => {
                        if (v.id === driverFormData.assignedVehicleId) {
                            return {
                                ...v,
                                driverName: driverFormData.name.trim(),
                                driverPhone: driverFormData.phone.trim(),
                                driverLicense: driverFormData.licenseNo.trim(),
                                driverCnic: driverFormData.cnic.trim(),
                                driverEmail: driverFormData.email.trim(),
                                driverId: newDriverUid
                            };
                        }
                        return v;
                    });
                    setVehicles(updatedVehicles);
                }

                await saveTransportState({ drivers: updatedDrivers, vehicles: updatedVehicles });

                // 4. Also write to school drivers collection and global users defensively
                try {
                    await setDoc(doc(db, `schools/${schoolId}/drivers`, newDriverUid), driverRecord, { merge: true });
                } catch (subErr) {
                    console.warn("Drivers subcollection write notice:", subErr);
                }

                try {
                    await setDoc(doc(db, 'global_users', newDriverUid), {
                        uid: newDriverUid,
                        email: driverFormData.email.trim(),
                        name: driverFormData.name.trim(),
                        role: 'driver',
                        schoolId: schoolId,
                        createdAt: new Date().toISOString()
                    }, { merge: true });
                } catch (globalErr) {
                    console.warn("Global users write notice:", globalErr);
                }

                showAlert('Driver account created successfully! Driver can now log in to the mobile app.', 'success');
                setDriverModalOpen(false);
            }
        } catch (error) {
            console.error("Save Driver error:", error);
            showAlert('Failed to save driver account: ' + (error.message || error), 'error');
        } finally {
            setIsSavingDriver(false);
        }
    };

    const handleDeleteDriver = async (drv) => {
        if (!window.confirm(`Are you sure you want to delete driver account "${drv.name}" (${drv.email})?`)) return;

        try {
            const updatedDrivers = drivers.filter(d => d.id !== drv.id);
            setDrivers(updatedDrivers);

            // Unlink driver from any vehicle
            const updatedVehicles = vehicles.map(v => {
                if (v.driverId === drv.id || (v.driverEmail && v.driverEmail.toLowerCase() === drv.email?.toLowerCase())) {
                    return { ...v, driverName: '', driverPhone: '', driverEmail: '', driverId: '' };
                }
                return v;
            });
            setVehicles(updatedVehicles);

            await saveTransportState({ drivers: updatedDrivers, vehicles: updatedVehicles });

            try {
                await deleteDoc(doc(db, `schools/${schoolId}/drivers`, drv.id));
            } catch (delErr) {
                console.warn("Delete subcollection driver notice:", delErr);
            }

            showAlert('Driver account deleted!', 'success');
        } catch (error) {
            console.error("Delete driver error:", error);
            showAlert('Failed to delete driver: ' + error.message, 'error');
        }
    };

    const sendDriverCredentialsWhatsApp = (drv) => {
        const assignedVeh = vehicles.find(v => v.id === drv.assignedVehicleId);
        const assignedRoute = routes.find(r => r.vehicleId === drv.assignedVehicleId);

        let text = `🏫 *${schoolInfo.name.toUpperCase()} - DRIVER MOBILE APP LOGIN*\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `Assalam-o-Alaikum *${drv.name}*,\n`;
        text += `Aapka School Driver Mobile App account create ho chuka hai. Daily route trips aur student boarding manage karne ke liye app login karein:\n\n`;
        text += `📱 *APP LOGIN CREDENTIALS:*\n`;
        text += `🔑 *School ID:* ${schoolId}\n`;
        text += `📧 *Driver Email:* ${drv.email}\n`;
        text += `🔒 *Password:* ${drv.password || 'Contact Admin'}\n\n`;
        text += `🚐 *Assigned Vehicle:* ${assignedVeh ? `${assignedVeh.regNo} (${assignedVeh.type})` : 'To be assigned'}\n`;
        text += `🗺️ *Route:* ${assignedRoute ? assignedRoute.title : 'General Fleet'}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `📲 *Steps to Login:*\n`;
        text += `1. Open *School Driver App* on your phone.\n`;
        text += `2. Enter the School ID, Email & Password given above.\n`;
        text += `3. Tap *Sign In* to start tracking and attendance!\n\n`;
        text += `_For any help, contact School Administration._`;

        const phone = formatWhatsAppPhone(drv.phone);
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
        setVehicleModalTab('vehicle');
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

            // Pre-load or initialize assigned route for this vehicle
            const existingRoute = routes.find(r => r.vehicleId === veh.id || (r.vehicleRegNo && r.vehicleRegNo === veh.regNo));
            if (existingRoute) {
                setEditingRoute(existingRoute);
                setRouteFormData({
                    title: existingRoute.title || `Route - ${veh.regNo}`,
                    vehicleId: veh.id,
                    startPoint: existingRoute.startPoint || 'Main Station',
                    endPoint: existingRoute.endPoint || 'School Campus',
                    morningDepartureTime: existingRoute.morningDepartureTime || '06:45 AM',
                    afternoonDepartureTime: existingRoute.afternoonDepartureTime || '01:45 PM',
                    monthlyBaseFare: existingRoute.monthlyBaseFare || 2500,
                    stops: Array.isArray(existingRoute.stops) && existingRoute.stops.length > 0 ? existingRoute.stops : [{ stopName: '', morningTime: '07:00 AM', afternoonTime: '02:00 PM', fare: 2500 }],
                    notes: existingRoute.notes || ''
                });
            } else {
                setEditingRoute(null);
                setRouteFormData({
                    title: `Route - ${veh.regNo}`,
                    vehicleId: veh.id,
                    startPoint: 'Main Station',
                    endPoint: 'School Campus',
                    morningDepartureTime: '06:45 AM',
                    afternoonDepartureTime: '01:45 PM',
                    monthlyBaseFare: 2500,
                    stops: [
                        { stopName: 'Stop 1: Main Chowk', morningTime: '07:00 AM', afternoonTime: '02:00 PM', fare: 2500 },
                        { stopName: 'Stop 2: Residential Sector', morningTime: '07:15 AM', afternoonTime: '02:15 PM', fare: 3000 }
                    ],
                    notes: ''
                });
            }
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
            setEditingRoute(null);
            setRouteFormData({
                title: '',
                vehicleId: '',
                startPoint: '',
                endPoint: 'School Campus',
                morningDepartureTime: '06:45 AM',
                afternoonDepartureTime: '01:45 PM',
                monthlyBaseFare: 2500,
                stops: [
                    { stopName: 'Stop 1: Main Chowk', morningTime: '07:00 AM', afternoonTime: '02:00 PM', fare: 2500 }
                ],
                notes: ''
            });
        }
        setVehicleModalOpen(true);
    };

    const handleSaveRouteForVehicle = async (e) => {
        if (e) e.preventDefault();
        if (!routeFormData.title.trim()) {
            showAlert('Route title is required!', 'error');
            return;
        }

        const validStops = (routeFormData.stops || []).filter(s => s.stopName && s.stopName.trim());
        if (validStops.length === 0) {
            showAlert('Please specify at least one valid stop name!', 'error');
            return;
        }

        const targetVehicleId = editingVehicle ? editingVehicle.id : routeFormData.vehicleId;
        const targetVehicleReg = editingVehicle ? editingVehicle.regNo : (vehicles.find(v => v.id === targetVehicleId)?.regNo || '');

        const newId = editingRoute ? editingRoute.id : `route_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const routeObj = {
            ...routeFormData,
            id: newId,
            vehicleId: targetVehicleId,
            vehicleRegNo: targetVehicleReg,
            stops: validStops.map(s => ({
                ...s,
                fare: Number(s.fare) || Number(routeFormData.monthlyBaseFare) || 2500
            })),
            monthlyBaseFare: Number(routeFormData.monthlyBaseFare) || 2500,
            updatedAt: new Date().toISOString()
        };

        const updatedRoutes = editingRoute
            ? routes.map(r => r.id === editingRoute.id ? routeObj : r)
            : [routeObj, ...routes.filter(r => r.vehicleId !== targetVehicleId)];

        const ok = await saveTransportState({ routes: updatedRoutes });
        if (ok) {
            setRoutes(updatedRoutes);
            setEditingRoute(routeObj);
            showAlert(`✓ Route "${routeObj.title}" successfully saved for vehicle ${targetVehicleReg || ''}!`, 'success');
        }
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

    // Handlers for Slide 3 Direct Student Allocation
    const handleAddSlideAllocation = async (e) => {
        if (e) e.preventDefault();
        if (!slideAllocStudentId) {
            showAlert('Please select a student to allocate!', 'warning');
            return;
        }
        const student = slideAllocStudentsList.find(s => s.id === slideAllocStudentId);
        if (!student) {
            showAlert('Selected student not found in this class!', 'error');
            return;
        }

        const targetVehicleId = editingVehicle ? editingVehicle.id : (vehicleFormData.id || `veh_${Date.now()}`);
        const targetVehicleReg = (vehicleFormData.regNo || 'Van').trim().toUpperCase();
        const targetRouteId = editingRoute ? editingRoute.id : (routes.find(r => r.vehicleId === targetVehicleId)?.id || (routes[0]?.id || 'route_default'));
        const targetRouteTitle = editingRoute ? editingRoute.title : (routes.find(r => r.id === targetRouteId)?.title || `Route - ${targetVehicleReg}`);

        const stopChosen = slideAllocStopName || (editingRoute?.stops?.[0]?.stopName || (routeFormData.stops?.[0]?.stopName || 'Default Stop'));
        const fareChosen = Number(slideAllocMonthlyFare) || (Number(routeFormData.monthlyBaseFare) || 2500);

        const cls = classesList.find(c => c.id === slideAllocClassId);
        const className = cls ? (cls.name || cls.className) : (student.className || 'Class');

        const newAllocation = {
            id: `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            studentId: student.id,
            studentName: student.name || student.studentName || 'Student',
            fatherName: student.fatherName || student.guardianName || '',
            parentPhone: student.phone || student.fatherPhone || student.guardianPhone || student.parentPhone || student.emergencyContact || '',
            classId: slideAllocClassId,
            className: className,
            section: student.section || '',
            rollNo: student.rollNo || student.rollNumber || '',
            vehicleId: targetVehicleId,
            vehicleRegNo: targetVehicleReg,
            routeId: targetRouteId,
            routeName: targetRouteTitle,
            pickupStop: stopChosen,
            stopName: stopChosen,
            monthlyFare: fareChosen,
            tripType: slideAllocTripType || 'both',
            status: 'Active',
            allocatedAt: new Date().toISOString()
        };

        const updatedAllocations = [...allocations.filter(a => a.studentId !== student.id), newAllocation];
        const ok = await saveTransportState({ allocations: updatedAllocations });
        if (ok) {
            setAllocations(updatedAllocations);
            setSlideAllocStudentId('');
            showAlert(`🎓 ${newAllocation.studentName} (${newAllocation.className}) allocated to ${targetVehicleReg}!`, 'success');
        }
    };

    const handleDeleteSlideAllocation = async (allocId, studentName) => {
        if (!window.confirm(`Remove ${studentName} from this vehicle seat allocation?`)) return;
        const updatedAllocations = allocations.filter(a => a.id !== allocId);
        const ok = await saveTransportState({ allocations: updatedAllocations });
        if (ok) {
            setAllocations(updatedAllocations);
            showAlert(`${studentName} removed from vehicle seat allocation.`, 'success');
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
        setEditingAllocation(null);
        setAllocStudentSearch('');
        const initialClassId = allocSelectedClassId || classesList[0]?.id || '';
        setAllocSelectedClassId(initialClassId);
        setAllocSelectedStudent(null);
        const defaultRoute = routes[0];
        setAllocRouteId(defaultRoute?.id || '');
        setAllocStopName(defaultRoute?.stops[0]?.stopName || '');
        setAllocMonthlyFare(defaultRoute?.stops[0]?.fare || defaultRoute?.monthlyBaseFare || 2500);
        setAllocTripType('both');
        setAllocParentPhone('');
        setIsCustomStop(false);
        setCustomStopName('');
        setSaveCustomStopToRoute(true);
        setIsQuickAddingStop(false);
        setAllocationModalOpen(true);
    };

    const handleOpenEditAllocationModal = (alloc) => {
        setEditingAllocation(alloc);
        setAllocStudentSearch('');
        setAllocSelectedClassId(alloc.classId);
        setAllocSelectedStudent({
            id: alloc.studentId,
            name: alloc.studentName,
            rollNo: alloc.rollNo,
            rollNumber: alloc.rollNo,
            fatherName: alloc.fatherName,
            fatherPhone: alloc.parentPhone
        });
        setAllocRouteId(alloc.routeId);
        setAllocStopName(alloc.stopName);

        const targetRoute = routes.find(r => r.id === alloc.routeId);
        const existsInRoute = (targetRoute?.stops || []).some(s => s.stopName === alloc.stopName);
        if (!existsInRoute && alloc.stopName) {
            setIsCustomStop(true);
            setCustomStopName(alloc.stopName);
        } else {
            setIsCustomStop(false);
            setCustomStopName('');
        }

        setAllocMonthlyFare(alloc.monthlyFare || 2500);
        setAllocTripType(alloc.tripType || 'both');
        setAllocParentPhone(alloc.parentPhone || '');
        setIsQuickAddingStop(false);
        setAllocationModalOpen(true);
    };

    const handleRouteChangeInAlloc = (routeId) => {
        setAllocRouteId(routeId);
        const targetRoute = routes.find(r => r.id === routeId);
        if (targetRoute && targetRoute.stops && targetRoute.stops.length > 0) {
            setAllocStopName(targetRoute.stops[0].stopName);
            setAllocMonthlyFare(targetRoute.stops[0].fare || targetRoute.monthlyBaseFare || 2500);
        }
        setIsCustomStop(false);
        setCustomStopName('');
        setIsQuickAddingStop(false);
    };

    const handleStopChangeInAlloc = (stopName) => {
        setAllocStopName(stopName);
        const targetRoute = routes.find(r => r.id === allocRouteId);
        if (targetRoute) {
            const foundStop = (targetRoute.stops || []).find(s => s.stopName === stopName);
            if (foundStop) setAllocMonthlyFare(foundStop.fare);
        }
    };

    // Quick Add a New Stop to Selected Route Directly from Allocation Modal
    const handleQuickAddStopToCurrentRoute = async () => {
        if (!quickStopData.stopName.trim()) {
            showAlert('Please enter a stop name / landmark!', 'error');
            return;
        }

        const targetRoute = routes.find(r => r.id === allocRouteId);
        if (!targetRoute) {
            showAlert('Please select a route first!', 'error');
            return;
        }

        const newStopObj = {
            stopName: quickStopData.stopName.trim(),
            morningTime: quickStopData.morningTime || '07:15 AM',
            afternoonTime: quickStopData.afternoonTime || '02:00 PM',
            fare: Number(quickStopData.fare) || Number(allocMonthlyFare) || 2500
        };

        const existingStops = Array.isArray(targetRoute.stops) ? targetRoute.stops : [];
        const updatedStops = [...existingStops, newStopObj];
        const updatedRoute = { ...targetRoute, stops: updatedStops };
        const updatedRoutes = routes.map(r => r.id === targetRoute.id ? updatedRoute : r);

        const ok = await saveTransportState({ routes: updatedRoutes });
        if (ok) {
            setRoutes(updatedRoutes);
            setAllocStopName(newStopObj.stopName);
            setAllocMonthlyFare(newStopObj.fare);
            setIsQuickAddingStop(false);
            setQuickStopData({ stopName: '', morningTime: '07:15 AM', afternoonTime: '02:00 PM', fare: 2500 });
            showAlert(`📍 Stop "${newStopObj.stopName}" added to Route!`, 'success');
        }
    };

    // Quick Remove Selected Stop from Route Directly from Allocation Modal
    const handleQuickRemoveStopFromCurrentRoute = async (stopNameToRemove) => {
        const targetRoute = routes.find(r => r.id === allocRouteId);
        if (!targetRoute) return;

        if ((targetRoute.stops || []).length <= 1) {
            showAlert('Route must have at least one stop!', 'warning');
            return;
        }

        if (!window.confirm(`Are you sure you want to remove stop "${stopNameToRemove}" from Route "${targetRoute.title}"?`)) {
            return;
        }

        const updatedStops = (targetRoute.stops || []).filter(s => s.stopName !== stopNameToRemove);
        const updatedRoute = { ...targetRoute, stops: updatedStops };
        const updatedRoutes = routes.map(r => r.id === targetRoute.id ? updatedRoute : r);

        const ok = await saveTransportState({ routes: updatedRoutes });
        if (ok) {
            setRoutes(updatedRoutes);
            if (updatedStops.length > 0) {
                setAllocStopName(updatedStops[0].stopName);
                setAllocMonthlyFare(updatedStops[0].fare);
            }
            showAlert(`Stop "${stopNameToRemove}" removed from route.`, 'success');
        }
    };

    const handleSaveAllocation = async (e) => {
        e.preventDefault();
        if (!allocSelectedStudent) {
            showAlert('Please select a student!', 'error');
            return;
        }

        const finalStopName = isCustomStop ? customStopName.trim() : allocStopName.trim();

        if (!allocRouteId || !finalStopName) {
            showAlert('Please select a route and specify pickup stop location!', 'error');
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
            // If custom stop and user opted to save to route sequence
            if (isCustomStop && saveCustomStopToRoute && targetRoute) {
                const stopExists = (targetRoute.stops || []).some(s => s.stopName.toLowerCase() === finalStopName.toLowerCase());
                if (!stopExists) {
                    const newStop = {
                        stopName: finalStopName,
                        morningTime: '07:15 AM',
                        afternoonTime: '02:00 PM',
                        fare: Number(allocMonthlyFare) || 2500
                    };
                    const updatedRoutes = routes.map(r => r.id === targetRoute.id ? { ...r, stops: [...(r.stops || []), newStop] } : r);
                    setRoutes(updatedRoutes);
                    await saveTransportState({ routes: updatedRoutes });
                }
            }

            const allocId = editingAllocation ? editingAllocation.id : `alloc_${allocSelectedStudent.id}`;
            const allocObj = {
                id: allocId,
                studentId: allocSelectedStudent.id,
                studentName: allocSelectedStudent.name,
                rollNo: allocSelectedStudent.rollNumber || allocSelectedStudent.rollNo || 'N/A',
                classId: allocSelectedClassId,
                className: className,
                routeId: allocRouteId,
                routeName: targetRoute?.title || 'Route',
                stopName: finalStopName,
                monthlyFare: Number(allocMonthlyFare) || 0,
                tripType: allocTripType,
                vehicleId: targetRoute?.vehicleId || '',
                vehicleRegNo: targetVehicle?.regNo || 'School Van',
                parentPhone: allocParentPhone || allocSelectedStudent.fatherPhone || allocSelectedStudent.phone || allocSelectedStudent.whatsapp || '',
                fatherName: allocSelectedStudent.fatherName || '',
                enrolledAt: editingAllocation?.enrolledAt || new Date().toISOString()
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
                    transportStopName: finalStopName,
                    transportVehicleRegNo: targetVehicle?.regNo || '',
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (err) {
                console.log('Student doc transport flag sync skipped');
            }

            setAllocations(updatedAllocations);
            showAlert(editingAllocation ? `✓ Transport allocation updated for ${allocSelectedStudent.name}!` : `🎉 ${allocSelectedStudent.name} successfully enrolled in Transport!`, 'success');
            setAllocationModalOpen(false);

            // Ask to send WhatsApp timing notification
            if (allocObj.parentPhone && !editingAllocation) {
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
        const nextStatus = currentStatus === 'boarded' ? 'absent' : currentStatus === 'absent' ? 'pending' : 'boarded';
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

        // Also sync to live_tracking document so Driver App gets the update in real-time
        const targetVehId = selectedOverviewVehicleId !== 'all' ? selectedOverviewVehicleId : (vehicles[0]?.id || 'fleet_default');
        if (targetVehId && schoolId) {
            setDoc(doc(db, 'schools', schoolId, 'live_tracking', targetVehId), {
                studentStatusMap: {
                    ...(liveTrackingData[targetVehId]?.studentStatusMap || {}),
                    [studentId]: nextStatus
                },
                lastStatusUpdate: new Date().toISOString()
            }, { merge: true }).catch(console.error);
        }

        // Optionally send WhatsApp alert if boarded
        if (nextStatus === 'boarded') {
            const alloc = allocations.find(a => a.studentId === studentId || a.id === studentId);
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
            const stId = a.studentId || a.id;
            if (stId) updatedSubMap[stId] = 'boarded';
        });

        const updatedMasterMap = {
            ...attendanceLogs,
            [key]: updatedSubMap
        };

        setAttendanceLogs(updatedMasterMap);
        await saveTransportState({ attendanceLogs: updatedMasterMap });

        const targetVehId = selectedOverviewVehicleId !== 'all' ? selectedOverviewVehicleId : (vehicles[0]?.id || 'fleet_default');
        if (targetVehId && schoolId) {
            setDoc(doc(db, 'schools', schoolId, 'live_tracking', targetVehId), {
                studentStatusMap: updatedSubMap,
                lastStatusUpdate: new Date().toISOString()
            }, { merge: true }).catch(console.error);
        }

        showAlert(`All ${currentRouteAllocs.length} students marked boarded for today's trip!`, 'success');
    };

    // -------------------------------------------------------------
    // Live GPS Demo Simulator (For Presentation & Client Demo)
    // -------------------------------------------------------------
    const toggleLiveSimulation = () => {
        if (isSimulating) {
            // Stop Simulation
            if (simTimerRef.current) clearInterval(simTimerRef.current);
            setIsSimulating(false);
            setLiveTrackingData(prev => {
                const updated = { ...prev };
                vehicles.forEach(v => {
                    if (updated[v.id]) {
                        updated[v.id] = { ...updated[v.id], isLive: false, tripStatus: 'completed' };
                    }
                });
                return updated;
            });
            showAlert('Live GPS Simulation stopped.', 'info');
            return;
        }

        if (vehicles.length === 0) {
            showAlert('Please restore/add vehicles first to run simulation!', 'warning');
            return;
        }

        setIsSimulating(true);
        showAlert('🚀 Live GPS Simulation active! Van is moving on map.', 'success');

        const activeRoute = routes[0];
        const stopsList = (activeRoute && Array.isArray(activeRoute.stops) && activeRoute.stops.length > 0)
            ? activeRoute.stops
            : [
                { stopName: 'Stop 1: Township Market', latitude: 31.4700, longitude: 74.3050 },
                { stopName: 'Stop 2: Model Town C-Block', latitude: 31.4950, longitude: 74.3300 },
                { stopName: 'Stop 3: Kalma Chowk Underpass', latitude: 31.5150, longitude: 74.3520 },
                { stopName: 'Stop 4: Main Boulevard Gulberg', latitude: 31.5300, longitude: 74.3680 },
                { stopName: 'School Campus Terminal', latitude: 31.5350, longitude: 74.3750 }
            ];

        // Generate smooth interpolated waypoints
        const waypoints = [];
        for (let i = 0; i < stopsList.length - 1; i++) {
            const start = stopsList[i];
            const end = stopsList[i + 1];
            const stepsBetween = 6;
            for (let s = 0; s < stepsBetween; s++) {
                const ratio = s / stepsBetween;
                const startLat = Number(start.latitude) || (31.50 + i * 0.01);
                const startLng = Number(start.longitude) || (74.32 + i * 0.01);
                const endLat = Number(end.latitude) || (31.51 + i * 0.01);
                const endLng = Number(end.longitude) || (74.33 + i * 0.01);

                const lat = startLat + (endLat - startLat) * ratio;
                const lng = startLng + (endLng - startLng) * ratio;

                waypoints.push({
                    lat,
                    lng,
                    stopName: s === 0 ? start.stopName : `Transit -> ${end.stopName}`,
                    isStop: s === 0
                });
            }
        }
        // Terminal waypoint
        waypoints.push({
            lat: 31.5350,
            lng: 74.3750,
            stopName: '🏫 School Campus Central Terminal',
            isStop: true
        });

        const targetVeh = vehicles[0];
        simStepRef.current = 0;

        simTimerRef.current = setInterval(() => {
            simStepRef.current = (simStepRef.current + 1) % waypoints.length;
            const currentWp = waypoints[simStepRef.current];
            const nextWp = waypoints[(simStepRef.current + 1) % waypoints.length];

            const dLat = nextWp.lat - currentWp.lat;
            const dLng = nextWp.lng - currentWp.lng;
            let heading = Math.round((Math.atan2(dLng, dLat) * 180) / Math.PI);
            if (heading < 0) heading += 360;

            const speed = currentWp.isStop ? 0 : Math.round(35 + Math.sin(simStepRef.current * 0.6) * 14);

            setLiveTrackingData(prev => ({
                ...prev,
                [targetVeh.id]: {
                    vehicleId: targetVeh.id,
                    vehicleReg: targetVeh.regNo,
                    driverName: targetVeh.driverName || 'Muhammad Aslam',
                    driverPhone: targetVeh.driverPhone || '0300-1234567',
                    tripType: 'morning',
                    isLive: true,
                    tripStatus: 'in_progress',
                    latitude: currentWp.lat,
                    longitude: currentWp.lng,
                    speedKmH: speed,
                    heading: heading,
                    accuracyMeters: 4,
                    lastTimestamp: new Date().toISOString()
                }
            }));

            // If at a designated stop, auto-mark students at this stop as boarded
            if (currentWp.isStop && currentWp.stopName) {
                const todayStr = new Date().toISOString().slice(0, 10);
                const attKey = `${todayStr}_${activeRoute?.id || 'all'}_morning`;
                const stopAllocs = allocations.filter(a => a.pickupStop && a.pickupStop.toLowerCase().trim() === currentWp.stopName.toLowerCase().trim());
                if (stopAllocs.length > 0) {
                    setAttendanceLogs(prev => {
                        const subMap = { ...(prev[attKey] || {}) };
                        stopAllocs.forEach(st => {
                            subMap[st.studentId] = 'boarded';
                        });
                        return { ...prev, [attKey]: subMap };
                    });
                }
            }
        }, 1500);
    };

    // Clean up simulation on unmount
    useEffect(() => {
        return () => {
            if (simTimerRef.current) clearInterval(simTimerRef.current);
        };
    }, []);

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
            {/* ========================================================================= */}
            {/* TOP-LEVEL GRAND NAVIGATION SWITCHER */}
            {/* ========================================================================= */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                gap: '1rem',
                borderBottom: '1.5px solid #e2e8f0',
                paddingBottom: '0.85rem'
            }}>
                {/* Grand Tab Switcher Pills */}
                <div style={{
                    display: 'flex',
                    background: '#f1f5f9',
                    padding: '4px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1'
                }}>
                    <button
                        type="button"
                        onClick={() => setGrandTab('radar')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.65rem 1.4rem',
                            borderRadius: '9px',
                            border: 'none',
                            background: grandTab === 'radar' ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'transparent',
                            color: grandTab === 'radar' ? 'white' : '#475569',
                            fontWeight: '800',
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            boxShadow: grandTab === 'radar' ? '0 4px 12px rgba(2, 132, 199, 0.35)' : 'none',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Radio size={16} /> 🎛️ Overview & Live GPS Radar
                        <span style={{
                            background: grandTab === 'radar' ? 'rgba(255,255,255,0.25)' : '#dcfce7',
                            color: grandTab === 'radar' ? 'white' : '#15803d',
                            fontSize: '0.68rem',
                            padding: '0.12rem 0.45rem',
                            borderRadius: '8px',
                            fontWeight: '800',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                        }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: grandTab === 'radar' ? 'white' : '#15803d', animation: 'pulse 1.5s infinite' }}></span>
                            LIVE
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setGrandTab('fleet_management')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.65rem 1.4rem',
                            borderRadius: '9px',
                            border: 'none',
                            background: grandTab === 'fleet_management' ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : 'transparent',
                            color: grandTab === 'fleet_management' ? 'white' : '#475569',
                            fontWeight: '800',
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            boxShadow: grandTab === 'fleet_management' ? '0 4px 12px rgba(79, 70, 229, 0.35)' : 'none',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Bus size={16} /> 🚐 Transport & Van Fleet Management
                        <span style={{
                            background: grandTab === 'fleet_management' ? 'rgba(255,255,255,0.25)' : '#e0e7ff',
                            color: grandTab === 'fleet_management' ? 'white' : '#4338ca',
                            fontSize: '0.68rem',
                            padding: '0.12rem 0.45rem',
                            borderRadius: '8px',
                            fontWeight: '800'
                        }}>
                            {vehicles.length} Vans
                        </span>
                    </button>
                </div>

                {/* Right Quick Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>
                        🏫 <b>{schoolInfo.name || 'School Transport'}</b>
                    </span>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* GRAND TAB 1: 🎛️ LIVE GPS FLEET RADAR & OVERVIEW (STANDALONE RADAR VIEW) */}
            {/* ========================================================================= */}
            {grandTab === 'radar' && (() => {
                const currentOverviewVeh = selectedOverviewVehicleId !== 'all'
                    ? vehicles.find(v => v.id === selectedOverviewVehicleId)
                    : (vehicles.find(v => liveTrackingData[v.id]?.isLive) || vehicles[0] || null);

                const currentTracking = currentOverviewVeh ? (liveTrackingData[currentOverviewVeh.id] || {}) : {};
                const isLive = currentTracking.isLive && (currentTracking.tripStatus === 'in_progress' || currentTracking.tripStatus === 'active');
                const speed = currentTracking.speedKmH || 0;
                const overviewRoute = currentOverviewVeh
                    ? (routes.find(r => r.vehicleId === currentOverviewVeh.id) || routes.find(r => r.id === currentTracking.routeId) || routes[0] || null)
                    : (routes[0] || null);

                // Find all allocations for this vehicle or route
                const overviewAllocations = allocations.filter(a => {
                    if (currentOverviewVeh && (a.vehicleId === currentOverviewVeh.id || (currentOverviewVeh.regNo && a.vehicleRegNo === currentOverviewVeh.regNo))) return true;
                    if (overviewRoute && a.routeId === overviewRoute.id) return true;
                    return false;
                });

                const dNow = new Date();
                const todayStr = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;
                const todayUtc = dNow.toISOString().slice(0, 10);
                const attKey = `${todayStr}_${overviewRoute?.id || 'all'}_${overviewTripType}`;
                const altKeyWithVeh = `${todayStr}_${currentOverviewVeh?.id}_${overviewTripType}`;
                const altKeyWithTripRoute = `${todayStr}_${currentTracking.routeId}_${overviewTripType}`;

                // 1. Collect ALL live status maps from ALL active/live tracking documents streaming in Firestore
                const allLiveStatusMaps = {};
                Object.values(liveTrackingData || {}).forEach(trackDoc => {
                    if (trackDoc && trackDoc.studentStatusMap && typeof trackDoc.studentStatusMap === 'object') {
                        Object.assign(allLiveStatusMaps, trackDoc.studentStatusMap);
                    }
                });

                // 2. Collect ALL today's attendance logs across ANY route / vehicle / trip key in attendanceLogs
                const allTodayAttendanceLogs = {};
                Object.entries(attendanceLogs || {}).forEach(([k, subMap]) => {
                    if (typeof subMap === 'object' && subMap !== null) {
                        if (k.startsWith(todayStr) || k.startsWith(todayUtc) || k.includes(todayStr) || k.includes(todayUtc)) {
                            Object.assign(allTodayAttendanceLogs, subMap);
                        }
                    }
                });

                // 3. Robust unified map
                const currentAttMap = {
                    ...allTodayAttendanceLogs,
                    ...(attendanceLogs[altKeyWithVeh] || {}),
                    ...(attendanceLogs[altKeyWithTripRoute] || {}),
                    ...(attendanceLogs[attKey] || {}),
                    ...allLiveStatusMaps,
                    ...(currentTracking.studentStatusMap || {})
                };

                const getStudentStatus = (st) => {
                    if (!st) return 'pending';
                    const id1 = st.studentId;
                    const id2 = st.id;
                    const id3 = st._id;
                    const roll = st.rollNo;
                    const name = st.studentName || st.name;
                    if (id1 && currentAttMap[id1]) return currentAttMap[id1];
                    if (id2 && currentAttMap[id2]) return currentAttMap[id2];
                    if (id3 && currentAttMap[id3]) return currentAttMap[id3];
                    if (roll && currentAttMap[roll]) return currentAttMap[roll];
                    if (name && currentAttMap[name]) return currentAttMap[name];
                    return 'pending';
                };

                const totalAssigned = overviewAllocations.length;
                const boardedCount = overviewAllocations.filter(a => getStudentStatus(a) === 'boarded').length;
                const absentCount = overviewAllocations.filter(a => getStudentStatus(a) === 'absent').length;
                const pendingCount = Math.max(0, totalAssigned - boardedCount - absentCount);
                const boardedPercent = totalAssigned > 0 ? Math.round((boardedCount / totalAssigned) * 100) : 0;

                const activeVehiclesCount = vehicles.filter(v => liveTrackingData[v.id]?.isLive).length;

                return (
                    <div>
                        {/* Top Fleet Selector & Controls Bar */}
                        <div style={{
                            background: 'white',
                            padding: '1rem 1.25rem',
                            borderRadius: '14px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                            marginBottom: '1.25rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                        🎯 Target Fleet / Driver Monitor:
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <select
                                            value={selectedOverviewVehicleId}
                                            onChange={(e) => setSelectedOverviewVehicleId(e.target.value)}
                                            style={{
                                                padding: '0.55rem 0.85rem',
                                                borderRadius: '8px',
                                                border: '1.5px solid #cbd5e1',
                                                fontSize: '0.86rem',
                                                fontWeight: '700',
                                                color: '#0f172a',
                                                background: '#f8fafc',
                                                minWidth: '280px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="all">🌐 All Fleet Overview ({vehicles.length} Vehicles)</option>
                                            {vehicles.map(v => {
                                                const vLive = liveTrackingData[v.id]?.isLive;
                                                return (
                                                    <option key={v.id} value={v.id}>
                                                        {v.regNo} - {v.driverName || 'Driver'} {vLive ? '🟢 (LIVE ON ROAD)' : '⚪ (Standby)'}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                </div>

                                {/* Morning / Afternoon Trip Mode Switcher */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                        ⏰ Active Trip Mode:
                                    </label>
                                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setOverviewTripType('morning')}
                                            style={{
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: overviewTripType === 'morning' ? '#0284c7' : 'transparent',
                                                color: overviewTripType === 'morning' ? 'white' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.78rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            🌅 Morning Pick-up
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setOverviewTripType('afternoon')}
                                            style={{
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: overviewTripType === 'afternoon' ? '#0284c7' : 'transparent',
                                                color: overviewTripType === 'afternoon' ? 'white' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.78rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            🌇 Afternoon Drop-off
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Status, Simulation Demo & Quick Contact Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: isLive ? '#dcfce7' : '#f1f5f9', padding: '0.45rem 0.85rem', borderRadius: '8px', border: `1px solid ${isLive ? '#bbf7d0' : '#e2e8f0'}` }}>
                                    <Radio size={15} color={isLive ? '#15803d' : '#64748b'} />
                                    <span style={{ fontSize: '0.78rem', fontWeight: '800', color: isLive ? '#15803d' : '#64748b' }}>
                                        {isLive ? `LIVE IN TRANSIT (${speed} km/h)` : `STANDBY (${activeVehiclesCount} Live in Fleet)`}
                                    </span>
                                </div>

                                {/* Live GPS Simulator Button for Presentation */}
                                <button
                                    type="button"
                                    onClick={toggleLiveSimulation}
                                    className="btn hover-lift"
                                    style={{
                                        background: isSimulating ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.5rem 0.95rem',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        boxShadow: isSimulating ? '0 0 14px rgba(239, 68, 68, 0.45)' : '0 4px 12px rgba(139, 92, 246, 0.35)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {isSimulating ? (
                                        <>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white', animation: 'pulse 1s infinite' }}></span>
                                            ⏹️ Stop Live Demo ({speed} km/h)
                                        </>
                                    ) : (
                                        <>
                                            <span>🎮</span> 🚀 Simulate Live GPS Demo
                                        </>
                                    )}
                                </button>

                                {currentOverviewVeh && currentOverviewVeh.driverPhone && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            let p = currentOverviewVeh.driverPhone.replace(/[^0-9]/g, '');
                                            if (p.startsWith('0')) p = '92' + p.slice(1);
                                            const txt = encodeURIComponent(`Assalam-o-Alaikum ${currentOverviewVeh.driverName},\nRegarding School Van ${currentOverviewVeh.regNo}: Please confirm your live route location & trip status.`);
                                            window.open(`https://wa.me/${p}?text=${txt}`, '_blank');
                                        }}
                                        className="btn hover-lift"
                                        style={{ background: '#25D366', color: 'white', border: 'none', padding: '0.5rem 0.85rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                    >
                                        <MessageSquare size={14} /> WhatsApp Driver
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (mapInstanceRef.current && markersLayerRef.current) {
                                            const bounds = L.latLngBounds([]);
                                            markersLayerRef.current.eachLayer(layer => {
                                                if (layer.getLatLng) bounds.extend(layer.getLatLng());
                                            });
                                            if (bounds.isValid()) {
                                                mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                                            }
                                        }
                                    }}
                                    className="btn"
                                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', padding: '0.5rem 0.85rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                    <Navigation2 size={14} color="#0284c7" /> Re-Center Map
                                </button>
                            </div>
                        </div>

                        {/* 4 Live Telemetrics KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                            {/* Card 1: Speedometer */}
                            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #0284c7', background: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Current Speed</span>
                                    <Navigation size={16} color="#0284c7" />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', margin: '0.3rem 0' }}>
                                    <h2 style={{ fontSize: '1.75rem', fontWeight: '900', color: isLive ? '#0284c7' : '#0f172a', margin: 0 }}>
                                        {speed}
                                    </h2>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>km/h</span>
                                </div>
                                <span style={{ fontSize: '0.72rem', fontWeight: '700', color: speed > 60 ? '#ef4444' : speed > 0 ? '#10b981' : '#64748b' }}>
                                    {speed > 60 ? '⚠️ High Speed' : speed > 0 ? '🟢 In Motion (Normal)' : isLive ? '🟡 Stationary / At Stop' : '⚪ Engine Off'}
                                </span>
                            </div>

                            {/* Card 2: Active Route */}
                            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #6366f1', background: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Assigned Route</span>
                                    <MapPin size={16} color="#6366f1" />
                                </div>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1e1b4b', margin: '0.4rem 0 0.2rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {overviewRoute ? overviewRoute.title : 'No Route Configured'}
                                </h4>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    {(overviewRoute?.stops || []).length} Designated Stops | PKR {overviewRoute?.monthlyBaseFare || 2500}/mo
                                </span>
                            </div>

                            {/* Card 3: Live Student Boarding Rate */}
                            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981', background: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Student Boarding</span>
                                    <Users size={16} color="#10b981" />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', margin: '0.3rem 0' }}>
                                    <h2 style={{ fontSize: '1.6rem', fontWeight: '900', color: '#10b981', margin: 0 }}>
                                        {boardedCount} / {totalAssigned}
                                    </h2>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b' }}>({boardedPercent}%)</span>
                                </div>
                                {/* Progress Bar */}
                                <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.35rem' }}>
                                    <div style={{ width: `${boardedPercent}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', transition: 'width 0.3s ease' }}></div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', fontWeight: '600' }}>
                                    <span style={{ color: '#10b981' }}>🟢 {boardedCount} Boarded</span>
                                    <span style={{ color: '#ef4444' }}>🔴 {absentCount} Absent</span>
                                    <span style={{ color: '#f59e0b' }}>⏳ {pendingCount} Waiting</span>
                                </div>
                            </div>

                            {/* Card 4: Active Driver & Vehicle Spec */}
                            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b', background: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Driver on Duty</span>
                                    <Bus size={16} color="#f59e0b" />
                                </div>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#78350f', margin: '0.4rem 0 0.2rem 0' }}>
                                    {currentOverviewVeh ? currentOverviewVeh.driverName || 'Muhammad Aslam' : 'No Vehicle Selected'}
                                </h4>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    Van: <b>{currentOverviewVeh?.regNo || 'LEA-4821'}</b> ({currentOverviewVeh?.type || 'HiAce Van'})
                                </span>
                            </div>
                        </div>

                        {/* Main Split-Screen: Live Leaflet Map (Left) + Stops & Boarding Feed (Right) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(360px, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
                            {/* LEFT PANEL: 100% Free OpenStreetMap Interactive Leaflet Map */}
                            <div style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
                                        <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0f172a' }}>
                                            🗺️ Real-Time GPS Tracking Map (OpenStreetMap Powered)
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', background: 'white', border: '1px solid #cbd5e1', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '600' }}>
                                        100% Free Cloud Radar
                                    </span>
                                </div>

                                {/* Leaflet Map Div Container */}
                                <div
                                    ref={mapContainerRef}
                                    style={{
                                        height: '560px',
                                        width: '100%',
                                        zIndex: 1,
                                        position: 'relative'
                                    }}
                                />
                            </div>

                            {/* RIGHT PANEL: Route Stop Sequence & Live Boarding Feed */}
                            <div style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', height: '610px' }}>
                                <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0f172a' }}>
                                            📍 Route Stops & Boarding Feed
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            {overviewRoute ? `${overviewRoute.title} (${(overviewRoute.stops || []).length} stops)` : 'Select a route to monitor'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.3rem 0.65rem', borderRadius: '6px' }}>
                                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }}></div>
                                        <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: '800' }}>
                                            📡 Driver-Controlled Live Feed
                                        </span>
                                    </div>
                                </div>

                                {/* Scrollable Stops & Students Container */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                                    {(!overviewRoute || !Array.isArray(overviewRoute.stops) || overviewRoute.stops.length === 0) ? (
                                        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                                            <MapPin size={36} color="#cbd5e1" style={{ marginBottom: '0.75rem' }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600' }}>No stops configured for this vehicle's route.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                            {overviewRoute.stops.map((stop, idx) => {
                                                const stopStudents = overviewAllocations.filter(a => {
                                                    const stStop = (a.pickupStop || a.stopName || '').toLowerCase().trim();
                                                    const rStop = (stop.stopName || '').toLowerCase().trim();
                                                    return stStop === rStop || (overviewRoute.stops.length === 1 && !stStop);
                                                });
                                                const stopBoardedCount = stopStudents.filter(s => getStudentStatus(s) === 'boarded').length;

                                                return (
                                                    <div
                                                        key={idx}
                                                        style={{
                                                            background: '#f8fafc',
                                                            borderRadius: '10px',
                                                            border: '1px solid #e2e8f0',
                                                            overflow: 'hidden'
                                                        }}
                                                    >
                                                        {/* Stop Title Banner */}
                                                        <div style={{
                                                            padding: '0.55rem 0.75rem',
                                                            background: '#f1f5f9',
                                                            borderBottom: '1px solid #e2e8f0',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#0284c7', color: 'white', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                                                    #{idx + 1}
                                                                </span>
                                                                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0f172a' }}>
                                                                    {stop.stopName}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: '#475569' }}>
                                                                <Clock size={12} color="#0284c7" />
                                                                <span>{overviewTripType === 'morning' ? stop.morningTime : stop.afternoonTime}</span>
                                                                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: '700' }}>
                                                                    {stopBoardedCount}/{stopStudents.length}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Student Roster at this Stop */}
                                                        <div style={{ padding: '0.45rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                            {stopStudents.length === 0 ? (
                                                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', padding: '0.35rem 0.5rem', fontStyle: 'italic' }}>
                                                                    No students allocated to this stop yet.
                                                                </div>
                                                            ) : (
                                                                stopStudents.map(student => {
                                                                    const stId = student.studentId || student.id;
                                                                    const status = getStudentStatus(student);

                                                                    return (
                                                                        <div
                                                                            key={student.id || student.studentId}
                                                                            style={{
                                                                                display: 'flex',
                                                                                justifyContent: 'space-between',
                                                                                alignItems: 'center',
                                                                                background: 'white',
                                                                                padding: '0.45rem 0.65rem',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #e2e8f0'
                                                                            }}
                                                                        >
                                                                            <div>
                                                                                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#0f172a' }}>
                                                                                    {student.studentName}
                                                                                </div>
                                                                                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                                                    {student.className} {student.section ? `(${student.section})` : ''} • Roll #{student.rollNo || 'N/A'}
                                                                                </span>
                                                                            </div>

                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                                {/* Read-Only Live Boarding Status Badge (Driver App Controlled) */}
                                                                                <div
                                                                                    title="Live status streamed from Driver App"
                                                                                    style={{
                                                                                        padding: '0.22rem 0.55rem',
                                                                                        borderRadius: '5px',
                                                                                        fontSize: '0.7rem',
                                                                                        fontWeight: '800',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '0.25rem',
                                                                                        userSelect: 'none',
                                                                                        cursor: 'default',
                                                                                        background: status === 'boarded' ? '#dcfce7' : status === 'absent' ? '#fee2e2' : '#fef3c7',
                                                                                        color: status === 'boarded' ? '#15803d' : status === 'absent' ? '#b91c1c' : '#b45309',
                                                                                        border: `1px solid ${status === 'boarded' ? '#86efac' : status === 'absent' ? '#fca5a5' : '#fde68a'}`
                                                                                    }}
                                                                                >
                                                                                    {status === 'boarded' ? '✓ Boarded' : status === 'absent' ? '✕ Absent' : '⏳ Waiting'}
                                                                                </div>

                                                                                {/* WhatsApp Parent Button */}
                                                                                {student.parentPhone && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => sendBoardingAlertWhatsApp(student, status === 'boarded' ? 'boarded' : 'approaching')}
                                                                                        title={`WhatsApp ${student.parentName || 'Parent'}`}
                                                                                        style={{
                                                                                            background: '#f0fdf4',
                                                                                            border: '1px solid #bbf7d0',
                                                                                            color: '#16a34a',
                                                                                            padding: '0.25rem',
                                                                                            borderRadius: '4px',
                                                                                            cursor: 'pointer',
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'center'
                                                                                        }}
                                                                                    >
                                                                                        <MessageSquare size={13} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ========================================================================= */}
            {/* GRAND TAB 2: 🚐 TRANSPORT & VAN FLEET MANAGEMENT (FLEET, ROUTES, ALLOCS) */}
            {/* ========================================================================= */}
            {grandTab === 'fleet_management' && (
                <div>
                    {/* Management Top Header & Global Action Buttons */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1.25rem',
                        flexWrap: 'wrap',
                        gap: '1rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                            <div style={{
                                width: '46px',
                                height: '46px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 8px 16px -4px rgba(79, 70, 229, 0.4)'
                            }}>
                                <Bus color="white" size={24} />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                                    Transport & Van Fleet Management
                                </h2>
                                <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0 }}>
                                    Manage vehicles, drivers, route stops sequence, student seat allocations & fuel logs
                                </p>
                            </div>
                        </div>

                        {/* Management Action Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                            {vehicles.length === 0 && (
                                <button
                                    onClick={initializeSampleTransport}
                                    className="btn hover-lift"
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                        color: 'white',
                                        padding: '0.55rem 1rem',
                                        borderRadius: '8px',
                                        fontWeight: '700',
                                        fontSize: '0.82rem',
                                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <RefreshCw size={15} /> 🚀 Restore Fleet Data
                                </button>
                            )}
                            <button
                                onClick={downloadTransportReportPDF}
                                className="btn"
                                style={{
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    color: '#334155',
                                    padding: '0.55rem 0.9rem',
                                    borderRadius: '8px',
                                    fontWeight: '600',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Download size={15} /> Export PDF Roster
                            </button>
                            <button
                                onClick={handleOpenAllocationModal}
                                className="btn hover-lift"
                                style={{
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white',
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <Users size={16} /> + Allocate Student Seat
                            </button>
                            <button
                                onClick={() => handleOpenDriverModal()}
                                className="btn hover-lift"
                                style={{
                                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                                    color: 'white',
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <ShieldCheck size={16} /> + Add Driver & App Account
                            </button>
                            <button
                                onClick={() => handleOpenVehicleModal()}
                                className="btn"
                                style={{
                                    background: '#4f46e5',
                                    color: 'white',
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                                }}
                            >
                                <Plus size={16} /> Add New Vehicle
                            </button>
                        </div>
                    </div>

                    {/* Quick Metrics Cards (ONLY IN FLEET MANAGEMENT) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #0284c7', background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Fleet Size</span>
                                <Bus size={17} color="#0284c7" />
                            </div>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: '0.3rem 0' }}>
                                {metrics.totalVehicles} Vehicles
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: '600' }}>
                                🟢 {metrics.activeVehicles} Active on Road
                            </span>
                        </div>

                        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981', background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Enrolled Students</span>
                                <Users size={17} color="#10b981" />
                            </div>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#10b981', margin: '0.3rem 0' }}>
                                {metrics.totalEnrolled} Students
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                {metrics.totalCapacity} Total Seats ({metrics.availableSeats} Vacant)
                            </span>
                        </div>

                        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #6366f1', background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Monthly Fare Revenue</span>
                                <DollarSign size={17} color="#6366f1" />
                            </div>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#4f46e5', margin: '0.3rem 0' }}>
                                PKR {metrics.monthlyRevenue.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                From {routes.length} Active Routes
                            </span>
                        </div>

                        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b', background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Fuel & Repairs (Month)</span>
                                <Fuel size={17} color="#f59e0b" />
                            </div>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#d97706', margin: '0.3rem 0' }}>
                                PKR {metrics.totalExpense.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                Fuel: {metrics.monthlyFuelCost} | Maint: {metrics.monthlyMaintCost}
                            </span>
                        </div>
                    </div>

                    {/* Management Sub-Navigation Tabs Bar */}
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        borderBottom: '2px solid #e2e8f0',
                        marginBottom: '1.25rem',
                        overflowX: 'auto',
                        paddingBottom: '0.25rem'
                    }}>
                        {[
                            { id: 'fleet', label: '🚐 Fleet & Vehicles', count: vehicles.length },
                            { id: 'drivers', label: '👨‍✈️ Drivers & App Accounts', count: drivers.length },
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
                                    padding: '0.65rem 1.15rem',
                                    border: 'none',
                                    background: 'transparent',
                                    color: activeTab === tab.id ? '#4f46e5' : '#64748b',
                                    fontWeight: activeTab === tab.id ? '700' : '600',
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    borderBottom: activeTab === tab.id ? '3px solid #4f46e5' : '3px solid transparent',
                                    marginBottom: '-2px',
                                    transition: 'all 0.2s ease',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <span>{tab.label}</span>
                                {tab.count !== undefined && (
                                    <span style={{
                                        background: activeTab === tab.id ? '#e0e7ff' : '#f1f5f9',
                                        color: activeTab === tab.id ? '#4338ca' : '#64748b',
                                        fontSize: '0.7rem',
                                        padding: '0.12rem 0.45rem',
                                        borderRadius: '6px',
                                        fontWeight: '700'
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
            {/* TAB 1.5: DRIVER ACCOUNTS & MOBILE APP CREDENTIALS */}
            {/* ========================================================================= */}
            {activeTab === 'drivers' && (
                <div>
                    {/* Top Action Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ position: 'relative', width: '340px' }}>
                            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Search by Driver Name, Email, Phone, or CNIC..."
                                value={driverSearch}
                                onChange={(e) => setDriverSearch(e.target.value)}
                                style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.6rem' }}>
                            <button
                                onClick={() => handleOpenDriverModal()}
                                className="btn"
                                style={{ background: '#0284c7', color: 'white', padding: '0.55rem 1.15rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700' }}
                            >
                                <Plus size={16} /> Create Driver Account
                            </button>
                        </div>
                    </div>

                    {/* Drivers List Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
                        {drivers
                            .filter(d =>
                                (d.name && d.name.toLowerCase().includes(driverSearch.toLowerCase())) ||
                                (d.email && d.email.toLowerCase().includes(driverSearch.toLowerCase())) ||
                                (d.phone && d.phone.includes(driverSearch)) ||
                                (d.cnic && d.cnic.includes(driverSearch))
                            )
                            .map(drv => {
                                const assignedVeh = vehicles.find(v => v.id === drv.assignedVehicleId);
                                const assignedRoute = routes.find(r => r.vehicleId === drv.assignedVehicleId);

                                return (
                                    <div
                                        key={drv.id}
                                        className="card hover-lift"
                                        style={{
                                            padding: '1.25rem',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            background: '#ffffff',
                                            borderRadius: '16px',
                                            boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <div>
                                            {/* Driver Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{
                                                        width: '44px',
                                                        height: '44px',
                                                        borderRadius: '12px',
                                                        background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
                                                        color: '#0284c7',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: '800',
                                                        fontSize: '1.1rem'
                                                    }}>
                                                        {drv.name ? drv.name.charAt(0).toUpperCase() : 'D'}
                                                    </div>
                                                    <div>
                                                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                                            {drv.name}
                                                        </h3>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            School Driver • UID: {drv.id.slice(0, 6)}...
                                                        </span>
                                                    </div>
                                                </div>

                                                <span style={{
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '9999px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    background: drv.status === 'Inactive' ? '#fee2e2' : '#dcfce7',
                                                    color: drv.status === 'Inactive' ? '#b91c1c' : '#15803d'
                                                }}>
                                                    ● {drv.status || 'Active'}
                                                </span>
                                            </div>

                                            {/* App Login Credentials Box */}
                                            <div style={{
                                                background: '#0f172a',
                                                padding: '0.75rem 0.9rem',
                                                borderRadius: '10px',
                                                color: 'white',
                                                marginBottom: '0.85rem'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
                                                        📱 Driver App Login
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: '600' }}>
                                                        School ID: {schoolId}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc', wordBreak: 'break-all' }}>
                                                        {drv.email}
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(drv.email);
                                                            showAlert('Email copied to clipboard!', 'info');
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                                                        title="Copy Login Email"
                                                    >
                                                        <Copy size={13} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Vehicle & Contact Details */}
                                            <div style={{ fontSize: '0.82rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
                                                {drv.phone && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <Phone size={14} color="#0284c7" />
                                                        <strong style={{ color: '#0f172a' }}>Phone:</strong> {drv.phone}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <Bus size={14} color="#4f46e5" />
                                                    <strong style={{ color: '#0f172a' }}>Assigned Van:</strong>
                                                    {assignedVeh ? (
                                                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#e0e7ff', color: '#4338ca', fontWeight: '700', fontSize: '0.75rem' }}>
                                                            {assignedVeh.regNo} ({assignedVeh.type})
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unassigned</span>
                                                    )}
                                                </div>
                                                {assignedRoute && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <Navigation size={14} color="#10b981" />
                                                        <strong style={{ color: '#0f172a' }}>Route:</strong>
                                                        <span style={{ color: '#059669', fontWeight: '600', fontSize: '0.78rem' }}>
                                                            {assignedRoute.title}
                                                        </span>
                                                    </div>
                                                )}
                                                {(drv.licenseNo || drv.cnic) && (
                                                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.15rem' }}>
                                                        License: <strong>{drv.licenseNo || 'N/A'}</strong> | CNIC: {drv.cnic || 'N/A'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                                            <button
                                                onClick={() => sendDriverCredentialsWhatsApp(drv)}
                                                className="btn hover-lift"
                                                style={{ flex: 2, background: '#dcfce7', color: '#15803d', padding: '0.45rem 0.65rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', justifyContent: 'center' }}
                                                title="Share School ID, Email & Password via WhatsApp"
                                            >
                                                <MessageSquare size={14} /> Send WhatsApp Login
                                            </button>
                                            <button
                                                onClick={() => handleOpenDriverModal(drv)}
                                                className="btn"
                                                style={{ flex: 1, background: '#f1f5f9', color: '#334155', padding: '0.45rem', borderRadius: '8px', fontSize: '0.78rem', justifyContent: 'center' }}
                                            >
                                                <Edit size={14} /> Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteDriver(drv)}
                                                style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.45rem 0.65rem', borderRadius: '8px', cursor: 'pointer' }}
                                                title="Delete Driver Account"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    {/* Empty State */}
                    {drivers.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #cbd5e1', marginTop: '1rem' }}>
                            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                                <Users size={32} />
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.4rem 0' }}>
                                No Driver Accounts Created Yet
                            </h3>
                            <p style={{ color: '#64748b', fontSize: '0.86rem', maxWidth: '440px', margin: '0 auto 1.25rem auto' }}>
                                Create driver login accounts so your transport staff can log in to the Driver Mobile App, run daily pickup trips, and take live boarding attendance.
                            </p>
                            <button
                                onClick={() => handleOpenDriverModal()}
                                className="btn"
                                style={{ background: '#0284c7', color: 'white', padding: '0.65rem 1.5rem', borderRadius: '10px', fontWeight: '700' }}
                            >
                                <Plus size={18} /> Create First Driver Account
                            </button>
                        </div>
                    )}
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
                                                        onClick={() => handleOpenEditAllocationModal(alloc)}
                                                        title="Edit Route & Pickup Stop Allocation"
                                                        className="btn"
                                                        style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '0.35rem 0.55rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '700' }}
                                                    >
                                                        <Edit size={13} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => sendRouteDetailsWhatsApp(alloc)}
                                                        title="Send WhatsApp Route & Timings"
                                                        className="btn"
                                                        style={{ background: '#dcfce7', color: '#15803d', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.76rem' }}
                                                    >
                                                        <MessageSquare size={14} /> WhatsApp
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAllocation(alloc)}
                                                        title="Remove from Transport"
                                                        style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.35rem 0.55rem', borderRadius: '6px', cursor: 'pointer' }}
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
            </div>
        )}

            {/* ========================================================================= */}
            {/* 0. ADD / EDIT DRIVER ACCOUNT MODAL */}
            {/* ========================================================================= */}
            {driverModalOpen && (
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
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '620px', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                        {editingDriver ? 'Edit Driver Profile & Access' : 'Create New Driver & App Account'}
                                    </h3>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        Driver will use these credentials on the Mobile App
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setDriverModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* App Login Info Banner */}
                        <div style={{ background: '#0f172a', padding: '0.85rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', color: '#ffffff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                <Smartphone size={16} color="#38bdf8" />
                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#38bdf8' }}>
                                    Mobile App Access Credentials
                                </span>
                            </div>
                            <p style={{ fontSize: '0.74rem', color: '#cbd5e1', margin: 0, lineHeight: 1.4 }}>
                                School ID: <strong style={{ color: '#ffffff' }}>{schoolId}</strong> (Auto-linked). Driver will enter this School ID with the Email and Password configured below.
                            </p>
                        </div>

                        <form onSubmit={handleSaveDriver}>
                            {/* Driver Name & Phone */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Driver Full Name *:</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Muhammad Aslam"
                                        value={driverFormData.name}
                                        onChange={(e) => setDriverFormData({ ...driverFormData, name: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Phone / WhatsApp Number *:</label>
                                    <input
                                        type="text"
                                        placeholder="0301-1234567"
                                        value={driverFormData.phone}
                                        onChange={(e) => setDriverFormData({ ...driverFormData, phone: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            {/* Driver Email & Password */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Login Email / Username *:</label>
                                    <input
                                        type="email"
                                        placeholder="driver.name@school.com"
                                        value={driverFormData.email}
                                        onChange={(e) => setDriverFormData({ ...driverFormData, email: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>
                                            {editingDriver ? 'New Password (Optional):' : 'Login Password *:'}
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setDriverFormData({ ...driverFormData, password: 'driver' + Math.floor(1000 + Math.random() * 9000) })}
                                            style={{ background: 'transparent', border: 'none', color: '#0284c7', fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer', padding: 0 }}
                                        >
                                            ⚡ Auto Generate
                                        </button>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={driverPasswordVisible ? 'text' : 'password'}
                                            placeholder={editingDriver ? 'Leave blank to keep current' : 'Min 6 characters'}
                                            value={driverFormData.password}
                                            onChange={(e) => setDriverFormData({ ...driverFormData, password: e.target.value })}
                                            required={!editingDriver}
                                            minLength={editingDriver ? 0 : 6}
                                            style={{ width: '100%', padding: '0.55rem 2rem 0.55rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setDriverPasswordVisible(!driverPasswordVisible)}
                                            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                                        >
                                            {driverPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* License & CNIC */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Driving License Number:</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. LHR-984210"
                                        value={driverFormData.licenseNo}
                                        onChange={(e) => setDriverFormData({ ...driverFormData, licenseNo: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Driver CNIC Number:</label>
                                    <input
                                        type="text"
                                        placeholder="35201-1234567-1"
                                        value={driverFormData.cnic}
                                        onChange={(e) => setDriverFormData({ ...driverFormData, cnic: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            {/* Assign Vehicle & Status */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Assign Van / Vehicle:</label>
                                    <select
                                        value={driverFormData.assignedVehicleId}
                                        onChange={(e) => setDriverFormData({ ...driverFormData, assignedVehicleId: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        <option value="">-- No Vehicle (Standby / Pool Driver) --</option>
                                        {vehicles.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {v.regNo} ({v.type})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Account Status:</label>
                                    <select
                                        value={driverFormData.status}
                                        onChange={(e) => setDriverFormData({ ...driverFormData, status: e.target.value })}
                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        <option value="Active">Active (Can Login)</option>
                                        <option value="Inactive">Inactive (Disabled)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setDriverModalOpen(false)}
                                    disabled={isSavingDriver}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: '600' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn hover-lift"
                                    disabled={isSavingDriver}
                                    style={{ flex: 2, background: '#0284c7', color: 'white', padding: '0.65rem', borderRadius: '8px', fontWeight: '700', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    {isSavingDriver ? (
                                        <>
                                            <RefreshCw size={16} className="animate-spin" /> Provisioning Account...
                                        </>
                                    ) : (
                                        editingDriver ? 'Update Driver Profile' : '✓ Create Driver Account'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 1. ADD / EDIT VEHICLE MODAL (3 SWIPEABLE SLIDES: PROFILE, ROUTE, ALLOCATION) */}
            {/* ========================================================================= */}
            {vehicleModalOpen && (() => {
                const targetVehId = editingVehicle ? editingVehicle.id : vehicleFormData.id;
                const targetVehAllocations = allocations.filter(a => (targetVehId && a.vehicleId === targetVehId) || (vehicleFormData.regNo && a.vehicleRegNo === vehicleFormData.regNo) || (editingRoute && a.routeId === editingRoute.id));
                const targetVehCapacity = Number(vehicleFormData.capacity) || 15;
                const targetVehVacant = Math.max(0, targetVehCapacity - targetVehAllocations.length);

                return (
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
                        <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '900px', padding: '1.5rem', maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
                            {/* Header with Animated Tab Switcher */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                            {editingVehicle ? `Vehicle ${vehicleFormData.regNo || ''}` : 'Register New Vehicle'}
                                        </h3>
                                        {editingVehicle && (
                                            <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '6px', background: vehicleFormData.status === 'Active' ? '#dcfce7' : '#fee2e2', color: vehicleFormData.status === 'Active' ? '#15803d' : '#b91c1c', fontWeight: '700' }}>
                                                {vehicleFormData.status}
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                        {vehicleModalTab === 'vehicle' ? 'Manage fleet specs, driver account & fitness documents' : vehicleModalTab === 'route' ? 'Manage route stops sequence, timings & fares' : 'Direct student van enrolment & seat allocations'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {/* Swipe Tab Segmented Switcher (3 Tabs) */}
                                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setVehicleModalTab('vehicle')}
                                            style={{
                                                padding: '0.35rem 0.65rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: vehicleModalTab === 'vehicle' ? 'white' : 'transparent',
                                                color: vehicleModalTab === 'vehicle' ? '#0f172a' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.76rem',
                                                cursor: 'pointer',
                                                boxShadow: vehicleModalTab === 'vehicle' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem'
                                            }}
                                        >
                                            <Truck size={14} color={vehicleModalTab === 'vehicle' ? '#0284c7' : '#64748b'} /> Vehicle Profile
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setVehicleModalTab('route')}
                                            style={{
                                                padding: '0.35rem 0.65rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: vehicleModalTab === 'route' ? '#0284c7' : 'transparent',
                                                color: vehicleModalTab === 'route' ? 'white' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.76rem',
                                                cursor: 'pointer',
                                                boxShadow: vehicleModalTab === 'route' ? '0 2px 6px rgba(2,132,199,0.3)' : 'none',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem'
                                            }}
                                        >
                                            <MapPin size={14} color={vehicleModalTab === 'route' ? 'white' : '#64748b'} /> 🗺️ Route
                                            {editingRoute && (
                                                <span style={{ background: vehicleModalTab === 'route' ? 'rgba(255,255,255,0.3)' : '#dbeafe', color: vehicleModalTab === 'route' ? 'white' : '#1e40af', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800' }}>
                                                    {(editingRoute.stops || []).length} stops
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setVehicleModalTab('allocations')}
                                            style={{
                                                padding: '0.35rem 0.65rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: vehicleModalTab === 'allocations' ? '#16a34a' : 'transparent',
                                                color: vehicleModalTab === 'allocations' ? 'white' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.76rem',
                                                cursor: 'pointer',
                                                boxShadow: vehicleModalTab === 'allocations' ? '0 2px 6px rgba(22,163,74,0.3)' : 'none',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem'
                                            }}
                                        >
                                            <GraduationCap size={14} color={vehicleModalTab === 'allocations' ? 'white' : '#64748b'} /> 🎓 Allocate Students
                                            <span style={{ background: vehicleModalTab === 'allocations' ? 'rgba(255,255,255,0.3)' : '#dcfce7', color: vehicleModalTab === 'allocations' ? 'white' : '#15803d', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800' }}>
                                                {targetVehAllocations.length}/{targetVehCapacity}
                                            </span>
                                        </button>
                                    </div>

                                    <button onClick={() => setVehicleModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Swipe Animated Container (3 Slides: 300% Width) */}
                            <div style={{ overflow: 'hidden', width: '100%', position: 'relative' }}>
                                <div style={{
                                    display: 'flex',
                                    width: '300%',
                                    transform: vehicleModalTab === 'vehicle'
                                        ? 'translateX(0%)'
                                        : vehicleModalTab === 'route'
                                            ? 'translateX(-33.333333%)'
                                            : 'translateX(-66.666666%)',
                                    transition: 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)'
                                }}>
                                    {/* ========================================================================= */}
                                    {/* SLIDE 1: VEHICLE PROFILE FORM */}
                                    {/* ========================================================================= */}
                                    <div style={{ width: '33.333333%', paddingRight: '0.6rem', boxSizing: 'border-box' }}>
                                        {/* Quick Jump Action Banners */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                                            <div
                                                onClick={() => setVehicleModalTab('route')}
                                                style={{
                                                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                                    border: '1px solid #bfdbfe',
                                                    borderRadius: '10px',
                                                    padding: '0.6rem 0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    boxShadow: '0 2px 5px rgba(2, 132, 199, 0.08)',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#0284c7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <MapPin size={16} />
                                                    </div>
                                                    <div>
                                                        <strong style={{ fontSize: '0.78rem', color: '#1e3a8a', display: 'block' }}>
                                                            {editingRoute ? editingRoute.title : `Route & Stops`}
                                                        </strong>
                                                        <span style={{ fontSize: '0.7rem', color: '#2563eb' }}>
                                                            {(editingRoute?.stops || []).length} Stops · Click to Edit ➔
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div
                                                onClick={() => setVehicleModalTab('allocations')}
                                                style={{
                                                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                                    border: '1px solid #bbf7d0',
                                                    borderRadius: '10px',
                                                    padding: '0.6rem 0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    boxShadow: '0 2px 5px rgba(22, 163, 74, 0.08)',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#16a34a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <GraduationCap size={16} />
                                                    </div>
                                                    <div>
                                                        <strong style={{ fontSize: '0.78rem', color: '#14532d', display: 'block' }}>
                                                            Allocate Students
                                                        </strong>
                                                        <span style={{ fontSize: '0.7rem', color: '#15803d' }}>
                                                            {targetVehAllocations.length}/{targetVehCapacity} Seats Assigned ➔
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
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
                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Model Year:</label>
                                                    <input
                                                        type="text"
                                                        placeholder="2022"
                                                        value={vehicleFormData.modelYear}
                                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, modelYear: e.target.value })}
                                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Driver Assignment */}
                                            <div style={{ marginBottom: '1rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#1e293b' }}>
                                                        👨‍✈️ Driver & App Account Assignment:
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setVehicleModalOpen(false);
                                                            handleOpenDriverModal();
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: '#0284c7', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', padding: 0 }}
                                                    >
                                                        + Create New Driver
                                                    </button>
                                                </div>

                                                <select
                                                    value={vehicleFormData.driverId || ''}
                                                    onChange={(e) => {
                                                        const selectedDrvId = e.target.value;
                                                        const selectedDrv = drivers.find(d => d.id === selectedDrvId);
                                                        if (selectedDrv) {
                                                            setVehicleFormData({
                                                                ...vehicleFormData,
                                                                driverId: selectedDrv.id,
                                                                driverName: selectedDrv.name,
                                                                driverPhone: selectedDrv.phone,
                                                                driverLicense: selectedDrv.licenseNo || '',
                                                                driverCnic: selectedDrv.cnic || '',
                                                                driverEmail: selectedDrv.email || ''
                                                            });
                                                        } else {
                                                            setVehicleFormData({
                                                                ...vehicleFormData,
                                                                driverId: '',
                                                                driverName: '',
                                                                driverPhone: '',
                                                                driverLicense: '',
                                                                driverCnic: '',
                                                                driverEmail: ''
                                                            });
                                                        }
                                                    }}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: 'white', marginBottom: '0.5rem' }}
                                                >
                                                    <option value="">-- Select Registered Driver (Or Enter Below) --</option>
                                                    {drivers.map(d => (
                                                        <option key={d.id} value={d.id}>
                                                            {d.name} ({d.phone}) {d.email ? `· ${d.email}` : ''}
                                                        </option>
                                                    ))}
                                                </select>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Driver Full Name"
                                                        value={vehicleFormData.driverName}
                                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, driverName: e.target.value })}
                                                        style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: 'white' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Driver Phone / Mobile"
                                                        value={vehicleFormData.driverPhone}
                                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, driverPhone: e.target.value })}
                                                        style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: 'white' }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Helper Details */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Helper / Conductor Name:</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Rashid Ali"
                                                        value={vehicleFormData.helperName}
                                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, helperName: e.target.value })}
                                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Helper Phone:</label>
                                                    <input
                                                        type="text"
                                                        placeholder="0300-1234567"
                                                        value={vehicleFormData.helperPhone}
                                                        onChange={(e) => setVehicleFormData({ ...vehicleFormData, helperPhone: e.target.value })}
                                                        style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Document Expiries */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#64748b' }}>Fitness Certificate:</label>
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

                                    {/* ========================================================================= */}
                                    {/* SLIDE 2: ROUTE & STOPS MANAGEMENT FORM */}
                                    {/* ========================================================================= */}
                                    <div style={{ width: '33.333333%', paddingLeft: '0.3rem', paddingRight: '0.3rem', boxSizing: 'border-box' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.5rem 0.85rem', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1e40af' }}>
                                                    🗺️ Route Configuration for {vehicleFormData.regNo || 'Selected Van'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setVehicleModalTab('vehicle')}
                                                    style={{ background: 'white', border: '1px solid #cbd5e1', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                >
                                                    ← Vehicle
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setVehicleModalTab('allocations')}
                                                    style={{ background: '#16a34a', border: 'none', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                >
                                                    🎓 Allocations ➔
                                                </button>
                                            </div>
                                        </div>

                                        <form onSubmit={handleSaveRouteForVehicle}>
                                            {/* Compact Top Route Info: Title & Base Fare */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Route Title *:</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Route 1 - Gulberg & Model Town"
                                                        value={routeFormData.title}
                                                        onChange={(e) => setRouteFormData({ ...routeFormData, title: e.target.value })}
                                                        required
                                                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Monthly Base Fare (PKR):</label>
                                                    <input
                                                        type="number"
                                                        value={routeFormData.monthlyBaseFare}
                                                        onChange={(e) => setRouteFormData({ ...routeFormData, monthlyBaseFare: Number(e.target.value) })}
                                                        required
                                                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', color: '#10b981' }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Dropdown / Accordion for Schedule & Landmarks */}
                                            <div style={{ marginBottom: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fafbfc' }}>
                                                <div
                                                    onClick={() => setShowRouteTimingDropdown(!showRouteTimingDropdown)}
                                                    style={{
                                                        padding: '0.45rem 0.75rem',
                                                        background: showRouteTimingDropdown ? '#eff6ff' : '#f8fafc',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        userSelect: 'none',
                                                        borderBottom: showRouteTimingDropdown ? '1px solid #bfdbfe' : 'none'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem' }}>
                                                        <Clock size={13} color="#0284c7" />
                                                        <span style={{ fontWeight: '700', color: '#1e293b' }}>
                                                            ⚙️ Route Landmarks & Schedule Timings
                                                        </span>
                                                        {!showRouteTimingDropdown && (
                                                            <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: '0.25rem' }}>
                                                                ({routeFormData.startPoint || 'Start'} ➔ {routeFormData.endPoint || 'Campus'} | ⏰ {routeFormData.morningDepartureTime || '06:45 AM'} / {routeFormData.afternoonDepartureTime || '01:45 PM'})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                        {showRouteTimingDropdown ? '▲ Hide Details' : '▼ Expand / Edit'}
                                                    </span>
                                                </div>

                                                {showRouteTimingDropdown && (
                                                    <div style={{ padding: '0.65rem 0.75rem', background: 'white', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Start Landmark:</label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. Main Station / Liberty Market"
                                                                value={routeFormData.startPoint}
                                                                onChange={(e) => setRouteFormData({ ...routeFormData, startPoint: e.target.value })}
                                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Destination Campus:</label>
                                                            <input
                                                                type="text"
                                                                value={routeFormData.endPoint}
                                                                onChange={(e) => setRouteFormData({ ...routeFormData, endPoint: e.target.value })}
                                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Morning Start Time:</label>
                                                            <input
                                                                type="text"
                                                                placeholder="06:45 AM"
                                                                value={routeFormData.morningDepartureTime}
                                                                onChange={(e) => setRouteFormData({ ...routeFormData, morningDepartureTime: e.target.value })}
                                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Afternoon Return Time:</label>
                                                            <input
                                                                type="text"
                                                                placeholder="01:45 PM"
                                                                value={routeFormData.afternoonDepartureTime}
                                                                onChange={(e) => setRouteFormData({ ...routeFormData, afternoonDepartureTime: e.target.value })}
                                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Route Stops Sequence Section */}
                                            <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', marginBottom: '0.85rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                        <MapPin size={16} color="#0284c7" />
                                                        <label style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0f172a' }}>
                                                            📍 Route Stops Sequence ({(routeFormData.stops || []).length} stops)
                                                        </label>
                                                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800' }}>
                                                            {(routeFormData.stops || []).length} stops configured
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleAddStopToForm}
                                                        className="btn hover-lift"
                                                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '700', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                    >
                                                        <Plus size={14} /> Add Next Stop
                                                    </button>
                                                </div>

                                                {/* Column Headings */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '42px 2.2fr 1.1fr 1.1fr 1fr 34px', gap: '0.45rem', padding: '0.35rem 0.5rem', background: '#f1f5f9', borderRadius: '6px', marginBottom: '0.45rem', fontSize: '0.68rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                    <span># Seq</span>
                                                    <span>Pickup Landmark Name</span>
                                                    <span>🌅 Morning</span>
                                                    <span>🌇 Return</span>
                                                    <span>💵 Fare</span>
                                                    <span style={{ textAlign: 'center' }}>Del</span>
                                                </div>

                                                {/* Spacious Scrollable Stops Sequence Area */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '340px', minHeight: '200px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                                                    {(routeFormData.stops || []).length === 0 ? (
                                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                                            <MapPin size={28} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
                                                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', fontWeight: '600' }}>No stops added to this route yet.</p>
                                                            <button
                                                                type="button"
                                                                onClick={handleAddStopToForm}
                                                                style={{ background: '#0284c7', color: 'white', border: 'none', padding: '0.4rem 0.85rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '700', cursor: 'pointer' }}
                                                            >
                                                                + Add First Pickup Stop
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        (routeFormData.stops || []).map((stop, idx) => (
                                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '42px 2.2fr 1.1fr 1.1fr 1fr 34px', gap: '0.45rem', alignItems: 'center', background: '#fafbfc', padding: '0.45rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', transition: 'all 0.15s ease' }}>
                                                                <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0284c7', padding: '0.25rem 0.4rem', background: '#e0f2fe', borderRadius: '5px', textAlign: 'center' }}>
                                                                    #{idx + 1}
                                                                </span>
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. Model Town Park Gate 2"
                                                                    value={stop.stopName}
                                                                    onChange={(e) => handleUpdateStopField(idx, 'stopName', e.target.value)}
                                                                    required
                                                                    style={{ padding: '0.45rem 0.6rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: 'white' }}
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="07:15 AM"
                                                                    value={stop.morningTime}
                                                                    onChange={(e) => handleUpdateStopField(idx, 'morningTime', e.target.value)}
                                                                    style={{ padding: '0.45rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem', background: 'white' }}
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="02:00 PM"
                                                                    value={stop.afternoonTime}
                                                                    onChange={(e) => handleUpdateStopField(idx, 'afternoonTime', e.target.value)}
                                                                    style={{ padding: '0.45rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem', background: 'white' }}
                                                                />
                                                                <input
                                                                    type="number"
                                                                    placeholder="Fare"
                                                                    value={stop.fare}
                                                                    onChange={(e) => handleUpdateStopField(idx, 'fare', Number(e.target.value))}
                                                                    style={{ padding: '0.45rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', color: '#10b981', background: 'white' }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveStopFromForm(idx)}
                                                                    title="Delete Stop"
                                                                    style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.45rem', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setVehicleModalTab('vehicle')}
                                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: '700', fontSize: '0.78rem' }}
                                                >
                                                    ← Vehicle Profile
                                                </button>
                                                <button
                                                    type="submit"
                                                    className="btn hover-lift"
                                                    style={{ flex: 1.5, background: '#0284c7', color: 'white', padding: '0.65rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.78rem', justifyContent: 'center' }}
                                                >
                                                    ✓ Save Route
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setVehicleModalTab('allocations')}
                                                    className="btn hover-lift"
                                                    style={{ flex: 1.5, background: '#16a34a', color: 'white', border: 'none', padding: '0.65rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                                >
                                                    🎓 Allocate Students ➔
                                                </button>
                                            </div>
                                        </form>
                                    </div>

                                    {/* ========================================================================= */}
                                    {/* SLIDE 3: 🎓 DIRECT STUDENT SEAT ALLOCATION */}
                                    {/* ========================================================================= */}
                                    <div style={{ width: '33.333333%', paddingLeft: '0.6rem', boxSizing: 'border-box' }}>
                                        {/* Top Header with Capacity Gauge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #86efac', padding: '0.6rem 0.9rem', borderRadius: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <GraduationCap size={20} color="#15803d" />
                                                <div>
                                                    <strong style={{ fontSize: '0.84rem', color: '#14532d', display: 'block' }}>
                                                        Student Seat Allocation · {vehicleFormData.regNo || 'Van'}
                                                    </strong>
                                                    <span style={{ fontSize: '0.72rem', color: '#15803d' }}>
                                                        {editingRoute ? `Route: ${editingRoute.title}` : 'Direct student van enrolment'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#15803d' }}>
                                                        {targetVehAllocations.length} / {targetVehCapacity} Seats
                                                    </span>
                                                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#166534', fontWeight: '600' }}>
                                                        {targetVehVacant} Available
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setVehicleModalTab('route')}
                                                    style={{ background: 'white', border: '1px solid #86efac', padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                >
                                                    ← Route Stops
                                                </button>
                                            </div>
                                        </div>

                                        {/* Capacity Progress Bar */}
                                        <div style={{ width: '100%', background: '#e2e8f0', borderRadius: '9999px', height: '6px', marginBottom: '0.85rem', overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.min(100, (targetVehAllocations.length / targetVehCapacity) * 100)}%`, height: '100%', background: targetVehAllocations.length >= targetVehCapacity ? '#ef4444' : 'linear-gradient(90deg, #10b981 0%, #059669 100%)', transition: 'width 0.3s ease' }} />
                                        </div>

                                        {/* Quick Student Allocation Form Card */}
                                        <form onSubmit={handleAddSlideAllocation} style={{ background: '#fafbfc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.85rem' }}>
                                            <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span>➕</span> Allocate New Student Seat to {vehicleFormData.regNo || 'this Van'}:
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1.6fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                                                {/* 1. Class */}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>1. Select Class:</label>
                                                    <select
                                                        value={slideAllocClassId}
                                                        onChange={(e) => {
                                                            setSlideAllocClassId(e.target.value);
                                                            setSlideAllocStudentId('');
                                                        }}
                                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', background: 'white' }}
                                                    >
                                                        <option value="">-- Choose Class --</option>
                                                        {classesList.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name || c.className}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* 2. Student */}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>
                                                        2. Select Student {isLoadingSlideStudents ? '(Loading...)' : `(${slideAllocStudentsList.length})`}:
                                                    </label>
                                                    <select
                                                        value={slideAllocStudentId}
                                                        onChange={(e) => setSlideAllocStudentId(e.target.value)}
                                                        disabled={!slideAllocClassId || isLoadingSlideStudents}
                                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', background: 'white' }}
                                                    >
                                                        <option value="">-- Choose Student --</option>
                                                        {slideAllocStudentsList.map(st => {
                                                            const isAlloc = allocations.some(a => a.studentId === st.id);
                                                            return (
                                                                <option key={st.id} value={st.id}>
                                                                    {st.name || st.studentName} (Roll: {st.rollNo || st.rollNumber || '—'}) {isAlloc ? '✓ [Allocated]' : ''}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                </div>

                                                {/* 3. Pickup Stop */}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>3. Pickup Stop:</label>
                                                    <select
                                                        value={slideAllocStopName}
                                                        onChange={(e) => {
                                                            const chosen = e.target.value;
                                                            setSlideAllocStopName(chosen);
                                                            const matchedStop = (routeFormData.stops || []).find(s => s.stopName === chosen) || (editingRoute?.stops || []).find(s => s.stopName === chosen);
                                                            if (matchedStop && matchedStop.fare) {
                                                                setSlideAllocMonthlyFare(Number(matchedStop.fare));
                                                            }
                                                        }}
                                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', background: 'white' }}
                                                    >
                                                        <option value="">-- Select Route Stop --</option>
                                                        {(routeFormData.stops || []).filter(s => s.stopName).map((s, idx) => (
                                                            <option key={idx} value={s.stopName}>
                                                                📍 {s.stopName} ({s.morningTime || '07:00 AM'} · PKR {s.fare || routeFormData.monthlyBaseFare || 2500})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* 4. Fare */}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>4. Fare (PKR):</label>
                                                    <input
                                                        type="number"
                                                        value={slideAllocMonthlyFare}
                                                        onChange={(e) => setSlideAllocMonthlyFare(Number(e.target.value))}
                                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', fontWeight: '700', color: '#10b981', background: 'white' }}
                                                    />
                                                </div>

                                                {/* 5. Button */}
                                                <div>
                                                    <button
                                                        type="submit"
                                                        className="btn hover-lift"
                                                        style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: 'white', border: 'none', padding: '0.48rem 0.85rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                    >
                                                        <Plus size={14} /> Assign Seat
                                                    </button>
                                                </div>
                                            </div>
                                        </form>

                                        {/* Allocated Students Table Roster */}
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: 'white', marginBottom: '0.75rem' }}>
                                            <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#1e293b' }}>
                                                    📋 Enrolled Students in {vehicleFormData.regNo || 'this Van'} ({targetVehAllocations.length})
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                    Total Monthly Revenue: <strong style={{ color: '#10b981' }}>PKR {targetVehAllocations.reduce((sum, a) => sum + (Number(a.monthlyFare) || 0), 0).toLocaleString()}</strong>
                                                </span>
                                            </div>

                                            <div style={{ maxHeight: '280px', minHeight: '160px', overflowY: 'auto' }}>
                                                {targetVehAllocations.length === 0 ? (
                                                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                                        <GraduationCap size={32} color="#cbd5e1" style={{ marginBottom: '0.4rem' }} />
                                                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: '600', color: '#64748b' }}>
                                                            No students currently allocated to this vehicle.
                                                        </p>
                                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                            Use the allocation form above to assign students to pickup stops.
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                                                        <thead>
                                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                                                                <th style={{ padding: '0.45rem 0.6rem' }}>#</th>
                                                                <th style={{ padding: '0.45rem 0.6rem' }}>Student Name</th>
                                                                <th style={{ padding: '0.45rem 0.6rem' }}>Class</th>
                                                                <th style={{ padding: '0.45rem 0.6rem' }}>Pickup Stop</th>
                                                                <th style={{ padding: '0.45rem 0.6rem' }}>Monthly Fare</th>
                                                                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {targetVehAllocations.map((alloc, idx) => (
                                                                <tr key={alloc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                    <td style={{ padding: '0.45rem 0.6rem', fontWeight: '700', color: '#64748b' }}>
                                                                        {idx + 1}
                                                                    </td>
                                                                    <td style={{ padding: '0.45rem 0.6rem', fontWeight: '700', color: '#0f172a' }}>
                                                                        {alloc.studentName}
                                                                        <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b' }}>
                                                                            Father: {alloc.fatherName || '—'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ padding: '0.45rem 0.6rem', color: '#475569' }}>
                                                                        {alloc.className} {alloc.section ? `(${alloc.section})` : ''}
                                                                    </td>
                                                                    <td style={{ padding: '0.45rem 0.6rem', color: '#0284c7', fontWeight: '700' }}>
                                                                        📍 {alloc.pickupStop || alloc.stopName}
                                                                    </td>
                                                                    <td style={{ padding: '0.45rem 0.6rem', fontWeight: '800', color: '#10b981' }}>
                                                                        PKR {Number(alloc.monthlyFare || 2500).toLocaleString()}
                                                                    </td>
                                                                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                                                                            {alloc.parentPhone && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => sendBoardingAlertWhatsApp(alloc, 'boarded')}
                                                                                    title="WhatsApp Parent"
                                                                                    style={{ background: '#dcfce7', color: '#15803d', border: 'none', padding: '0.25rem 0.45rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                                                                                >
                                                                                    <MessageSquare size={12} />
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteSlideAllocation(alloc.id, alloc.studentName)}
                                                                                title="Remove from Seat"
                                                                                style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '0.25rem 0.45rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        </div>

                                        {/* Footer Navigation Bar */}
                                        <div style={{ display: 'flex', gap: '0.65rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setVehicleModalTab('route')}
                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: '700', fontSize: '0.78rem' }}
                                            >
                                                ← Back to Route Stops
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setVehicleModalTab('vehicle')}
                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: '700', fontSize: '0.78rem' }}
                                            >
                                                🚐 Vehicle Profile
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setVehicleModalOpen(false)}
                                                className="btn"
                                                style={{ flex: 1.5, background: '#10b981', color: 'white', padding: '0.6rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', justifyContent: 'center' }}
                                            >
                                                ✓ Done & Close
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

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
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '850px', padding: '1.5rem', maxHeight: '92vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    {editingRoute ? 'Edit Transport Route & Stops' : 'Create New Route'}
                                </h3>
                                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Configure route title, vehicle, timings and stop sequence</span>
                            </div>
                            <button onClick={() => setRouteModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveRoute}>
                            {/* Compact Top Info */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Route Title *:</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Route #3: Shadman -> Gulberg -> Campus"
                                        value={routeFormData.title}
                                        onChange={(e) => setRouteFormData({ ...routeFormData, title: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Assigned Van / Bus:</label>
                                    <select
                                        value={routeFormData.vehicleId}
                                        onChange={(e) => setRouteFormData({ ...routeFormData, vehicleId: e.target.value })}
                                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                    >
                                        <option value="">-- Select Vehicle --</option>
                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNo} ({v.type})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Base Fare (PKR):</label>
                                    <input
                                        type="number"
                                        value={routeFormData.monthlyBaseFare}
                                        onChange={(e) => setRouteFormData({ ...routeFormData, monthlyBaseFare: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', color: '#10b981' }}
                                    />
                                </div>
                            </div>

                            {/* Dropdown / Accordion for Schedule & Landmarks */}
                            <div style={{ marginBottom: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fafbfc' }}>
                                <div 
                                    onClick={() => setShowRouteTimingDropdown(!showRouteTimingDropdown)}
                                    style={{
                                        padding: '0.45rem 0.75rem',
                                        background: showRouteTimingDropdown ? '#eff6ff' : '#f8fafc',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        userSelect: 'none',
                                        borderBottom: showRouteTimingDropdown ? '1px solid #bfdbfe' : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem' }}>
                                        <Clock size={13} color="#0284c7" />
                                        <span style={{ fontWeight: '700', color: '#1e293b' }}>
                                            ⚙️ Route Landmarks & Schedule Timings
                                        </span>
                                        {!showRouteTimingDropdown && (
                                            <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: '0.25rem' }}>
                                                ({routeFormData.startPoint || 'Start'} ➔ {routeFormData.endPoint || 'Campus'} | ⏰ {routeFormData.morningDepartureTime || '06:45 AM'} / {routeFormData.afternoonDepartureTime || '01:45 PM'})
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                        {showRouteTimingDropdown ? '▲ Hide Details' : '▼ Expand / Edit'}
                                    </span>
                                </div>

                                {showRouteTimingDropdown && (
                                    <div style={{ padding: '0.65rem 0.75rem', background: 'white', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Start Landmark:</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Main Station / Liberty Market"
                                                value={routeFormData.startPoint}
                                                onChange={(e) => setRouteFormData({ ...routeFormData, startPoint: e.target.value })}
                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Destination Campus:</label>
                                            <input
                                                type="text"
                                                value={routeFormData.endPoint}
                                                onChange={(e) => setRouteFormData({ ...routeFormData, endPoint: e.target.value })}
                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Morning Start Time:</label>
                                            <input
                                                type="text"
                                                placeholder="06:45 AM"
                                                value={routeFormData.morningDepartureTime}
                                                onChange={(e) => setRouteFormData({ ...routeFormData, morningDepartureTime: e.target.value })}
                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>Afternoon Return Time:</label>
                                            <input
                                                type="text"
                                                placeholder="01:45 PM"
                                                value={routeFormData.afternoonDepartureTime}
                                                onChange={(e) => setRouteFormData({ ...routeFormData, afternoonDepartureTime: e.target.value })}
                                                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Enlarged Stops Sequence Manager */}
                            <div style={{ background: '#ffffff', padding: '0.85rem', borderRadius: '12px', border: '1.5px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>
                                            📍 Route Stops Sequence
                                        </span>
                                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800' }}>
                                            {(routeFormData.stops || []).length} stops configured
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddStopToForm}
                                        className="btn hover-lift"
                                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '700', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                    >
                                        <Plus size={14} /> Add Next Stop
                                    </button>
                                </div>

                                {/* Column Headings */}
                                <div style={{ display: 'grid', gridTemplateColumns: '42px 2.2fr 1.1fr 1.1fr 1fr 34px', gap: '0.45rem', padding: '0.35rem 0.5rem', background: '#f1f5f9', borderRadius: '6px', marginBottom: '0.45rem', fontSize: '0.68rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    <span># Seq</span>
                                    <span>Pickup Landmark Name</span>
                                    <span>🌅 Morning</span>
                                    <span>🌇 Return</span>
                                    <span>💵 Fare</span>
                                    <span style={{ textAlign: 'center' }}>Del</span>
                                </div>

                                {/* Spacious Scrollable Stops Sequence Area */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '380px', minHeight: '220px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                                    {(routeFormData.stops || []).length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                            <MapPin size={28} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
                                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', fontWeight: '600' }}>No stops added to this route yet.</p>
                                            <button
                                                type="button"
                                                onClick={handleAddStopToForm}
                                                style={{ background: '#0284c7', color: 'white', border: 'none', padding: '0.4rem 0.85rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '700', cursor: 'pointer' }}
                                            >
                                                + Add First Pickup Stop
                                            </button>
                                        </div>
                                    ) : (
                                        (routeFormData.stops || []).map((stop, idx) => (
                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '42px 2.2fr 1.1fr 1.1fr 1fr 34px', gap: '0.45rem', alignItems: 'center', background: '#fafbfc', padding: '0.45rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', transition: 'all 0.15s ease' }}>
                                                <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0284c7', padding: '0.25rem 0.4rem', background: '#e0f2fe', borderRadius: '5px', textAlign: 'center' }}>
                                                    #{idx + 1}
                                                </span>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Model Town Park Gate 2"
                                                    value={stop.stopName}
                                                    onChange={(e) => handleUpdateStopField(idx, 'stopName', e.target.value)}
                                                    required
                                                    style={{ padding: '0.45rem 0.6rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: 'white' }}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="07:15 AM"
                                                    value={stop.morningTime}
                                                    onChange={(e) => handleUpdateStopField(idx, 'morningTime', e.target.value)}
                                                    style={{ padding: '0.45rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem', background: 'white' }}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="02:00 PM"
                                                    value={stop.afternoonTime}
                                                    onChange={(e) => handleUpdateStopField(idx, 'afternoonTime', e.target.value)}
                                                    style={{ padding: '0.45rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.78rem', background: 'white' }}
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Fare"
                                                    value={stop.fare}
                                                    onChange={(e) => handleUpdateStopField(idx, 'fare', Number(e.target.value))}
                                                    style={{ padding: '0.45rem 0.5rem', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', color: '#10b981', background: 'white' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveStopFromForm(idx)}
                                                    title="Delete Stop"
                                                    style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.45rem', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setRouteModalOpen(false)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: '600' }}
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
                            <div>
                                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Users color="#10b981" size={20} /> {editingAllocation ? 'Edit Transport Allocation' : 'Allocate Student to Transport'}
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    Assign route, pickup stop, or enter custom manual pickup point
                                </span>
                            </div>
                            <button onClick={() => setAllocationModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                                    disabled={!!editingAllocation}
                                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: editingAllocation ? '#f8fafc' : 'white' }}
                                >
                                    {classesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            {/* Student Picker */}
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>2. Pick Student:</label>
                                    {editingAllocation && (
                                        <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: '700' }}>
                                            Editing: {editingAllocation.studentName}
                                        </span>
                                    )}
                                </div>
                                {!editingAllocation ? (
                                    <>
                                        <div style={{ marginBottom: '0.4rem' }}>
                                            <input
                                                type="text"
                                                placeholder="🔍 Search student by name, roll no, father name..."
                                                value={allocStudentSearch}
                                                onChange={(e) => setAllocStudentSearch(e.target.value)}
                                                style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                        <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            {classStudents
                                                .filter(st => {
                                                    if (!allocStudentSearch.trim()) return true;
                                                    const q = allocStudentSearch.toLowerCase().trim();
                                                    return (
                                                        (st.name || '').toLowerCase().includes(q) ||
                                                        (st.fatherName || '').toLowerCase().includes(q) ||
                                                        (st.rollNumber || st.rollNo || '').toString().toLowerCase().includes(q)
                                                    );
                                                })
                                                .map(st => {
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
                                                                alignItems: 'center',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                        >
                                                            <div>
                                                                <strong style={{ fontSize: '0.82rem', color: isSel ? '#047857' : '#0f172a' }}>{st.name}</strong>
                                                                <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                                                                    Father: {st.fatherName || 'N/A'} · Roll #{st.rollNumber || st.rollNo || 'N/A'}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                                                {st.transportEnrolled && (
                                                                    <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: '700' }}>
                                                                        Enrolled
                                                                    </span>
                                                                )}
                                                                {isSel && (
                                                                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '800' }}>
                                                                        ✓ Selected
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                            {classStudents.length === 0 && (
                                                <p style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                                                    No students found in this class.
                                                </p>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '0.65rem 0.85rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <strong style={{ fontSize: '0.88rem', color: '#15803d' }}>{allocSelectedStudent?.name}</strong>
                                            <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b' }}>
                                                Father: {allocSelectedStudent?.fatherName || 'N/A'} · Roll #{allocSelectedStudent?.rollNo || 'N/A'}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', background: '#dcfce7', color: '#166534', fontWeight: '700' }}>
                                            Enrolled
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Route & Stop Selection */}
                            <div style={{ marginBottom: '1rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>3. Assigned Route:</label>
                                        <select
                                            value={allocRouteId}
                                            onChange={(e) => handleRouteChangeInAlloc(e.target.value)}
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '600' }}
                                        >
                                            {routes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>
                                                4. Pickup Location Mode:
                                            </label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setIsCustomStop(false)}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.45rem 0.5rem',
                                                    borderRadius: '6px',
                                                    border: !isCustomStop ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                    background: !isCustomStop ? '#e0f2fe' : 'white',
                                                    color: !isCustomStop ? '#0369a1' : '#64748b',
                                                    fontSize: '0.74rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                📍 Route Stops
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsCustomStop(true);
                                                    if (!customStopName) setCustomStopName(allocStopName || '');
                                                }}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.45rem 0.5rem',
                                                    borderRadius: '6px',
                                                    border: isCustomStop ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                    background: isCustomStop ? '#e0f2fe' : 'white',
                                                    color: isCustomStop ? '#0369a1' : '#64748b',
                                                    fontSize: '0.74rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ✏️ Manual / Custom
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Pickup Stop Section based on Mode */}
                                {!isCustomStop ? (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0f172a' }}>
                                                Select Pickup Stop from Route:
                                            </label>
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsQuickAddingStop(!isQuickAddingStop)}
                                                    style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}
                                                >
                                                    {isQuickAddingStop ? '✕ Close Form' : '+ Add New Stop to Route'}
                                                </button>
                                                {allocStopName && (routes.find(r => r.id === allocRouteId)?.stops || []).length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleQuickRemoveStopFromCurrentRoute(allocStopName)}
                                                        title="Remove this stop from route"
                                                        style={{ background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer' }}
                                                    >
                                                        🗑️ Delete Stop
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <select
                                            value={allocStopName}
                                            onChange={(e) => handleStopChangeInAlloc(e.target.value)}
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                        >
                                            {(routes.find(r => r.id === allocRouteId)?.stops || []).map((s, idx) => (
                                                <option key={idx} value={s.stopName}>{idx + 1}. {s.stopName} (PKR {s.fare})</option>
                                            ))}
                                        </select>

                                        {/* Quick Add Stop to Route Inline Form */}
                                        {isQuickAddingStop && (
                                            <div style={{ marginTop: '0.65rem', background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1.5px dashed #0284c7' }}>
                                                <span style={{ display: 'block', fontSize: '0.76rem', fontWeight: '800', color: '#0284c7', marginBottom: '0.45rem' }}>
                                                    ➕ Add New Stop to Selected Route
                                                </span>
                                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Stop Landmark (e.g. Model Town Park)"
                                                        value={quickStopData.stopName}
                                                        onChange={(e) => setQuickStopData({ ...quickStopData, stopName: e.target.value })}
                                                        style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Pick (07:15 AM)"
                                                        value={quickStopData.morningTime}
                                                        onChange={(e) => setQuickStopData({ ...quickStopData, morningTime: e.target.value })}
                                                        style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                                                    />
                                                    <input
                                                        type="number"
                                                        placeholder="Fare"
                                                        value={quickStopData.fare}
                                                        onChange={(e) => setQuickStopData({ ...quickStopData, fare: e.target.value })}
                                                        style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: '700', color: '#10b981' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsQuickAddingStop(false)}
                                                        style={{ padding: '0.35rem 0.65rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.75rem', cursor: 'pointer' }}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleQuickAddStopToCurrentRoute}
                                                        style={{ padding: '0.35rem 0.85rem', borderRadius: '4px', border: 'none', background: '#0284c7', color: 'white', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                                                    >
                                                        ✓ Save & Select Stop
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.25rem' }}>
                                            ✏️ Type Exact Manual Pickup Location / House Address:
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. House #45, Street 12, Cavalry Ground or Near Alfatah Store"
                                            value={customStopName}
                                            onChange={(e) => setCustomStopName(e.target.value)}
                                            required={isCustomStop}
                                            style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1.5px solid #0284c7', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.4rem' }}
                                        />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#475569', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={saveCustomStopToRoute}
                                                onChange={(e) => setSaveCustomStopToRoute(e.target.checked)}
                                            />
                                            <span>Also add this stop to Route sequence for all students in future</span>
                                        </label>
                                    </div>
                                )}
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
                                    {isSavingAllocation ? (
                                        <>
                                            <RefreshCw size={15} className="animate-spin" /> Saving Allocation...
                                        </>
                                    ) : (
                                        editingAllocation ? '✓ Update Allocation' : '✓ Confirm Transport Seat'
                                    )}
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
