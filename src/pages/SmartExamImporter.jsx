import React from 'react';
import { Award, ArrowLeft, ArrowUpRight, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthPermissions } from '../context/AuthPermissionsContext';
import ExamBroadsheetImporter from '../components/exam-importer/ExamBroadsheetImporter';

export default function SmartExamImporter() {
    const { schoolId, schoolData } = useAuthPermissions();
    const navigate = useNavigate();

    return (
        <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6">
            {/* Top Navigation Header matching Exams & Results Center */}
            <div className="no-print flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                        <Award className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Smart Exam Broadsheet Importer</h1>
                            <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                                {schoolData?.name || 'School Portal'}
                            </span>
                        </div>
                        <p className="text-sm font-medium text-slate-500">
                            Onboard offline handwritten registers (1st Term, Mid Term & Annual) with 100% Math-Lock verification.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate('/exams')}
                        className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-xl border border-slate-200 transition flex items-center gap-1.5"
                    >
                        <span>Exams & Results Center</span>
                        <ArrowUpRight size={14} />
                    </button>
                </div>
            </div>

            {/* Full-Size Importer Component */}
            <div className="w-full">
                <ExamBroadsheetImporter schoolId={schoolId} />
            </div>
        </div>
    );
}
