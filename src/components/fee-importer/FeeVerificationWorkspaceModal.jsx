import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X, ZoomIn, ZoomOut, RotateCw, RefreshCw, CheckCircle2, AlertTriangle,
    ShieldCheck, ArrowRight, CornerDownLeft, Sparkles, Lock, Save,
    Maximize2, HelpCircle, Layers, ChevronRight, AlertCircle,
    FileSpreadsheet, Minimize2, PanelLeftClose, PanelLeft, Plus,
    Trash2, Eye, ShieldAlert, Check, Download, Users, DollarSign,
    CheckSquare, Square, Zap, Wifi, WifiOff
} from 'lucide-react';
import { formatPKR } from '../../utils/feePipeline';

/**
 * 60 FPS Memoized Fee Grid Row with Smart Verification & High-Speed Keyboard Navigation.
 */
const FeeGridRow = React.memo(({
    row,
    index,
    isActive,
    isSelected,
    onToggleSelect,
    onRowFocus,
    onFieldChange,
    onKeyDownNav,
    onVerifyRow,
    onDeleteRow,
    inputRefs
}) => {
    const {
        id, rollNo, studentName, monthlyFee, arrears, paidUpToStr, matchedStudent, lowConfidence, katPitReason
    } = row;

    const isMatched = Boolean(matchedStudent);
    const isClean = isMatched && !lowConfidence;

    return (
        <tr
            className={`transition-colors duration-150 border-b ${
                !isMatched
                    ? 'bg-rose-50/90 hover:bg-rose-100/80 border-rose-300'
                    : lowConfidence
                    ? 'bg-amber-50/90 hover:bg-amber-100/80 border-amber-300'
                    : isClean
                    ? 'bg-emerald-50/60 hover:bg-emerald-100/70 border-emerald-200'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
            } ${isActive ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
            onClick={() => onRowFocus(id)}
        >
            {/* Selection Checkbox */}
            <td className="px-2 py-2 text-center border-r border-slate-200">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelect(id);
                    }}
                    className="p-1 rounded hover:bg-slate-200/60 transition inline-flex items-center justify-center text-indigo-600"
                >
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} className="text-slate-400" />}
                </button>
            </td>

            {/* Status & Row # */}
            <td className="px-2.5 py-2 text-center text-xs font-mono font-bold text-slate-500 border-r border-slate-200 whitespace-nowrap">
                <div className="flex items-center justify-center gap-1.5">
                    {!isMatched ? (
                        <span title="Student not found in Class DB - Press Enter or Click Link to verify" className="p-0.5 rounded bg-rose-100 text-rose-700 animate-pulse">
                            <ShieldAlert size={14} />
                        </span>
                    ) : lowConfidence ? (
                        <span title={katPitReason || "Kat-Pit / Overwriting detected - Press Enter to approve"} className="p-0.5 rounded bg-amber-100 text-amber-700 animate-pulse">
                            <AlertTriangle size={14} />
                        </span>
                    ) : (
                        <span title="Verified & Linked" className="p-0.5 rounded bg-emerald-100 text-emerald-700">
                            <CheckCircle2 size={14} className="stroke-[2.5]" />
                        </span>
                    )}
                    <span>{index + 1}</span>
                </div>
            </td>

            {/* Roll No */}
            <td className="px-1.5 py-1.5 text-center border-r border-slate-200">
                <input
                    ref={(el) => {
                        if (!inputRefs.current[id]) inputRefs.current[id] = {};
                        inputRefs.current[id]['rollNo'] = el;
                    }}
                    type="text"
                    value={rollNo}
                    onFocus={(e) => {
                        onRowFocus(id);
                        e.target.select();
                    }}
                    onChange={(e) => onFieldChange(id, 'rollNo', e.target.value)}
                    onKeyDown={(e) => onKeyDownNav(e, id, 'rollNo')}
                    className={`w-14 text-center py-1 px-1 text-xs font-mono font-bold rounded border transition-all ${
                        !isMatched
                            ? 'bg-rose-100 border-rose-400 text-rose-900 ring-2 ring-rose-400'
                            : lowConfidence
                            ? 'bg-amber-100/90 border-amber-400 text-amber-950 ring-2 ring-amber-400'
                            : 'bg-white border-slate-300 text-slate-900 focus:bg-indigo-50 focus:border-indigo-500'
                    }`}
                    placeholder="Roll"
                />
            </td>

            {/* Student Name */}
            <td className="px-2 py-1.5 border-r border-slate-200">
                <div className="space-y-0.5">
                    <input
                        ref={(el) => {
                            if (!inputRefs.current[id]) inputRefs.current[id] = {};
                            inputRefs.current[id]['studentName'] = el;
                        }}
                        type="text"
                        value={studentName}
                        onFocus={() => onRowFocus(id)}
                        onChange={(e) => onFieldChange(id, 'studentName', e.target.value)}
                        onKeyDown={(e) => onKeyDownNav(e, id, 'studentName')}
                        className={`w-full py-1 px-2 text-xs font-semibold rounded border transition-all ${
                            !isMatched
                                ? 'bg-rose-100 border-rose-400 text-rose-900'
                                : 'bg-white border-slate-300 text-slate-900 focus:bg-indigo-50 focus:border-indigo-500'
                        }`}
                        placeholder="Student Name"
                    />
                    {matchedStudent ? (
                        <div className="text-[10px] font-medium text-emerald-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                            Linked: {matchedStudent.fullName || matchedStudent.name} (Roll #{matchedStudent.rollNo || '--'})
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onVerifyRow(id)}
                            className="text-[10px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-1.5 py-0.5 rounded border border-rose-300 flex items-center gap-1 transition"
                            title="Click to manually verify and link this student to class"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                            <span>Not found in DB</span>
                            <span className="underline font-black text-rose-800">(Click to Link & Turn Green)</span>
                        </button>
                    )}
                </div>
            </td>

            {/* Monthly Tuition Fee */}
            <td className="px-2 py-1.5 border-r border-slate-200">
                <div className="relative">
                    <span className="absolute left-2 top-1.5 text-[10px] font-bold text-slate-400">Rs</span>
                    <input
                        ref={(el) => {
                            if (!inputRefs.current[id]) inputRefs.current[id] = {};
                            inputRefs.current[id]['monthlyFee'] = el;
                        }}
                        type="number"
                        min="0"
                        step="50"
                        value={monthlyFee === 0 ? '' : monthlyFee}
                        onFocus={(e) => {
                            onRowFocus(id);
                            e.target.select();
                        }}
                        onChange={(e) => onFieldChange(id, 'monthlyFee', parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => onKeyDownNav(e, id, 'monthlyFee')}
                        className={`w-full pl-7 pr-2 py-1 text-xs font-mono font-black rounded border transition-all ${
                            lowConfidence
                                ? 'bg-amber-100 border-amber-500 text-amber-950 ring-2 ring-amber-400'
                                : 'bg-white border-slate-300 text-indigo-700 focus:bg-indigo-50 focus:border-indigo-500'
                        }`}
                        placeholder="0"
                        title={lowConfidence ? katPitReason || "Overwriting / Kat-pit detected in fee column" : "Monthly Tuition Fee in PKR"}
                    />
                </div>
                {lowConfidence && katPitReason && (
                    <div className="text-[9px] font-bold text-amber-800 truncate" title={katPitReason}>
                        ⚠ {katPitReason}
                    </div>
                )}
            </td>

            {/* Arrears / Baqaya */}
            <td className="px-2 py-1.5 border-r border-slate-200">
                <div className="relative">
                    <span className="absolute left-2 top-1.5 text-[10px] font-bold text-slate-400">Rs</span>
                    <input
                        ref={(el) => {
                            if (!inputRefs.current[id]) inputRefs.current[id] = {};
                            inputRefs.current[id]['arrears'] = el;
                        }}
                        type="number"
                        min="0"
                        step="50"
                        value={arrears === 0 ? '' : arrears}
                        onFocus={(e) => {
                            onRowFocus(id);
                            e.target.select();
                        }}
                        onChange={(e) => onFieldChange(id, 'arrears', parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => onKeyDownNav(e, id, 'arrears')}
                        className={`w-full pl-7 pr-2 py-1 text-xs font-mono font-bold rounded border transition-all ${
                            arrears > 0
                                ? 'bg-rose-50 border-rose-300 text-rose-800'
                                : 'bg-white border-slate-300 text-slate-700 focus:bg-indigo-50 focus:border-indigo-500'
                        }`}
                        placeholder="0"
                    />
                </div>
            </td>

            {/* Paid Up To Month */}
            <td className="px-2 py-1.5 border-r border-slate-200">
                <input
                    ref={(el) => {
                        if (!inputRefs.current[id]) inputRefs.current[id] = {};
                        inputRefs.current[id]['paidUpToStr'] = el;
                    }}
                    type="text"
                    value={paidUpToStr}
                    onFocus={() => onRowFocus(id)}
                    onChange={(e) => onFieldChange(id, 'paidUpToStr', e.target.value)}
                    onKeyDown={(e) => onKeyDownNav(e, id, 'paidUpToStr')}
                    className="w-full py-1 px-2 text-xs font-medium rounded border border-slate-300 bg-white text-slate-900 focus:bg-indigo-50 focus:border-indigo-500 transition-all"
                    placeholder="e.g. August 2026"
                />
            </td>

            {/* Actions: Verify & Delete */}
            <td className="px-2 py-1.5 text-center whitespace-nowrap">
                <div className="flex items-center justify-center gap-1">
                    {/* Quick Approve & Next Button */}
                    {(!isMatched || lowConfidence) ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onVerifyRow(id);
                            }}
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-lg transition"
                            title="Verify & Turn Green (Enter)"
                        >
                            <Check size={16} className="stroke-[2.5]" />
                        </button>
                    ) : (
                        <span className="p-1 text-emerald-500 opacity-60">
                            <CheckCircle2 size={16} />
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRow(id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        title="Remove row from migration"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </td>
        </tr>
    );
});

export default function FeeVerificationWorkspaceModal({
    isOpen,
    onClose,
    images = [],
    initialRows = [],
    existingStudents = [],
    selectedClassName = '',
    onApplyVerifiedRows,
    isSaving = false
}) {
    if (!isOpen) return null;

    const draftKey = `fee_workspace_draft_${selectedClassName || 'all'}`;
    const [hasSavedDraft, setHasSavedDraft] = useState(false);

    // Working rows state
    const [rows, setRows] = useState(() => initialRows);
    const [selectedRowIds, setSelectedRowIds] = useState(() => {
        return new Set(initialRows.filter(r => r.isMatched).map(r => r.id));
    });

    const [activeRowId, setActiveRowId] = useState(() => initialRows[0]?.id || '');
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'katpit', 'verified', 'unmatched'
    const [searchQuery, setSearchQuery] = useState('');
    const [isImagePaneOpen, setIsImagePaneOpen] = useState(true);

    // Image viewer state
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [panPos, setPanPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const inputRefs = useRef({});
    const imageContainerRef = useRef(null);

    // Check for existing saved offline draft
    useEffect(() => {
        try {
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
                const parsed = JSON.parse(rawDraft);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setHasSavedDraft(true);
                }
            }
        } catch (e) {}
    }, [draftKey]);

    // Sync if initialRows change
    useEffect(() => {
        setRows(initialRows);
        setSelectedRowIds(new Set(initialRows.filter(r => r.isMatched).map(r => r.id)));
        if (initialRows.length > 0 && !activeRowId) {
            setActiveRowId(initialRows[0].id);
        }
    }, [initialRows]);

    // ⚡ 100% Zero-Cost Local Storage Auto-Save Draft (Persists without internet)
    useEffect(() => {
        if (rows.length === 0) return;
        const timer = setTimeout(() => {
            try {
                localStorage.setItem(draftKey, JSON.stringify(rows));
            } catch (e) {}
        }, 400);
        return () => clearTimeout(timer);
    }, [rows, draftKey]);

    // Restore offline draft
    const handleRestoreDraft = () => {
        try {
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
                const parsed = JSON.parse(rawDraft);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setRows(parsed);
                    setSelectedRowIds(new Set(parsed.filter(r => r.isMatched).map(r => r.id)));
                    setHasSavedDraft(false);
                }
            }
        } catch (e) {}
    };

    // Active image
    const activeImage = images[currentImageIndex] || null;

    // Handle field change (Keyed by row.id for 100% filter/search safety)
    const handleFieldChange = useCallback((rowId, field, value) => {
        setRows(prev => {
            return prev.map(r => {
                if (r.id !== rowId) return r;

                const updated = { ...r, [field]: value };

                // Clear lowConfidence if fee, arrears, or roll number is edited
                if (field === 'monthlyFee' || field === 'arrears' || field === 'rollNo') {
                    updated.lowConfidence = false;
                    updated.katPitReason = '';
                }

                // If rollNo or studentName changed, search database to match
                if (field === 'rollNo' || field === 'studentName') {
                    const normRoll = String(updated.rollNo || '').trim().toLowerCase();
                    const normName = String(updated.studentName || '').trim().toLowerCase();

                    const matched = existingStudents.find(st => {
                        const stRoll = String(st.rollNo || st.rollNumber || '').trim().toLowerCase();
                        if (stRoll && normRoll && stRoll === normRoll) return true;
                        const stName = String(st.fullName || st.name || '').trim().toLowerCase();
                        if (!normRoll && stName && normName && stName === normName) return true;
                        return false;
                    });

                    if (matched) {
                        updated.matchedStudent = matched;
                        updated.isMatched = true;
                    }
                }

                return updated;
            });
        });
    }, [existingStudents]);

    // 🟢 Verify & Approve Row (Turns row GREEN immediately and ensures it is selected)
    const handleVerifyRow = useCallback((rowId) => {
        setRows(prev => {
            return prev.map(r => {
                if (r.id !== rowId) return r;

                let matched = r.matchedStudent;
                if (!matched) {
                    const normRoll = String(r.rollNo || '').trim().toLowerCase();
                    const normName = String(r.studentName || '').trim().toLowerCase();

                    matched = existingStudents.find(st => {
                        const stRoll = String(st.rollNo || st.rollNumber || '').trim().toLowerCase();
                        if (stRoll && normRoll && stRoll === normRoll) return true;
                        const stName = String(st.fullName || st.name || '').trim().toLowerCase();
                        if (stName && normName && stName === normName) return true;
                        return false;
                    });

                    // If not found in DB, auto-create verified class student structure
                    if (!matched) {
                        matched = {
                            id: (r.admissionNo && r.admissionNo !== '--') ? r.admissionNo : `st_${r.rollNo || Date.now()}`,
                            fullName: r.studentName,
                            name: r.studentName,
                            rollNo: r.rollNo,
                            className: selectedClassName || 'Class 5',
                            classId: 'cls_verified'
                        };
                    }
                }

                return {
                    ...r,
                    matchedStudent: matched,
                    isMatched: true,
                    lowConfidence: false,
                    katPitReason: ''
                };
            });
        });

        // Ensure row is checked for saving
        setSelectedRowIds(prev => new Set(prev).add(rowId));
    }, [existingStudents, selectedClassName]);

    // Filter rows
    const filteredRows = useMemo(() => {
        return rows.filter(r => {
            if (activeFilter === 'katpit' && !r.lowConfidence) return false;
            if (activeFilter === 'verified' && (!r.isMatched || r.lowConfidence)) return false;
            if (activeFilter === 'unmatched' && r.isMatched) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const mName = (r.studentName || '').toLowerCase().includes(q);
                const mRoll = String(r.rollNo || '').toLowerCase().includes(q);
                return mName || mRoll;
            }
            return true;
        });
    }, [rows, activeFilter, searchQuery]);

    // Delete row
    const handleDeleteRow = useCallback((rowId) => {
        setRows(prev => prev.filter(r => r.id !== rowId));
        setSelectedRowIds(s => {
            const nextS = new Set(s);
            nextS.delete(rowId);
            return nextS;
        });
    }, []);

    // Selection toggle
    const handleToggleSelect = useCallback((rowId) => {
        setSelectedRowIds(prev => {
            const next = new Set(prev);
            if (next.has(rowId)) next.delete(rowId);
            else next.add(rowId);
            return next;
        });
    }, []);

    // ⚡ Smart Keyboard Navigation: Enter verifies current row & jumps DIRECTLY to next pending issue!
    const handleKeyDownNav = useCallback((e, currentRowId, fieldName) => {
        if (e.key === 'Enter') {
            e.preventDefault();

            // 1. Immediately verify current row and turn it GREEN!
            handleVerifyRow(currentRowId);

            // 2. Find the NEXT pending issue (Yellow or Red row)
            const currentIdx = filteredRows.findIndex(r => r.id === currentRowId);

            // Look forward for next issue row
            let nextIssue = filteredRows.find((r, i) => i > currentIdx && (!r.isMatched || r.lowConfidence));

            // If not found forward, wrap around from beginning
            if (!nextIssue) {
                nextIssue = filteredRows.find((r, i) => i !== currentIdx && (!r.isMatched || r.lowConfidence));
            }

            if (nextIssue) {
                setActiveRowId(nextIssue.id);
                // Focus on next issue's field
                setTimeout(() => {
                    const targetEl = inputRefs.current[nextIssue.id]?.[fieldName] ||
                                     inputRefs.current[nextIssue.id]?.['monthlyFee'] ||
                                     inputRefs.current[nextIssue.id]?.['rollNo'];
                    if (targetEl) {
                        targetEl.focus();
                        targetEl.select();
                    }
                }, 40);
            } else {
                // If all issues resolved, jump to next sequential row
                const nextSeqRow = filteredRows[currentIdx + 1];
                if (nextSeqRow) {
                    setActiveRowId(nextSeqRow.id);
                    setTimeout(() => {
                        const targetEl = inputRefs.current[nextSeqRow.id]?.[fieldName];
                        if (targetEl) {
                            targetEl.focus();
                            targetEl.select();
                        }
                    }, 40);
                }
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const currentIdx = filteredRows.findIndex(r => r.id === currentRowId);
            const nextRow = filteredRows[currentIdx + 1];
            if (nextRow && inputRefs.current[nextRow.id]?.[fieldName]) {
                setActiveRowId(nextRow.id);
                inputRefs.current[nextRow.id][fieldName].focus();
                inputRefs.current[nextRow.id][fieldName].select();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIdx = filteredRows.findIndex(r => r.id === currentRowId);
            const prevRow = filteredRows[currentIdx - 1];
            if (prevRow && inputRefs.current[prevRow.id]?.[fieldName]) {
                setActiveRowId(prevRow.id);
                inputRefs.current[prevRow.id][fieldName].focus();
                inputRefs.current[prevRow.id][fieldName].select();
            }
        }
    }, [filteredRows, handleVerifyRow]);

    // Statistics
    const stats = useMemo(() => {
        const total = rows.length;
        const katPitCount = rows.filter(r => r.lowConfidence).length;
        const matchedCount = rows.filter(r => r.isMatched).length;
        const unmatchedCount = rows.filter(r => !r.isMatched).length;
        const selectedCount = selectedRowIds.size;
        const pendingIssues = katPitCount + unmatchedCount;
        const matchScore = total > 0 ? Math.round(((total - pendingIssues) / total) * 100) : 100;

        const totalTuition = rows
            .filter(r => selectedRowIds.has(r.id))
            .reduce((sum, r) => sum + (parseFloat(r.monthlyFee) || 0), 0);

        const totalArrears = rows
            .filter(r => selectedRowIds.has(r.id))
            .reduce((sum, r) => sum + (parseFloat(r.arrears) || 0), 0);

        return { total, katPitCount, matchedCount, unmatchedCount, pendingIssues, selectedCount, matchScore, totalTuition, totalArrears };
    }, [rows, selectedRowIds]);

    // Jump to next issue button handler
    const handleJumpToNextIssue = () => {
        const issue = rows.find(r => !r.isMatched || r.lowConfidence);
        if (issue) {
            setActiveRowId(issue.id);
            const targetEl = inputRefs.current[issue.id]?.['monthlyFee'] || inputRefs.current[issue.id]?.['rollNo'];
            if (targetEl) {
                targetEl.focus();
                targetEl.select();
            }
        }
    };

    // Zoom & Pan handlers
    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3.5));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
    const handleResetZoom = () => {
        setZoomLevel(1);
        setPanPos({ x: 0, y: 0 });
        setRotation(0);
    };
    const handleRotate = () => setRotation(prev => (prev + 90) % 360);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - panPos.x, y: e.clientY - panPos.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPanPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => setIsDragging(false);

    // Apply commit
    const handleCommit = () => {
        if (selectedRowIds.size === 0) {
            alert("Please select at least one row to migrate fees.");
            return;
        }

        // Kat-pit & Unmatched safety warning
        const unreviewed = rows.filter(r => selectedRowIds.has(r.id) && (!r.isMatched || r.lowConfidence));
        if (unreviewed.length > 0) {
            const proceed = window.confirm(
                `⚠ Alert: There are ${unreviewed.length} pending issue rows (Kat-Pit or Unmatched) that were not resolved.\n\nDo you want to proceed anyway?`
            );
            if (!proceed) return;
        }

        // Clean up draft on successful save
        try {
            localStorage.removeItem(draftKey);
        } catch (e) {}

        const selectedRows = rows.filter(r => selectedRowIds.has(r.id));
        onApplyVerifiedRows(selectedRows);
    };

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
            {/* Top Workspace Header Bar */}
            <div className="px-5 py-3.5 bg-slate-800/95 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                        <DollarSign size={20} className="stroke-[2.5]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-white tracking-tight">
                                Smart Fee Register Workspace
                            </h2>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                                {selectedClassName || 'Selected Class'}
                            </span>
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                <Zap size={11} className="fill-emerald-400" />
                                100% Offline Active & Auto-Saved
                            </span>
                        </div>
                        <p className="text-xs text-slate-400">
                            Side-by-Side Visual Verification &bull; {stats.total} Fee Records Ready
                        </p>
                    </div>
                </div>

                {/* Status Badges, Scoreboard & Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Draft Restore Button if available */}
                    {hasSavedDraft && (
                        <button
                            type="button"
                            onClick={handleRestoreDraft}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 hover:bg-indigo-500/30 transition flex items-center gap-1.5 animate-pulse"
                            title="Restore previous unsaved progress saved in browser memory"
                        >
                            <RefreshCw size={12} />
                            <span>Restore Saved Draft</span>
                        </button>
                    )}

                    {/* Overall Match % Gauge */}
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold transition-all shadow-sm ${
                        stats.pendingIssues === 0
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/30'
                            : stats.matchScore >= 70
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    }`}>
                        {stats.pendingIssues === 0 ? (
                            <CheckCircle2 size={15} className="text-emerald-400 stroke-[2.5]" />
                        ) : stats.unmatchedCount > 0 ? (
                            <AlertCircle size={15} className="text-rose-400 animate-pulse" />
                        ) : (
                            <Sparkles size={15} className="text-amber-400" />
                        )}
                        <span>{stats.matchScore}% Match Score</span>
                    </div>

                    {/* Summary Count Breakdown Pills */}
                    <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-700/80 text-[11px] font-semibold">
                        <span className="flex items-center gap-1.5 text-emerald-400 px-1.5 py-0.5 rounded-lg bg-emerald-500/10" title="Clean verified rows ready to save">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                            {stats.matchedCount - stats.katPitCount}/{stats.total} Verified
                        </span>

                        {stats.katPitCount > 0 && (
                            <span className="flex items-center gap-1.5 text-amber-300 px-1.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 animate-pulse" title="Kat-pit / cuttings detected in register">
                                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                {stats.katPitCount} Kat-Pit
                            </span>
                        )}

                        {stats.unmatchedCount > 0 && (
                            <span className="flex items-center gap-1.5 text-rose-300 px-1.5 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/30 animate-pulse" title="Not found in database">
                                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                                {stats.unmatchedCount} Not in DB
                            </span>
                        )}
                    </div>

                    {stats.pendingIssues > 0 && (
                        <button
                            type="button"
                            onClick={handleJumpToNextIssue}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition flex items-center gap-1"
                        >
                            <AlertTriangle size={13} />
                            <span>Jump to Next Issue ({stats.pendingIssues})</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setIsImagePaneOpen(prev => !prev)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-750 text-slate-200 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5 border border-slate-600"
                    >
                        {isImagePaneOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
                        <span>{isImagePaneOpen ? 'Hide Photo' : 'Show Photo'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-xl transition ml-1"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main Split Screen Body */}
            <div className="flex-1 flex overflow-hidden bg-slate-950">
                {/* Left Pane: Zoomable Image Viewer */}
                {isImagePaneOpen && (
                    <div className="w-1/2 flex flex-col border-r border-slate-800 bg-slate-950 relative overflow-hidden select-none">
                        {/* Image Controls Toolbar */}
                        <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-xl">
                            <button
                                type="button"
                                onClick={handleZoomIn}
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                                title="Zoom In"
                            >
                                <ZoomIn size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={handleZoomOut}
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                                title="Zoom Out"
                            >
                                <ZoomOut size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={handleRotate}
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                                title="Rotate 90°"
                            >
                                <RotateCw size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={handleResetZoom}
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition text-xs font-mono px-2"
                                title="Reset Zoom"
                            >
                                {Math.round(zoomLevel * 100)}%
                            </button>
                        </div>

                        {/* Multi-image tab strip if multiple pages */}
                        {images.length > 1 && (
                            <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-xl">
                                {images.map((img, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setCurrentImageIndex(idx)}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                                            currentImageIndex === idx
                                                ? 'bg-indigo-600 text-white shadow'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }`}
                                    >
                                        Page {idx + 1}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Interactive Canvas / Image Display */}
                        <div
                            ref={imageContainerRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden"
                        >
                            {activeImage ? (
                                <img
                                    src={activeImage.previewUrl || activeImage.base64 || activeImage}
                                    alt="Register Page"
                                    style={{
                                        transform: `translate(${panPos.x}px, ${panPos.y}px) scale(${zoomLevel}) rotate(${rotation}deg)`,
                                        transformOrigin: 'center center',
                                        transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                                    }}
                                    className="max-w-none max-h-none pointer-events-none select-none rounded shadow-2xl"
                                />
                            ) : (
                                <div className="text-slate-500 text-xs font-medium flex flex-col items-center gap-2">
                                    <Eye size={24} className="text-slate-600" />
                                    <span>No image preview available</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Right Pane: High-Speed Editable Data Grid */}
                <div className={`${isImagePaneOpen ? 'w-1/2' : 'w-full'} flex flex-col bg-white overflow-hidden text-slate-900`}>
                    {/* Filter Strip & Search */}
                    <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => setActiveFilter('all')}
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                                    activeFilter === 'all'
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                All ({stats.total})
                            </button>
                            {stats.katPitCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setActiveFilter('katpit')}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                                        activeFilter === 'katpit'
                                            ? 'bg-amber-500 text-white shadow-sm'
                                            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                                    }`}
                                >
                                    <AlertTriangle size={12} />
                                    <span>Kat-Pit ({stats.katPitCount})</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setActiveFilter('verified')}
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                                    activeFilter === 'verified'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-white text-emerald-700 border border-slate-200 hover:bg-emerald-50'
                                }`}
                            >
                                <CheckCircle2 size={12} />
                                <span>Verified ({stats.matchedCount - stats.katPitCount})</span>
                            </button>
                            {stats.unmatchedCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setActiveFilter('unmatched')}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                                        activeFilter === 'unmatched'
                                            ? 'bg-rose-600 text-white shadow-sm'
                                            : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                                    }`}
                                >
                                    <ShieldAlert size={12} />
                                    <span>Unmatched ({stats.unmatchedCount})</span>
                                </button>
                            )}
                        </div>

                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Filter by name or roll..."
                                className="pl-2.5 pr-2 py-1 text-xs rounded-lg border border-slate-300 bg-white w-48 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Editable Table */}
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 shadow-sm text-slate-700">
                                <tr>
                                    <th className="w-10 px-2 py-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (selectedRowIds.size === filteredRows.length) {
                                                    setSelectedRowIds(new Set());
                                                } else {
                                                    setSelectedRowIds(new Set(filteredRows.map(r => r.id)));
                                                }
                                            }}
                                            className="p-0.5 rounded text-indigo-600"
                                        >
                                            {selectedRowIds.size === filteredRows.length && filteredRows.length > 0 ? (
                                                <CheckSquare size={15} />
                                            ) : (
                                                <Square size={15} className="text-slate-400" />
                                            )}
                                        </button>
                                    </th>
                                    <th className="w-12 px-2 py-2 text-center font-bold">#</th>
                                    <th className="w-16 px-2 py-2 text-center font-bold">Roll</th>
                                    <th className="px-3 py-2 font-bold">Student Name & DB Match</th>
                                    <th className="w-32 px-3 py-2 font-bold text-indigo-700">Monthly Fee</th>
                                    <th className="w-32 px-3 py-2 font-bold text-rose-700">Arrears / Baqaya</th>
                                    <th className="w-36 px-3 py-2 font-bold">Paid Up To</th>
                                    <th className="w-16 px-2 py-2 text-center font-bold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, idx) => (
                                    <FeeGridRow
                                        key={row.id}
                                        row={row}
                                        index={idx}
                                        isActive={activeRowId === row.id}
                                        isSelected={selectedRowIds.has(row.id)}
                                        onToggleSelect={handleToggleSelect}
                                        onRowFocus={setActiveRowId}
                                        onFieldChange={handleFieldChange}
                                        onKeyDownNav={handleKeyDownNav}
                                        onVerifyRow={handleVerifyRow}
                                        onDeleteRow={handleDeleteRow}
                                        inputRefs={inputRefs}
                                    />
                                ))}
                                {filteredRows.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                                            No fee records match your filter criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Bottom Action Footer & KPI Strip */}
                    <div className="p-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 shrink-0">
                        {/* KPI Volume */}
                        <div className="flex items-center gap-5 text-xs">
                            <div>
                                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Selected</span>
                                <span className="font-mono font-bold text-white text-sm">
                                    {stats.selectedCount} / {stats.total}
                                </span>
                            </div>
                            <div className="border-l border-slate-800 pl-4">
                                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Total Monthly Fee</span>
                                <span className="font-mono font-bold text-indigo-400 text-sm">
                                    {formatPKR(stats.totalTuition)}
                                </span>
                            </div>
                            <div className="border-l border-slate-800 pl-4">
                                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Total Arrears (Baqaya)</span>
                                <span className="font-mono font-bold text-rose-400 text-sm">
                                    {formatPKR(stats.totalArrears)}
                                </span>
                            </div>
                        </div>

                        {/* Navigation Helper Hint & Buttons */}
                        <div className="flex items-center gap-3">
                            <span className="hidden xl:inline text-[11px] text-slate-400">
                                💡 Tip: Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-emerald-300 rounded font-mono font-bold text-[10px]">Enter</kbd> to verify & jump to next issue instantly!
                            </span>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-850 text-slate-300 hover:bg-slate-700 hover:text-white transition border border-slate-700"
                            >
                                Close Workspace
                            </button>
                            <button
                                type="button"
                                onClick={handleCommit}
                                disabled={isSaving || stats.selectedCount === 0}
                                className="px-5 py-2 text-xs font-black rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-900/30 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Check size={16} />
                                <span>Apply Fee Migration ({stats.selectedCount})</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
