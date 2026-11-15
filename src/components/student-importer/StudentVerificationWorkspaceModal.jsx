import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X, ZoomIn, ZoomOut, RotateCw, RefreshCw, CheckCircle2, AlertTriangle,
    ShieldCheck, ArrowRight, CornerDownLeft, Sparkles, Lock, Save,
    Maximize2, HelpCircle, Layers, ChevronRight, AlertCircle,
    FileSpreadsheet, Minimize2, PanelLeftClose, PanelLeft, Plus,
    Trash2, Eye, ShieldAlert, Check, Download, Users, Phone, Calendar
} from 'lucide-react';

/**
 * 60 FPS Memoized Student Row to prevent table-wide re-renders during high-speed typing.
 */
const StudentGridRow = React.memo(({
    student,
    index,
    visibleColumns,
    isActive,
    isDuplicate,
    onRowFocus,
    onFieldChange,
    onKeyDownNav,
    onDeleteRow,
    inputRefs
}) => {
    const {
        rollNo, fullName, fatherName, phone, cnic, gender, dob, admissionNo, section, lowConfidence
    } = student;

    const isRollMissing = !rollNo || String(rollNo).trim() === '';
    const isNameMissing = !fullName || String(fullName).trim() === '';
    const isClean = !isRollMissing && !isNameMissing && !isDuplicate && !lowConfidence;

    return (
        <tr
            className={`transition-colors duration-150 border-b ${
                isDuplicate
                    ? 'bg-rose-50/80 hover:bg-rose-100/70 border-rose-300'
                    : lowConfidence
                    ? 'bg-amber-50/80 hover:bg-amber-100/70 border-amber-300'
                    : isClean
                    ? 'bg-emerald-50/50 hover:bg-emerald-100/60 border-emerald-200'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
            } ${isActive ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
            onClick={() => onRowFocus(index)}
        >
            {/* Status & Row # */}
            <td className="px-2.5 py-2 text-center text-xs font-mono font-bold text-slate-500 border-r border-slate-200 whitespace-nowrap">
                <div className="flex items-center justify-center gap-1.5">
                    {isDuplicate ? (
                        <span title="Duplicate student in class" className="p-0.5 rounded bg-rose-100 text-rose-700">
                            <ShieldAlert size={13} />
                        </span>
                    ) : lowConfidence ? (
                        <span title="AI flagged low confidence - Please verify with register" className="p-0.5 rounded bg-amber-100 text-amber-700">
                            <AlertTriangle size={13} />
                        </span>
                    ) : isClean ? (
                        <span title="Verified" className="p-0.5 rounded bg-emerald-100 text-emerald-700">
                            <CheckCircle2 size={13} />
                        </span>
                    ) : (
                        <span className="text-slate-400">{index + 1}</span>
                    )}
                    <span>{index + 1}</span>
                </div>
            </td>

            {/* Roll No */}
            <td className="px-1.5 py-1.5 text-center border-r border-slate-200">
                <input
                    ref={(el) => {
                        if (!inputRefs.current[index]) inputRefs.current[index] = {};
                        inputRefs.current[index]['rollNo'] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    value={rollNo}
                    onFocus={(e) => {
                        onRowFocus(index);
                        e.target.select();
                    }}
                    onChange={(e) => onFieldChange(index, 'rollNo', e.target.value)}
                    onKeyDown={(e) => onKeyDownNav(e, index, 'rollNo')}
                    className={`w-14 text-center py-1 px-1 text-xs font-mono font-bold rounded border transition-all ${
                        isRollMissing || isDuplicate
                            ? 'bg-rose-100 border-rose-500 text-rose-900 ring-2 ring-rose-400'
                            : lowConfidence
                            ? 'bg-amber-100/90 border-amber-500 text-amber-950 ring-2 ring-amber-400'
                            : 'bg-white border-slate-300 text-slate-900 focus:bg-indigo-50 focus:border-indigo-500'
                    }`}
                    placeholder="Roll"
                    title={lowConfidence ? "Kat-pit / Unclear in register - Please verify" : isRollMissing ? "Roll number missing!" : "Roll Number"}
                />
            </td>

            {/* Student Full Name */}
            <td className="px-1.5 py-1.5 border-r border-slate-200">
                <input
                    ref={(el) => {
                        if (!inputRefs.current[index]) inputRefs.current[index] = {};
                        inputRefs.current[index]['fullName'] = el;
                    }}
                    type="text"
                    value={fullName}
                    onFocus={(e) => {
                        onRowFocus(index);
                    }}
                    onChange={(e) => onFieldChange(index, 'fullName', e.target.value)}
                    onKeyDown={(e) => onKeyDownNav(e, index, 'fullName')}
                    className={`w-full py-1 px-2 text-xs font-semibold rounded border transition-all ${
                        isNameMissing
                            ? 'bg-rose-100 border-rose-500 text-rose-900 ring-2 ring-rose-400'
                            : lowConfidence
                            ? 'bg-amber-100/90 border-amber-500 text-amber-950 ring-2 ring-amber-400'
                            : 'bg-white border-slate-300 text-slate-900 focus:bg-indigo-50 focus:border-indigo-500'
                    }`}
                    placeholder="Student Name"
                    title={lowConfidence ? "Kat-pit / Unclear in register - Please verify" : isNameMissing ? "Student name missing!" : "Student Name"}
                />
            </td>

            {/* Father's Name */}
            <td className="px-1.5 py-1.5 border-r border-slate-200">
                <input
                    ref={(el) => {
                        if (!inputRefs.current[index]) inputRefs.current[index] = {};
                        inputRefs.current[index]['fatherName'] = el;
                    }}
                    type="text"
                    value={fatherName}
                    onFocus={(e) => {
                        onRowFocus(index);
                    }}
                    onChange={(e) => onFieldChange(index, 'fatherName', e.target.value)}
                    onKeyDown={(e) => onKeyDownNav(e, index, 'fatherName')}
                    className="w-full py-1 px-2 text-xs font-medium rounded border border-slate-300 bg-white text-slate-900 focus:bg-indigo-50 focus:border-indigo-500 transition-all"
                    placeholder="Father Name"
                />
            </td>

            {/* Mobile / Phone (Optional Column) */}
            {visibleColumns.phone && (
                <td className="px-1.5 py-1.5 border-r border-slate-200">
                    <input
                        ref={(el) => {
                            if (!inputRefs.current[index]) inputRefs.current[index] = {};
                            inputRefs.current[index]['phone'] = el;
                        }}
                        type="text"
                        value={phone}
                        onFocus={(e) => onRowFocus(index)}
                        onChange={(e) => onFieldChange(index, 'phone', e.target.value)}
                        onKeyDown={(e) => onKeyDownNav(e, index, 'phone')}
                        className="w-28 py-1 px-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 focus:bg-indigo-50 focus:border-indigo-500 transition-all text-center"
                        placeholder="03001234567"
                    />
                </td>
            )}

            {/* B-Form / CNIC (Optional Column) */}
            {visibleColumns.cnic && (
                <td className="px-1.5 py-1.5 border-r border-slate-200">
                    <input
                        ref={(el) => {
                            if (!inputRefs.current[index]) inputRefs.current[index] = {};
                            inputRefs.current[index]['cnic'] = el;
                        }}
                        type="text"
                        value={cnic}
                        onFocus={(e) => onRowFocus(index)}
                        onChange={(e) => onFieldChange(index, 'cnic', e.target.value)}
                        onKeyDown={(e) => onKeyDownNav(e, index, 'cnic')}
                        className="w-32 py-1 px-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 focus:bg-indigo-50 focus:border-indigo-500 transition-all text-center"
                        placeholder="35201-..."
                    />
                </td>
            )}

            {/* Gender (Optional Column) */}
            {visibleColumns.gender && (
                <td className="px-1.5 py-1.5 border-r border-slate-200 text-center">
                    <select
                        value={gender || 'Male'}
                        onChange={(e) => onFieldChange(index, 'gender', e.target.value)}
                        className="py-1 px-1.5 text-xs font-semibold rounded border border-slate-300 bg-white text-slate-800 focus:bg-indigo-50"
                    >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </td>
            )}

            {/* Date of Birth (Optional Column) */}
            {visibleColumns.dob && (
                <td className="px-1.5 py-1.5 border-r border-slate-200">
                    <input
                        ref={(el) => {
                            if (!inputRefs.current[index]) inputRefs.current[index] = {};
                            inputRefs.current[index]['dob'] = el;
                        }}
                        type="text"
                        value={dob}
                        onFocus={(e) => onRowFocus(index)}
                        onChange={(e) => onFieldChange(index, 'dob', e.target.value)}
                        onKeyDown={(e) => onKeyDownNav(e, index, 'dob')}
                        className="w-24 py-1 px-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 focus:bg-indigo-50 focus:border-indigo-500 transition-all text-center"
                        placeholder="YYYY-MM-DD"
                    />
                </td>
            )}

            {/* Section (Optional Column) */}
            {visibleColumns.section && (
                <td className="px-1.5 py-1.5 border-r border-slate-200 text-center">
                    <input
                        type="text"
                        value={section}
                        onChange={(e) => onFieldChange(index, 'section', e.target.value)}
                        className="w-12 py-1 px-1 text-xs font-mono uppercase text-center rounded border border-slate-300 bg-white"
                        placeholder="Sec"
                    />
                </td>
            )}

            {/* Admission No (Optional Column) */}
            {visibleColumns.admissionNo && (
                <td className="px-1.5 py-1.5 border-r border-slate-200 text-center">
                    <input
                        type="text"
                        value={admissionNo}
                        onChange={(e) => onFieldChange(index, 'admissionNo', e.target.value)}
                        className="w-24 py-1 px-1.5 text-xs font-mono text-center rounded border border-slate-300 bg-white text-slate-700"
                        placeholder="Auto"
                    />
                </td>
            )}

            {/* Row Actions */}
            <td className="px-1.5 py-1.5 text-center">
                <button
                    type="button"
                    onClick={() => onDeleteRow(index)}
                    title="Delete row"
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                >
                    <Trash2 size={13} />
                </button>
            </td>
        </tr>
    );
});

export default function StudentVerificationWorkspaceModal({
    isOpen,
    onClose,
    imageQueue = [],
    initialRoster = [],
    classNameTitle = 'Target Class',
    classId = '',
    targetSection = '',
    existingStudentsInClass = [],
    startingAdmissionNo = 'ADM-001',
    onSaveToFirestore,
    isSavingFirestore = false
}) {
    if (!isOpen) return null;

    // 1. Grid Roster State
    const [roster, setRoster] = useState(() => {
        if (initialRoster && initialRoster.length > 0) return initialRoster;
        // Default 5 blank rows if empty
        return Array.from({ length: 5 }, (_, i) => ({
            tempId: `blank_${i + 1}`,
            rollNo: String(i + 1),
            fullName: '',
            fatherName: '',
            phone: '',
            cnic: '',
            gender: 'Male',
            dob: '',
            admissionNo: '',
            section: targetSection || 'A',
            lowConfidence: false,
            sourceImageIndex: 0
        }));
    });

    // 2. Active Focus & Row Locator
    const [activeRowIndex, setActiveRowIndex] = useState(0);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    // 3. Optional Columns Visibility State
    const [visibleColumns, setVisibleColumns] = useState({
        phone: true,
        cnic: true,
        gender: true,
        dob: false,
        section: false,
        admissionNo: false
    });

    // 4. Image Canvas Controls State
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isHighContrast, setIsHighContrast] = useState(false);
    const [isImagePaneCollapsed, setIsImagePaneCollapsed] = useState(false);

    // Input Refs for Fast Keyboard Navigation
    const inputRefs = useRef({});
    const imageContainerRef = useRef(null);

    // Synchronize active image index when row changes
    useEffect(() => {
        const activeItem = roster[activeRowIndex];
        if (activeItem && activeItem.sourceImageIndex !== undefined) {
            if (activeItem.sourceImageIndex < imageQueue.length) {
                setActiveImageIndex(activeItem.sourceImageIndex);
            }
        }
    }, [activeRowIndex, roster, imageQueue.length]);

    // Check Duplicates against Firestore class roster
    const duplicateMap = useMemo(() => {
        const dupes = new Set();
        const existingRolls = new Set(existingStudentsInClass.map(s => String(s.rollNo || s.rollNumber || '').trim().toLowerCase()));
        const existingNames = new Set(existingStudentsInClass.map(s => `${(s.name || s.fullName || '').trim().toLowerCase()}_${(s.fatherName || '').trim().toLowerCase()}`));

        // In-roster roll numbers to check internal duplicates
        const seenInRosterRolls = new Map();

        roster.forEach((st, idx) => {
            const roll = String(st.rollNo || '').trim().toLowerCase();
            const nameKey = `${(st.fullName || '').trim().toLowerCase()}_${(st.fatherName || '').trim().toLowerCase()}`;

            if (roll && existingRolls.has(roll)) {
                dupes.add(idx);
            } else if (nameKey !== '_' && existingNames.has(nameKey)) {
                dupes.add(idx);
            }

            // Check if two rows in the same table have identical roll number
            if (roll) {
                if (seenInRosterRolls.has(roll)) {
                    dupes.add(idx);
                    dupes.add(seenInRosterRolls.get(roll));
                } else {
                    seenInRosterRolls.set(roll, idx);
                }
            }
        });

        return dupes;
    }, [roster, existingStudentsInClass]);

    // Sequence Check (Continuity of roll numbers)
    const sequenceReport = useMemo(() => {
        const rollNums = roster
            .map(r => parseInt(r.rollNo, 10))
            .filter(n => !isNaN(n) && n > 0)
            .sort((a, b) => a - b);

        if (rollNums.length === 0) return { isPerfect: true, missing: [] };

        const missing = [];
        const min = rollNums[0];
        const max = rollNums[rollNums.length - 1];
        const rollSet = new Set(rollNums);

        for (let i = min; i <= max; i++) {
            if (!rollSet.has(i)) {
                missing.push(i);
            }
        }

        return {
            isPerfect: missing.length === 0,
            missing,
            range: `${min} to ${max}`
        };
    }, [roster]);

    // Unclear / Kat-pit / Low Confidence Count
    const unclearCount = useMemo(() => {
        return roster.filter(r => r.lowConfidence).length;
    }, [roster]);

    // Overall Visual Match & Health Scoreboard Statistics
    const healthStats = useMemo(() => {
        const total = roster.length;
        if (total === 0) return { total: 0, verified: 0, cuttings: 0, errors: 0, matchScore: 100 };

        let cuttings = 0;
        let errors = 0;
        let verified = 0;

        roster.forEach(r => {
            const isRollMissing = !r.rollNo || String(r.rollNo).trim() === '';
            const isNameMissing = !r.fullName || String(r.fullName).trim() === '';
            const isDup = duplicateMap.has(String(r.rollNo).trim()) || duplicateMap.has(String(r.fullName).trim().toLowerCase());

            if (isRollMissing || isNameMissing || isDup) {
                errors++;
            } else if (r.lowConfidence) {
                cuttings++;
            } else {
                verified++;
            }
        });

        const matchScore = Math.round((verified / total) * 100);

        return {
            total,
            verified,
            cuttings,
            errors,
            matchScore
        };
    }, [roster, duplicateMap]);

    // Handle Input Field Changes
    const handleFieldChange = useCallback((rowIndex, field, value) => {
        setRoster(prev => {
            const next = [...prev];
            next[rowIndex] = {
                ...next[rowIndex],
                [field]: value
            };
            // Clear low confidence on edit
            if (next[rowIndex].lowConfidence) {
                next[rowIndex].lowConfidence = false;
            }
            return next;
        });
    }, []);

    // Add New Row
    const handleAddRow = () => {
        const nextRoll = roster.length > 0
            ? (parseInt(roster[roster.length - 1].rollNo, 10) || roster.length) + 1
            : 1;

        setRoster(prev => [
            ...prev,
            {
                tempId: `st_manual_${Date.now()}`,
                rollNo: String(nextRoll),
                fullName: '',
                fatherName: '',
                phone: '',
                cnic: '',
                gender: 'Male',
                dob: '',
                admissionNo: '',
                section: targetSection || 'A',
                lowConfidence: false,
                sourceImageIndex: activeImageIndex
            }
        ]);
        setActiveRowIndex(roster.length);
    };

    // Delete Row
    const handleDeleteRow = (index) => {
        if (roster.length <= 1) {
            alert("At least 1 student row is required.");
            return;
        }
        setRoster(prev => prev.filter((_, i) => i !== index));
        if (activeRowIndex >= roster.length - 1) {
            setActiveRowIndex(Math.max(0, roster.length - 2));
        }
    };

    // Keyboard Navigation across Grid Cells
    const handleKeyDownNav = (e, rowIndex, field) => {
        const fieldSequence = ['rollNo', 'fullName', 'fatherName'];
        if (visibleColumns.phone) fieldSequence.push('phone');
        if (visibleColumns.cnic) fieldSequence.push('cnic');
        if (visibleColumns.dob) fieldSequence.push('dob');

        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (rowIndex < roster.length - 1) {
                setActiveRowIndex(rowIndex + 1);
                setTimeout(() => {
                    inputRefs.current[rowIndex + 1]?.[field]?.focus();
                    inputRefs.current[rowIndex + 1]?.[field]?.select?.();
                }, 10);
            } else if (e.key === 'Enter') {
                // If on last row and press enter, auto-add next row!
                handleAddRow();
                setTimeout(() => {
                    inputRefs.current[rowIndex + 1]?.['fullName']?.focus();
                }, 40);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (rowIndex > 0) {
                setActiveRowIndex(rowIndex - 1);
                setTimeout(() => {
                    inputRefs.current[rowIndex - 1]?.[field]?.focus();
                    inputRefs.current[rowIndex - 1]?.[field]?.select?.();
                }, 10);
            }
        }
    };

    // Canvas Pan & Zoom Handlers
    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPanOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => setIsDragging(false);

    const resetZoomAndPan = () => {
        setZoom(1);
        setRotation(0);
        setPanOffset({ x: 0, y: 0 });
    };

    // Export Clean CSV Backup
    const handleDownloadBackupCsv = () => {
        const headers = ['Roll No', 'Full Name', 'Father Name', 'Phone', 'CNIC / B-Form', 'Gender', 'DOB', 'Section', 'Admission No'];
        const rows = roster.map(r => [
            r.rollNo,
            `"${r.fullName}"`,
            `"${r.fatherName}"`,
            `"${r.phone}"`,
            `"${r.cnic}"`,
            r.gender,
            r.dob,
            r.section,
            r.admissionNo
        ]);

        const csvContent = headers.join(',') + '\n' + rows.map(e => e.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${classNameTitle.replace(/\s+/g, '_')}_Import_Backup.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Final Save Handler
    const handleSaveTrigger = () => {
        // Validation check
        const invalidRows = roster.filter(r => !r.fullName.trim() || !r.rollNo.trim());
        if (invalidRows.length > 0) {
            alert(`There are ${invalidRows.length} rows with empty Roll Number or Student Name. Please complete them before saving.`);
            return;
        }

        if (duplicateMap.size > 0) {
            const proceed = window.confirm(`Warning: ${duplicateMap.size} students are flagged as duplicates or already exist in this class. Are you sure you want to proceed?`);
            if (!proceed) return;
        }

        onSaveToFirestore(roster);
    };

    const activeImage = imageQueue[activeImageIndex] || imageQueue[0];

    return createPortal(
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 9999999
            }}
            className="bg-slate-900 flex flex-col font-sans select-none overflow-hidden m-0 p-0 animate-in fade-in duration-150 text-slate-100"
        >

                {/* Top Workspace Bar */}
                <div className="px-5 py-3.5 bg-slate-800/90 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-md">
                            <Users size={20} className="stroke-[2.5]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-white tracking-tight">Smart Student Register Workspace</h2>
                                <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                                    {classNameTitle}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400">
                                Side-by-Side Visual Verification &bull; {roster.length} Students Ready
                            </p>
                        </div>
                    </div>

                    {/* Stats & Sequence Indicator & Scoreboard */}
                    <div className="flex items-center gap-2">
                        {/* Overall Match % Gauge */}
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold transition-all shadow-sm ${
                            healthStats.matchScore === 100
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/30'
                                : healthStats.matchScore >= 80
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        }`}>
                            {healthStats.matchScore === 100 ? (
                                <CheckCircle2 size={15} className="text-emerald-400 stroke-[2.5]" />
                            ) : healthStats.errors > 0 ? (
                                <AlertCircle size={15} className="text-rose-400 animate-pulse" />
                            ) : (
                                <Sparkles size={15} className="text-amber-400" />
                            )}
                            <span>{healthStats.matchScore}% Match Score</span>
                        </div>

                        {/* Summary Count Breakdown Pills */}
                        <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-700/80 text-[11px] font-semibold">
                            <span className="flex items-center gap-1.5 text-emerald-400 px-1.5 py-0.5 rounded-lg bg-emerald-500/10" title="Clean verified rows ready to save">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                {healthStats.verified}/{healthStats.total} Verified
                            </span>

                            {healthStats.cuttings > 0 && (
                                <span className="flex items-center gap-1.5 text-amber-300 px-1.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 animate-pulse" title="Kat-pit / cuttings detected in register">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                    {healthStats.cuttings} Cuttings
                                </span>
                            )}

                            {healthStats.errors > 0 && (
                                <span className="flex items-center gap-1.5 text-rose-300 px-1.5 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/30 animate-pulse" title="Missing Name/Roll or Duplicate">
                                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                                    {healthStats.errors} Action Required
                                </span>
                            )}
                        </div>

                        {sequenceReport.isPerfect ? (
                            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold">
                                <CheckCircle2 size={14} />
                                <span>Sequence Continuous</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-semibold">
                                <AlertTriangle size={14} />
                                <span>Rolls Missing: {sequenceReport.missing.join(', ')}</span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-xl transition ml-2"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Split Screen Body */}
                <div className="flex-1 flex overflow-hidden">

                    {/* LEFT PANE: Register Image Viewer */}
                    {!isImagePaneCollapsed && (
                        <div className="w-1/2 flex flex-col bg-slate-950 border-r border-slate-800 relative">
                            {/* Viewer Controls */}
                            <div className="p-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 z-10">
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setZoom(z => Math.min(z + 0.25, 3.5))}
                                        title="Zoom In"
                                        className="p-1.5 hover:bg-slate-800 rounded transition"
                                    >
                                        <ZoomIn size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
                                        title="Zoom Out"
                                        className="p-1.5 hover:bg-slate-800 rounded transition"
                                    >
                                        <ZoomOut size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRotation(r => (r + 90) % 360)}
                                        title="Rotate 90°"
                                        className="p-1.5 hover:bg-slate-800 rounded transition"
                                    >
                                        <RotateCw size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetZoomAndPan}
                                        title="Reset View"
                                        className="p-1.5 hover:bg-slate-800 rounded transition"
                                    >
                                        <RefreshCw size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsHighContrast(!isHighContrast)}
                                        className={`px-2 py-1 text-[11px] font-semibold rounded border transition ml-1 ${
                                            isHighContrast
                                                ? 'bg-amber-400 text-slate-950 border-amber-400'
                                                : 'bg-slate-800 border-slate-700 text-slate-300'
                                        }`}
                                    >
                                        B&W Contrast
                                    </button>
                                </div>

                                {/* Multi-Page Switcher */}
                                {imageQueue.length > 1 && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] text-slate-400">Page:</span>
                                        {imageQueue.map((img, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setActiveImageIndex(idx)}
                                                className={`px-2 py-0.5 text-[11px] font-bold rounded transition ${
                                                    activeImageIndex === idx
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                            >
                                                {idx + 1}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setIsImagePaneCollapsed(true)}
                                    title="Collapse Image Pane (Full Width Table)"
                                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                                >
                                    <PanelLeftClose size={15} />
                                </button>
                            </div>

                            {/* Pannable Canvas Container */}
                            <div
                                ref={imageContainerRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing select-none relative bg-slate-950"
                            >
                                {activeImage ? (
                                    <div
                                        style={{
                                            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                                            transformOrigin: 'center center',
                                            transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                                        }}
                                        className="relative max-w-full max-h-full flex items-center justify-center"
                                    >
                                        <img
                                            src={activeImage.previewUrl || activeImage.base64}
                                            alt="Register Scan"
                                            className={`max-w-none shadow-2xl rounded-sm ${
                                                isHighContrast ? 'contrast-[1.6] grayscale brightness-95' : ''
                                            }`}
                                            style={{ maxHeight: '82vh' }}
                                            draggable={false}
                                        />
                                    </div>
                                ) : (
                                    <div className="text-center p-6 text-slate-500">
                                        <Users size={40} className="mx-auto mb-2 opacity-40" />
                                        <p className="text-xs">No Register Image Attached (Manual Offline Mode)</p>
                                    </div>
                                )}

                                {/* Overlay hint */}
                                <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-slate-900/80 backdrop-blur-md rounded-md border border-slate-800 text-[10px] text-slate-400 pointer-events-none">
                                    🔍 Drag to pan &bull; Scroll / Buttons to Zoom
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RIGHT PANE: Verification Table */}
                    <div className={`${isImagePaneCollapsed ? 'w-full' : 'w-1/2'} flex flex-col bg-slate-900 overflow-hidden`}>

                        {/* Top Table Config & Toggle Bar */}
                        <div className="p-3 bg-slate-800/80 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                                {isImagePaneCollapsed && (
                                    <button
                                        type="button"
                                        onClick={() => setIsImagePaneCollapsed(false)}
                                        title="Show Image Pane"
                                        className="p-1 hover:bg-slate-700 rounded text-slate-300"
                                    >
                                        <PanelLeft size={16} />
                                    </button>
                                )}
                                <span className="font-bold text-slate-300 text-xs">Columns:</span>
                                <div className="flex items-center gap-1">
                                    {[
                                        { key: 'phone', label: 'Phone' },
                                        { key: 'cnic', label: 'B-Form' },
                                        { key: 'gender', label: 'Gender' },
                                        { key: 'dob', label: 'DOB' },
                                        { key: 'section', label: 'Section' },
                                        { key: 'admissionNo', label: 'Adm No' }
                                    ].map(col => (
                                        <button
                                            key={col.key}
                                            type="button"
                                            onClick={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                                            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition ${
                                                visibleColumns[col.key]
                                                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                                                    : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-300'
                                            }`}
                                        >
                                            {col.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleAddRow}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                            >
                                <Plus size={14} />
                                <span>Add Student</span>
                            </button>
                        </div>

                        {/* High Performance Table Container */}
                        <div className="flex-1 overflow-auto bg-slate-100 text-slate-900">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-200 text-slate-700 sticky top-0 z-10 border-b border-slate-300 text-xs font-bold shadow-sm">
                                    <tr>
                                        <th className="px-2.5 py-2.5 text-center w-12 border-r border-slate-300">#</th>
                                        <th className="px-2 py-2.5 text-center w-16 border-r border-slate-300">Roll No</th>
                                        <th className="px-3 py-2.5 border-r border-slate-300">Student Full Name *</th>
                                        <th className="px-3 py-2.5 border-r border-slate-300">Father's Name *</th>
                                        {visibleColumns.phone && (
                                            <th className="px-2 py-2.5 text-center w-32 border-r border-slate-300">Phone</th>
                                        )}
                                        {visibleColumns.cnic && (
                                            <th className="px-2 py-2.5 text-center w-36 border-r border-slate-300">B-Form / CNIC</th>
                                        )}
                                        {visibleColumns.gender && (
                                            <th className="px-2 py-2.5 text-center w-20 border-r border-slate-300">Gender</th>
                                        )}
                                        {visibleColumns.dob && (
                                            <th className="px-2 py-2.5 text-center w-28 border-r border-slate-300">DOB</th>
                                        )}
                                        {visibleColumns.section && (
                                            <th className="px-2 py-2.5 text-center w-14 border-r border-slate-300">Sec</th>
                                        )}
                                        {visibleColumns.admissionNo && (
                                            <th className="px-2 py-2.5 text-center w-28 border-r border-slate-300">Adm No</th>
                                        )}
                                        <th className="px-2 py-2.5 text-center w-10">Del</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {roster.map((student, idx) => (
                                        <StudentGridRow
                                            key={student.tempId || idx}
                                            student={student}
                                            index={idx}
                                            visibleColumns={visibleColumns}
                                            isActive={activeRowIndex === idx}
                                            isDuplicate={duplicateMap.has(idx)}
                                            onRowFocus={setActiveRowIndex}
                                            onFieldChange={handleFieldChange}
                                            onKeyDownNav={handleKeyDownNav}
                                            onDeleteRow={handleDeleteRow}
                                            inputRefs={inputRefs}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Bottom Action Footer */}
                        <div className="p-3.5 bg-slate-800 border-t border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                            <div className="flex items-center gap-3 text-slate-400">
                                <span>💡 <b>Tip:</b> Press <kbd className="px-1.5 py-0.5 bg-slate-700 text-white rounded text-[10px]">Enter</kbd> to jump to next student row instantly.</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDownloadBackupCsv}
                                    className="px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-700/80 hover:bg-slate-700 rounded-xl transition flex items-center gap-1.5"
                                >
                                    <Download size={14} />
                                    <span>Download CSV Backup</span>
                                </button>

                                <button
                                    type="button"
                                    disabled={isSavingFirestore}
                                    onClick={handleSaveTrigger}
                                    className="px-5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                >
                                    {isSavingFirestore ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" />
                                            <span>Saving Students to Database...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save size={14} />
                                            <span>Save {roster.length} Students to {classNameTitle}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>

        </div>,
        document.body
    );
}
