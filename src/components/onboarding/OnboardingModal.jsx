import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Fuel, IndianRupee, ArrowRight, Building2, Wallet, Loader2, Sparkles, X } from 'lucide-react';

export default function OnboardingModal({ onClose }) {
  const { stationProfile, updateStationProfile, setStationProfile, showToast } = useApp();
  const { currentUser } = useAuth();

  const [isOpen, setIsOpen] = useState(true);
  const [openingSilak, setOpeningSilak] = useState('');
  const [stationName, setStationName] = useState(
    stationProfile?.fuelStationName || currentUser?.fuelStationName || ''
  );
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setIsOpen(false);
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSubmitting(true);

    const parsedSilak = parseFloat(openingSilak) || 0;
    const cleanName = (stationName || '').trim() || 'MY PETROL PUMP';

    // 1. IMMEDIATELY close the modal & mark onboarded in memory so it disappears instantly
    setIsOpen(false);
    if (typeof onClose === 'function') {
      onClose();
    }

    const updatedProfile = {
      ...(stationProfile || {}),
      fuelStationName: cleanName,
      stationName: cleanName,
      openingShreeSilak: parsedSilak,
      openingSilak: parsedSilak,
      isOnboarded: true
    };

    // Update in-memory station profile state
    if (typeof setStationProfile === 'function') {
      setStationProfile(updatedProfile);
    }

    // 2. Immediately persist flag in user-scoped localStorage so any reload/effect sees true
    try {
      if (currentUser?.id) {
        localStorage.setItem(`mypump_${currentUser.id}_onboarded`, 'true');
        localStorage.setItem(`mypump_${currentUser.id}_station_profile`, JSON.stringify(updatedProfile));
      }
      localStorage.setItem('mypump_onboarded', 'true');
      localStorage.setItem('station_profile', JSON.stringify(updatedProfile));
    } catch (e) {}

    // 3. Sync to Supabase in background (do NOT await before closing modal)
    try {
      if (typeof updateStationProfile === 'function') {
        updateStationProfile(updatedProfile);
      }
    } catch (err) {
      console.warn('[OnboardingModal] Background sync error:', err);
    }

    showToast('Station initialized successfully! Welcome to MY PUMP.', 'success');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 sm:p-6 animate-fadeIn select-none font-sans">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-orange-100 overflow-hidden transform animate-scaleUp">
        
        {/* Top Decorative Header */}
        <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 p-6 text-white relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/10 hover:bg-black/20 text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white shadow-inner">
              <Fuel className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-orange-100 bg-white/20 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  First-Time Setup
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white mt-1">
                Welcome to MY PUMP!
              </h2>
            </div>
          </div>

          <p className="text-xs text-orange-50 leading-relaxed mt-2.5 relative z-10">
            Set your station's starting balance to immediately open today's ledger and daily balance sheet.
          </p>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 bg-white text-slate-800">
          
          {/* Fuel Station Name (Optional / Pre-filled) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-orange-600" />
              <span>Fuel Station Name</span>
            </label>
            <input
              type="text"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              placeholder="e.g. SHREE RAM PETROL PUMP"
              className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-semibold outline-none transition-all shadow-2xs placeholder:text-slate-400"
            />
            <p className="text-[11px] text-slate-400">Can be changed anytime from Station Settings.</p>
          </div>

          {/* Opening Shree Silak (Primary Input) */}
          <div className="space-y-1.5 p-4 rounded-2xl bg-orange-50/80 border border-orange-200/80">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-orange-900 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-orange-600" />
                <span>Opening Shree Silak (Prev Cash) (₹)</span>
              </label>
              <span className="text-[10px] font-bold text-orange-700 bg-orange-200/60 px-2 py-0.5 rounded-full">
                Drawer Cash
              </span>
            </div>

            <div className="relative mt-2">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-orange-600 font-black text-sm">
                <IndianRupee className="w-4 h-4" />
              </div>
              <input
                type="number"
                step="any"
                min="0"
                required
                autoFocus
                value={openingSilak}
                onChange={(e) => setOpeningSilak(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white border border-orange-300 focus:border-orange-600 focus:ring-2 focus:ring-orange-200 rounded-xl pl-9 pr-3.5 py-3 text-base text-slate-900 font-mono font-bold outline-none transition-all shadow-2xs text-left"
              />
            </div>
            <p className="text-[11px] text-orange-800/80 leading-relaxed pt-1">
              This cash balance will automatically populate <strong>Section I (Final Shree Silak &rarr; 1. Opening Shree Silak)</strong> in your Daily Balance Sheet.
            </p>
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-95 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Initializing Station Ledger...</span>
              </>
            ) : (
              <>
                <span>Start My Station Ledger</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
