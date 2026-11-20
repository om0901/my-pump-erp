import React from 'react';
import { FolderArchive, Calendar, Clock, Lock, ArrowLeft, AlertCircle } from 'lucide-react';

/**
 * HistoricalBanner Component
 * Displayed when viewing a past archived shift.
 * Shows status, date, shift name, and a quick button to return to today's active shift.
 */
export default function HistoricalBanner({ date, shiftType, savedAt, onReturnToToday }) {
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const formattedSavedAt = savedAt
    ? new Date(savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 sm:p-3.5 mb-3 text-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
          <FolderArchive className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-xs sm:text-sm text-amber-300 flex items-center gap-1.5">
              <span>📁 Viewing Historical Closed Archive:</span>
              <span className="font-mono text-white underline decoration-amber-400">
                {formatDateDisplay(date)}
              </span>
              <span className="text-slate-300 font-normal">({shiftType || 'Day Shift'})</span>
            </h4>
            <span className="inline-flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              <Lock className="w-2.5 h-2.5" /> Read-Only Mode
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>All nozzle meter readings, creditor collections, debits & expenses are permanently locked.</span>
            {formattedSavedAt && (
              <span className="text-slate-500 font-mono">
                (Saved at {formattedSavedAt})
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-end shrink-0">
        <button
          type="button"
          onClick={onReturnToToday}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Today's Active Shift</span>
        </button>
      </div>
    </div>
  );
}
