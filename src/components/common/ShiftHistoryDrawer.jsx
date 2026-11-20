import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getDailyShiftsArchive } from '../../db/storageService';
import { X, Calendar, Clock, FolderArchive, ArrowRight, Search, Fuel, IndianRupee } from 'lucide-react';

export default function ShiftHistoryDrawer({ isOpen, onClose }) {
  const { setSelectedDate, setActiveShift, showToast, selectedDate } = useApp();
  const [archives, setArchives] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const loadArchives = async () => {
    setLoading(true);
    try {
      const data = await getDailyShiftsArchive();
      const list = Object.entries(data || {}).map(([key, val]) => ({
        key,
        ...val
      }));
      // Sort descending by date
      list.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (b.savedAt || '').localeCompare(a.savedAt || '');
      });
      setArchives(list);
    } catch (err) {
      console.error('Error loading shift archives:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadArchives();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleUpdate = () => {
      if (isOpen) loadArchives();
    };
    window.addEventListener('daily_shift_archived', handleUpdate);
    return () => window.removeEventListener('daily_shift_archived', handleUpdate);
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredArchives = archives.filter(item => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (item.date || '').toLowerCase().includes(term) ||
      (item.shiftType || '').toLowerCase().includes(term)
    );
  });

  const calculateTotalVolume = (snapshot) => {
    if (snapshot.nozzleTotals && (snapshot.nozzleTotals.petrolLitres || snapshot.nozzleTotals.dieselLitres || snapshot.nozzleTotals.speedLitres)) {
      return (
        (snapshot.nozzleTotals.petrolLitres || 0) +
        (snapshot.nozzleTotals.dieselLitres || 0) +
        (snapshot.nozzleTotals.speedLitres || 0)
      );
    }
    if (Array.isArray(snapshot.nozzles)) {
      return snapshot.nozzles.reduce((acc, n) => acc + (parseFloat(n.salesLitres) || 0), 0);
    }
    return 0;
  };

  const handleSelectShift = (item) => {
    if (item.date) {
      setSelectedDate(item.date);
    }
    if (item.shiftType) {
      setActiveShift(item.shiftType);
    }
    showToast(`Loaded shift archive for ${item.date} (${item.shiftType || 'Day Shift'})`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      {/* Backdrop overlay dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide Drawer Box */}
      <div className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 text-white h-full shadow-2xl flex flex-col z-10">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white tracking-tight">
                📜 Shift History Log
              </h3>
              <p className="text-xs text-slate-400 font-mono font-medium">
                Saved Daily Shift Archive Registry
              </p>
            </div>
          </div>

          <button type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search date (YYYY-MM-DD) or shift..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-mono font-semibold pl-9 pr-4 py-2 rounded-xl focus:border-amber-500 focus:outline-none placeholder-slate-500"
            />
          </div>
        </div>

        {/* Archives List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="p-8 text-center text-slate-400 font-semibold text-xs">
              Loading saved shift history archives...
            </div>
          ) : filteredArchives.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-semibold text-xs space-y-2">
              <FolderArchive className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
              <div>No shift archives found matching query.</div>
            </div>
          ) : (
            filteredArchives.map((item) => {
              const isActive = item.date === selectedDate;
              const totalVol = calculateTotalVolume(item);
              const silak = parseFloat(item.closingShreeSilak) || 0;
              const formattedDate = item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : item.date;

              return (
                <div
                  key={item.key}
                  className={`p-4 rounded-2xl border transition-all ${
                    isActive
                      ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-md'
                      : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 text-xs font-black font-mono bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                        📅 {formattedDate}
                      </span>
                      {isActive && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.shiftType || 'Day Shift'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-3 text-xs">
                    <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mb-0.5">
                        <Fuel className="w-3 h-3 text-blue-400" />
                        <span>Dispensed Volume</span>
                      </div>
                      <div className="font-mono font-bold text-white text-xs">
                        {totalVol.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mb-0.5">
                        <IndianRupee className="w-3 h-3 text-emerald-400" />
                        <span>Shree Silak</span>
                      </div>
                      <div className="font-mono font-bold text-emerald-400 text-xs">
                        ₹{silak.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {item.savedAt && (
                    <div className="text-[10px] text-slate-500 font-mono mb-3">
                      Archived: {new Date(item.savedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  )}

                  <button type="button"
                    onClick={() => handleSelectShift(item)}
                    className="w-full bg-slate-700 hover:bg-amber-500 hover:text-slate-950 text-white font-bold text-xs py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                  >
                    <span>📂 Open Shift</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
