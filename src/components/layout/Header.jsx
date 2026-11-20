import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Clock, User, LogOut, ChevronDown, Building, ShieldCheck, UserCheck, KeyRound, LogIn, UserPlus, Power } from 'lucide-react';

export default function Header() {
  const {
    selectedDate,
    setSelectedDate,
    activeShift,
    setActiveShift,
    stationProfile
  } = useApp();

  const { currentUser, isAuthenticated, logout, openAuthModal } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef(null);

  const getTodayDateStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const todayStr = getTodayDateStr();

  const handleDateChange = (val) => {
    if (!val) return;
    if (val > todayStr) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(val);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Single source of truth: stationProfile (reactive — updates immediately on Save Station Profile)
  const stationName = stationProfile?.fuelStationName?.trim() || currentUser?.fuelStationName?.trim() || 'SHITAL PETROL PUMP';
  const ownerName = stationProfile?.ownerName?.trim() || currentUser?.ownerName?.trim() || 'Owner';
  const userInitial = ownerName.charAt(0).toUpperCase();

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 md:px-5 flex items-center justify-between sticky top-0 z-20 select-none shadow-xs transition-colors duration-200 gap-3">
      {/* Station Title */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <h2 className="text-[14px] font-bold text-slate-900 tracking-wide uppercase">
          {stationName}
        </h2>
      </div>

      {/* Clean Header Controls */}
      <div className="flex items-center gap-2.5">
        {/* Standard Clean Date Input */}
        <div className="relative flex items-center">
          <input
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-900 font-semibold text-xs font-mono px-2.5 py-1.5 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
          />
        </div>

        {/* Shift Selector */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold shrink-0">
          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <select
            value={activeShift}
            onChange={(e) => setActiveShift(e.target.value)}
            className="bg-transparent text-slate-900 font-semibold outline-none cursor-pointer text-xs"
          >
            <option value="Day Shift (Morning 6am - 6pm)" className="bg-white text-slate-900 font-medium">Day Shift (6:00 AM – 6:00 PM)</option>
            <option value="Night Shift (Evening 6pm - 6am)" className="bg-white text-slate-900 font-medium">Night Shift (6:00 PM – 6:00 AM)</option>
          </select>
        </div>

        {/* Direct Action Buttons: Login & Sign Up */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Open Login Screen"
          >
            <LogIn className="w-3.5 h-3.5 text-blue-600" />
            <span>Login</span>
          </button>

          <button
            type="button"
            onClick={() => openAuthModal('signup')}
            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Open Sign Up / Petrol Pump Registration Screen"
          >
            <UserPlus className="w-3.5 h-3.5 text-white" />
            <span>Sign Up</span>
          </button>
        </div>

        {/* User Profile / Account Menu Widget */}
        <div className="relative" ref={menuRef}>
          {isAuthenticated && (
            <button type="button"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl px-2.5 py-1 transition-all cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {userInitial}
              </div>
              <span className="text-xs font-bold text-slate-800 hidden sm:inline truncate max-w-[120px]">
                {ownerName}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          )}

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3 space-y-2 animate-fadeIn select-text">
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-extrabold text-xs text-slate-900 truncate">
                  {stationName}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  GSTIN: {currentUser?.gstin || stationProfile?.gstin || "24AAAAA0000A1Z5"}
                </div>
                <div className="text-[11px] text-slate-600 font-semibold flex items-center gap-1 pt-1 border-t border-slate-200">
                  <UserCheck className="w-3 h-3 text-blue-600" />
                  <span>Owner: {ownerName}</span>
                </div>
              </div>

              <div className="space-y-1">
                <button type="button"
                  onClick={() => { setShowProfileMenu(false); openAuthModal('login'); }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5 text-blue-600" />
                  <span>Switch Account / Login</span>
                </button>

                <button type="button"
                  onClick={() => { setShowProfileMenu(false); openAuthModal('signup'); }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-orange-700 hover:bg-orange-50 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5 text-orange-600" />
                  <span>Create New Station Account</span>
                </button>

                <button type="button"
                  onClick={() => { setShowProfileMenu(false); logout(); }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>

                {typeof window !== 'undefined' && window.electronAPI?.closeWindow && (
                  <button type="button"
                    onClick={() => { setShowProfileMenu(false); window.electronAPI.closeWindow(); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50/50 hover:bg-rose-100/70 border-t border-rose-100 flex items-center gap-2 cursor-pointer transition-colors"
                    title="Close MY PUMP Desktop Software"
                  >
                    <Power className="w-3.5 h-3.5 text-rose-600" />
                    <span>Exit Software (Quit)</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
