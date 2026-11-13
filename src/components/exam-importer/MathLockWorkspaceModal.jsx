import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X, ZoomIn, ZoomOut, RotateCw, RefreshCw, CheckCircle2, AlertTriangle,
    ShieldCheck, ArrowRight, CornerDownLeft, Sparkles, Lock, Save,
    Maximize2, HelpCircle, Layers, ChevronRight, AlertCircle
} from 'lucide-react';

/**
 * High-Performance Memoized Student Row for 60FPS typing without table-wide re-renders.
 */
const StudentGridRow = React.memo(({
    student,
    index,
    subjects,
    isActive,
    onRowFocus,
    onMarkChange,
    onRegisterTotalChange,
    onKeyDownNav,
    onTeacherMathOverride,
    onClearLowConfidence,
    inputRefs
}) => {
    const { rollNo, name, marks, systemTotal, registerGrandTotal, lowConfidenceSubjects = [] } = student;

    // Row Math-Lock status calculation
    let isOverMax = false;
    let hasInvalid = false;

    subjects.forEach(sub => {
        const val = marks[sub.subjectId];
        if (val === undefined || val === null || isNaN(val)) {
            hasInvalid = true;
        } else if (val > sub.maxMarks) {
            isOverMax = true;
        }
    });

    const isMathMatched = Number(systemTotal) === Number(registerGrandTotal);
    const hasLowConfidence = lowConfidenceSubjects.length > 0;
    const isGreen = isMathMatched && !isOverMax && !hasInvalid && !hasLowConfidence;
    const diff = Number(systemTotal) - Number(registerGrandTotal);

    return (
        <tr
            className={`transition-colors duration-150 border-b ${
                isGreen
                    ? 'bg-emerald-50/70 hover:bg-emerald-100/60 border-emerald-200'
                    : 'bg-rose-50/70 hover:bg-rose-100/60 border-rose-300'
            } ${isActive ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
            onClick={() => onRowFocus(index)}
        >
            {/* Roll No */}
            <td className="px-3 py-2 text-center font-mono font-bold text-sm text-slate-800 border-r border-slate-200">
                {rollNo}
            </td>

            {/* Student Name */}
            <td className="px-3 py-2 text-xs font-semibold text-slate-700 max-w-[150px] truncate border-r border-slate-200">
                <span title={name}>{name}</span>
            </td>

            {/* Dynamic Subject Inputs */}
            {subjects.map((sub, sIdx) => {
                const markVal = marks[sub.subjectId] ?? '';
                const isCellLowConf = lowConfidenceSubjects.includes(sub.subjectId);
                const isCellOverMax = Number(markVal) > sub.maxMarks;
                const isAbsent = Number(markVal) === -1;

                return (
                    <td key={sub.subjectId} className="px-1.5 py-1.5 text-center border-r border-slate-200">
                        <div className="relative">
                            <input
                                ref={(el) => {
                                    if (!inputRefs.current[index]) inputRefs.current[index] = {};
                                    inputRefs.current[index][sub.subjectId] = el;
                                }}
                                type="text"
                                inputMode="numeric"
                                value={isAbsent ? 'ABS' : markVal}
                                onFocus={(e) => {
                                    onRowFocus(index);
                                    e.target.select();
                                }}
                                onChange={(e) => onMarkChange(index, sub.subjectId, e.target.value)}
                                onKeyDown={(e) => onKeyDownNav(e, index, sIdx, sub.subjectId)}
                                className={`w-14 text-center py-1 px-1 text-xs font-mono font-bold rounded border transition-all ${
                                    isCellOverMax
                                        ? 'bg-rose-200 border-rose-500 text-rose-900 ring-2 ring-rose-400'
                                        : isCellLowConf
                                        ? 'bg-amber-100 border-amber-400 text-amber-900 ring-1 ring-amber-400'
                                        : isAbsent
                                        ? 'bg-slate-200 border-slate-400 text-slate-600 font-sans'
                                        : 'bg-white border-slate-300 text-slate-900 focus:bg-indigo-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                                }`}
                            />
                            {isCellLowConf && (
                                <span
                                    title="AI flagged overwriting / kat-pit. Verify against photo."
                                    className="absolute -top-1 -right-1 flex h-2.5 w-2.5"
                                >
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                </span>
                            )}
                        </div>
                    </td>
                );
            })}

            {/* System Total (Auto-Calculated) */}
            <td className="px-2 py-2 text-center font-mono font-bold text-xs text-slate-700 bg-slate-100/50 border-r border-slate-200">
                {systemTotal}
            </td>

            {/* Register Grand Total (Editable from Broadsheet) */}
            <td className="px-2 py-1.5 text-center border-r border-slate-200">
                <input
                    ref={(el) => {
                        if (!inputRefs.current[index]) inputRefs.current[index] = {};
                        inputRefs.current[index]['__regTotal'] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    value={registerGrandTotal ?? ''}
                    onFocus={(e) => {
                        onRowFocus(index);
                        e.target.select();
                    }}
                    onChange={(e) => onRegisterTotalChange(index, e.target.value)}
                    onKeyDown={(e) => onKeyDownNav(e, index, subjects.length, '__regTotal')}
                    className="w-16 text-center py-1 px-1 text-xs font-mono font-bold rounded border bg-white border-slate-300 text-slate-900 focus:bg-indigo-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
            </td>

            {/* Math-Lock Verification Status Badge */}
            <td className="px-2 py-2 text-center text-xs">
                {isGreen ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-sm">
                        <CheckCircle2 size={12} /> OK
                    </span>
                ) : (
                    <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white shadow-sm">
                            {isOverMax ? 'Over Max' : diff !== 0 ? `Diff: ${diff > 0 ? `+${diff}` : diff}` : 'Kat-Pit'}
                        </span>
                        {diff !== 0 && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTeacherMathOverride(index);
                                }}
                                className="text-[10px] bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 font-bold px-2 py-0.5 rounded cursor-pointer transition flex items-center gap-1 shadow-xs"
                                title="Click or press Ctrl+M to set register total to system sum"
                            >
                                <span>Fix Total (Ctrl+M)</span>
                            </button>
                        )}
                        {hasLowConfidence && diff === 0 && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    lowConfidenceSubjects.forEach(sId => onClearLowConfidence(index, sId));
                                }}
                                className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 font-bold px-2 py-0.5 rounded cursor-pointer transition shadow-xs"
                                title="Click to verify & approve overwritten marks"
                            >
                                Approve Kat-Pit
                            </button>
                        )}
                    </div>
                )}
            </td>
        </tr>
    );
});

export default function MathLockWorkspaceModal({
    isOpen,
    onClose,
    classDetails,
    examTitle,
    subjects,
    processedImages, // Array of { base64, previewUrl, label }
    initialRoster,   // Merged students array
    onSaveVerifiedResults,
    isSaving
}) {
    if (!isOpen) return null;

    // Master state of all student rows
    const [roster, setRoster] = useState(initialRoster);
    const [activeRowIndex, setActiveRowIndex] = useState(0);

    // Image Viewer Transform States
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);
    const [selectedImageIdx, setSelectedImageIdx] = useState(0);

    // 2-Key Navigation Matrix of Input Elements
    const inputRefs = useRef({});

    // Auto-Switch Image when operator moves to student of a different image part
    useEffect(() => {
        const student = roster[activeRowIndex];
        if (student && student.sourceImageIndex !== undefined && student.sourceImageIndex !== selectedImageIdx) {
            if (processedImages[student.sourceImageIndex]) {
                setSelectedImageIdx(student.sourceImageIndex);
            }
        }
    }, [activeRowIndex, roster, processedImages, selectedImageIdx]);

    // Lock body scroll while workspace modal is open
    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    // Recalculate summary stats
    const { greenCount, redCount, nextRedIndex } = useMemo(() => {
        let green = 0;
        let red = 0;
        let firstRed = -1;

        roster.forEach((st, idx) => {
            let isOverMax = false;
            let hasInvalid = false;
            subjects.forEach(sub => {
                const val = st.marks[sub.subjectId];
                if (val === undefined || val === null || isNaN(val)) hasInvalid = true;
                else if (val > sub.maxMarks) isOverMax = true;
            });
            const isMathMatched = Number(st.systemTotal) === Number(st.registerGrandTotal);
            const hasLowConf = (st.lowConfidenceSubjects || []).length > 0;

            if (isMathMatched && !isOverMax && !hasInvalid && !hasLowConf) {
                green++;
            } else {
                red++;
                if (firstRed === -1 && idx > activeRowIndex) {
                    firstRed = idx;
                }
            }
        });

        // Wrap around search for red if none after active
        if (firstRed === -1 && red > 0) {
            firstRed = roster.findIndex(st => {
                let isOverMax = false;
                let hasInvalid = false;
                subjects.forEach(sub => {
                    const val = st.marks[sub.subjectId];
                    if (val === undefined || val === null || isNaN(val)) hasInvalid = true;
                    else if (val > sub.maxMarks) isOverMax = true;
                });
                return !(Number(st.systemTotal) === Number(st.registerGrandTotal) && !isOverMax && !hasInvalid && (st.lowConfidenceSubjects || []).length === 0);
            });
        }

        return { greenCount: green, redCount: red, nextRedIndex: firstRed };
    }, [roster, subjects, activeRowIndex]);

    // Handler: Update subject mark
    const handleMarkChange = useCallback((studentIdx, subjectId, rawVal) => {
        setRoster(prev => {
            const next = [...prev];
            const student = { ...next[studentIdx], marks: { ...next[studentIdx].marks } };

            let parsed = rawVal.trim().toUpperCase() === 'ABS' ? -1 : parseFloat(rawVal);
            if (rawVal === '') parsed = 0;
            if (isNaN(parsed)) parsed = 0;

            student.marks[subjectId] = parsed;

            // Clear lowConfidence flag for this cell once edited by human
            if (student.lowConfidenceSubjects?.includes(subjectId)) {
                student.lowConfidenceSubjects = student.lowConfidenceSubjects.filter(s => s !== subjectId);
            }

            // Recalculate system sum
            student.systemTotal = Object.values(student.marks).reduce((sum, v) => sum + (v > 0 ? Number(v) : 0), 0);
            next[studentIdx] = student;
            return next;
        });
    }, []);

    // Handler: Update Register Total
    const handleRegisterTotalChange = useCallback((studentIdx, rawVal) => {
        setRoster(prev => {
            const next = [...prev];
            const student = { ...next[studentIdx] };
            let parsed = parseFloat(rawVal);
            if (rawVal === '') parsed = 0;
            if (isNaN(parsed)) parsed = 0;
            student.registerGrandTotal = parsed;
            next[studentIdx] = student;
            return next;
        });
    }, []);

    // Quick jump to a specific cell and select text
    const focusCell = useCallback((rowIdx, cellKey) => {
        if (rowIdx < 0 || rowIdx >= roster.length) return;
        setActiveRowIndex(rowIdx);
        setTimeout(() => {
            const el = inputRefs.current[rowIdx]?.[cellKey];
            if (el) {
                el.focus();
                el.select();
            }
        }, 30);
    }, [roster.length]);

    // Teacher Error Override Shortcut: Ctrl + M (or Cmd + M)
    const handleTeacherMathOverride = useCallback((rowIdx) => {
        setRoster(prev => {
            const next = [...prev];
            const student = { ...next[rowIdx] };
            student.registerGrandTotal = student.systemTotal;
            student.lowConfidenceSubjects = [];
            next[rowIdx] = student;
            return next;
        });
    }, []);

    // Clear low-confidence / Kat-pit flag for a cell
    const handleClearLowConfidence = useCallback((rowIdx, subjectId) => {
        setRoster(prev => {
            const next = [...prev];
            const student = { ...next[rowIdx] };
            student.lowConfidenceSubjects = (student.lowConfidenceSubjects || []).filter(s => s !== subjectId);
            next[rowIdx] = student;
            return next;
        });
    }, []);

    // Auto-focus first Red cell upon opening the modal
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => {
            const firstRedIdx = roster.findIndex(st => {
                let isOverMax = false;
                let hasInvalid = false;
                subjects.forEach(sub => {
                    const val = st.marks[sub.subjectId];
                    if (val === undefined || val === null || isNaN(val)) hasInvalid = true;
                    else if (val > sub.maxMarks) isOverMax = true;
                });
                return !(Number(st.systemTotal) === Number(st.registerGrandTotal) && !isOverMax && !hasInvalid && (st.lowConfidenceSubjects || []).length === 0);
            });
            const targetRow = firstRedIdx !== -1 ? firstRedIdx : 0;
            const targetSub = subjects[0]?.subjectId;
            if (targetSub) {
                focusCell(targetRow, targetSub);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [isOpen]);

    // Global Keydown Listener so shortcuts work even if focus is outside an input
    useEffect(() => {
        if (!isOpen) return;
        const handleGlobalKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                handleTeacherMathOverride(activeRowIndex);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (redCount === 0) onSaveVerifiedResults(roster);
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (nextRedIndex !== -1) {
                    focusCell(nextRedIndex, subjects[0]?.subjectId);
                } else if (redCount === 0) {
                    document.getElementById('lock-save-btn')?.focus();
                }
                return;
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isOpen, activeRowIndex, nextRedIndex, redCount, subjects, focusCell, handleTeacherMathOverride, onSaveVerifiedResults, roster]);

    // 2-Key Rapid Navigation KeyDown Listener
    const handleKeyDownNav = useCallback((e, rowIdx, colIdx, cellKey) => {
        // 1. Teacher Math Override: Ctrl + M
        if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
            e.preventDefault();
            handleTeacherMathOverride(rowIdx);
            return;
        }

        // 2. Lock & Save Shortcut: Ctrl + Enter
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (redCount === 0) {
                onSaveVerifiedResults(roster);
            }
            return;
        }

        // 3. ENTER Key: The Magic Jump to Next RED ROW
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextRedIndex !== -1) {
                const targetSubject = subjects[0]?.subjectId;
                focusCell(nextRedIndex, targetSubject);
            } else if (redCount === 0) {
                // All Green! Focus save button
                document.getElementById('lock-save-btn')?.focus();
            }
            return;
        }

        // 4. Horizontal Navigation: ArrowRight / ArrowLeft / Tab
        if (e.key === 'ArrowRight' || (!e.shiftKey && e.key === 'Tab' && colIdx < subjects.length)) {
            if (colIdx < subjects.length - 1) {
                e.preventDefault();
                focusCell(rowIdx, subjects[colIdx + 1].subjectId);
            } else if (colIdx === subjects.length - 1) {
                e.preventDefault();
                focusCell(rowIdx, '__regTotal');
            }
            return;
        }

        if (e.key === 'ArrowLeft' || (e.shiftKey && e.key === 'Tab' && colIdx > 0)) {
            e.preventDefault();
            if (colIdx === subjects.length) {
                focusCell(rowIdx, subjects[subjects.length - 1].subjectId);
            } else if (colIdx > 0) {
                focusCell(rowIdx, subjects[colIdx - 1].subjectId);
            }
            return;
        }

        // 5. Vertical Navigation: ArrowDown / ArrowUp
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (rowIdx < roster.length - 1) {
                focusCell(rowIdx + 1, cellKey);
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (rowIdx > 0) {
                focusCell(rowIdx - 1, cellKey);
            }
            return;
        }
    }, [handleTeacherMathOverride, nextRedIndex, redCount, onSaveVerifiedResults, roster, subjects, focusCell]);

    // Mouse Pan & Zoom in Left Pane
    const handleMouseDownPan = (e) => {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMovePan = (e) => {
        if (!isPanning) return;
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    };

    const handleMouseUpPan = () => setIsPanning(false);

    const handleWheelZoom = (e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        setZoom(prev => Math.min(Math.max(0.4, prev + delta), 4));
    };

    const resetViewer = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setRotation(0);
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
            className="bg-slate-900 flex flex-col font-sans select-none overflow-hidden m-0 p-0 animate-fadeIn"
        >
            {/* Top Workspace Header */}
            <div className="bg-slate-900 border-b border-slate-700 px-5 py-3 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <ShieldCheck className="text-white" size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <span>Smart Exam Broadsheet 2-Key Verification Studio</span>
                            <span className="text-xs font-mono font-medium bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded">
                                {classDetails?.name || 'Class'}
                            </span>
                            <span className="text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded">
                                {examTitle}
                            </span>
                        </h2>
                        <p className="text-[11px] text-slate-400">
                            100% Math-Lock Engine: Zero errors allowed before committing to Firestore.
                        </p>
                    </div>
                </div>

                {/* Keyboard Shortcuts Quick Guide */}
                <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono border border-slate-600">Enter</kbd>
                        <span>Next Red Row</span>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono border border-slate-600">Ctrl+M</kbd>
                        <span>Fix Teacher Math</span>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono border border-slate-600">Arrows</kbd>
                        <span>Navigate</span>
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                        title="Close Workspace"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main Split Screen Body */}
            <div className="flex-1 flex overflow-hidden bg-slate-100">
                {/* LEFT PANE (40% width): Interactive Image Viewer with Auto-Switch */}
                <div className="w-[42%] flex flex-col bg-slate-950 border-r border-slate-800 relative">
                    {/* Top Image Multi-Part Switcher & Zoom Controls */}
                    <div className="bg-slate-900/90 border-b border-slate-800 p-2 flex items-center justify-between text-xs text-white z-10">
                        {/* Part Tabs */}
                        <div className="flex items-center gap-1.5">
                            {processedImages.map((img, i) => (
                                <button
                                    key={i}
                                    onClick={() => setSelectedImageIdx(i)}
                                    className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                        selectedImageIdx === i
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Layers size={13} />
                                    <span>{img.label || `Part ${i + 1}`}</span>
                                </button>
                            ))}
                        </div>

                        {/* Interactive Zoom/Rotate Toolbar */}
                        <div className="flex items-center gap-1 bg-slate-800/90 px-2 py-0.5 rounded-lg border border-slate-700">
                            <button
                                onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}
                                className="p-1 hover:text-indigo-400 transition"
                                title="Zoom Out"
                            >
                                <ZoomOut size={15} />
                            </button>
                            <span className="font-mono text-[11px] text-slate-300 w-10 text-center">
                                {Math.round(zoom * 100)}%
                            </span>
                            <button
                                onClick={() => setZoom(z => Math.min(4, z + 0.2))}
                                className="p-1 hover:text-indigo-400 transition"
                                title="Zoom In"
                            >
                                <ZoomIn size={15} />
                            </button>
                            <div className="h-3 w-px bg-slate-700 mx-0.5" />
                            <button
                                onClick={() => setRotation(r => (r + 90) % 360)}
                                className="p-1 hover:text-indigo-400 transition"
                                title="Rotate 90°"
                            >
                                <RotateCw size={15} />
                            </button>
                            <button
                                onClick={resetViewer}
                                className="p-1 hover:text-indigo-400 transition"
                                title="Reset View"
                            >
                                <RefreshCw size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Canvas / Image Display Area (Draggable & Zoomable) */}
                    <div
                        className="flex-1 overflow-hidden flex items-center justify-center relative cursor-grab active:cursor-grabbing bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]"
                        onMouseDown={handleMouseDownPan}
                        onMouseMove={handleMouseMovePan}
                        onMouseUp={handleMouseUpPan}
                        onMouseLeave={handleMouseUpPan}
                        onWheel={handleWheelZoom}
                    >
                        {processedImages[selectedImageIdx] ? (
                            <img
                                src={processedImages[selectedImageIdx].previewUrl || processedImages[selectedImageIdx].base64}
                                alt="Register Broadsheet"
                                style={{
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                                    transformOrigin: 'center center',
                                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                                    maxWidth: '90%',
                                    maxHeight: '90%'
                                }}
                                className="shadow-2xl rounded select-none pointer-events-none"
                                draggable={false}
                            />
                        ) : (
                            <div className="text-slate-500 text-xs">No image loaded for this section.</div>
                        )}

                        {/* Floating Indicator for active photo part */}
                        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur border border-slate-700/80 text-slate-300 text-[11px] px-2.5 py-1 rounded-md shadow-lg pointer-events-none">
                            Active photo: <span className="font-bold text-white">{processedImages[selectedImageIdx]?.label || `Part ${selectedImageIdx + 1}`}</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANE (58% width): High-Speed Spreadsheet Grid with Math-Lock */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                    {/* Grid Toolbar & Status Pill */}
                    <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-700">Class Broadsheet Grid</span>
                            <span className="text-slate-500">({roster.length} students)</span>
                        </div>

                        {/* Live Math-Lock Verification Counters */}
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 size={13} className="text-emerald-600" />
                                <span>Verified: {greenCount}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                <AlertTriangle size={13} className="text-rose-600" />
                                <span>Discrepancies: {redCount}</span>
                            </span>
                        </div>
                    </div>

                    {/* Scrollable Table View */}
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse border-spacing-0">
                            <thead className="bg-slate-800 text-white text-[11px] uppercase tracking-wider sticky top-0 z-20 shadow-sm">
                                <tr>
                                    <th className="px-3 py-2 text-center w-14 border-r border-slate-700 font-bold">
                                        Roll #
                                    </th>
                                    <th className="px-3 py-2 border-r border-slate-700 font-bold">
                                        Student Name
                                    </th>
                                    {subjects.map(sub => (
                                        <th key={sub.subjectId} className="px-2 py-2 text-center border-r border-slate-700 font-bold">
                                            <div className="truncate max-w-[80px]" title={sub.name}>
                                                {sub.name}
                                            </div>
                                            <div className="text-[9px] text-slate-400 font-mono normal-case">
                                                max: {sub.maxMarks}
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-2 py-2 text-center w-20 border-r border-slate-700 font-bold bg-slate-900">
                                        Auto-Sum
                                    </th>
                                    <th className="px-2 py-2 text-center w-20 border-r border-slate-700 font-bold">
                                        Reg Total
                                    </th>
                                    <th className="px-3 py-2 text-center w-28 font-bold">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {roster.map((student, idx) => (
                                    <StudentGridRow
                                        key={student.studentId || idx}
                                        student={student}
                                        index={idx}
                                        subjects={subjects}
                                        isActive={activeRowIndex === idx}
                                        onRowFocus={(rowIdx) => setActiveRowIndex(rowIdx)}
                                        onMarkChange={handleMarkChange}
                                        onRegisterTotalChange={handleRegisterTotalChange}
                                        onKeyDownNav={handleKeyDownNav}
                                        onTeacherMathOverride={handleTeacherMathOverride}
                                        onClearLowConfidence={handleClearLowConfidence}
                                        inputRefs={inputRefs}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Bottom Status & Atomic Commit Bar */}
                    <div className="p-3 bg-slate-900 border-t border-slate-700 flex items-center justify-between text-white shrink-0">
                        <div className="flex items-center gap-3">
                            {redCount === 0 ? (
                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold animate-pulse">
                                    <CheckCircle2 size={16} />
                                    <span>All {roster.length} rows 100% mathematically verified & locked!</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold">
                                    <AlertCircle size={16} />
                                    <span>
                                        Fix remaining <b>{redCount}</b> red rows before saving (Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px] text-white border border-slate-600">Enter</kbd> to jump).
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                            >
                                Cancel
                            </button>

                            <button
                                id="lock-save-btn"
                                type="button"
                                disabled={redCount > 0 || isSaving}
                                onClick={() => onSaveVerifiedResults(roster)}
                                className={`px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-all ${
                                    redCount === 0 && !isSaving
                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 cursor-pointer animate-bounce'
                                        : 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
                                }`}
                                title={redCount > 0 ? "Fix all red discrepancies first" : "Commit results to Firestore"}
                            >
                                {isSaving ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        <span>Writing to Firestore...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={14} />
                                        <span>Lock & Save Term Results (Ctrl + Enter)</span>
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
