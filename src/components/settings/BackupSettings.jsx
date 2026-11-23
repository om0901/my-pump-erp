import React, { useState, useEffect } from 'react';
import { useApp, DEFAULT_STATION_PROFILE } from '../../context/AppContext';
import { Settings, Building2, ShieldCheck, Save, Loader2 } from 'lucide-react';

export default function BackupSettings() {
  const { showToast, stationProfile, updateStationProfile } = useApp();
  const profile = stationProfile || DEFAULT_STATION_PROFILE;

  const [formData, setFormData] = useState({
    fuelStationName: profile?.fuelStationName || DEFAULT_STATION_PROFILE.fuelStationName,
    gstin: profile?.gstin || DEFAULT_STATION_PROFILE.gstin,
    address: profile?.address || DEFAULT_STATION_PROFILE.address,
    phone: profile?.phone || DEFAULT_STATION_PROFILE.phone,
    email: profile?.email || DEFAULT_STATION_PROFILE.email,
    ownerName: profile?.ownerName || DEFAULT_STATION_PROFILE.ownerName || '',
    managerName: profile?.managerName || DEFAULT_STATION_PROFILE.managerName || '',
    openingShreeSilak: profile?.openingShreeSilak !== undefined ? profile.openingShreeSilak : 50000
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (stationProfile) {
      setFormData({
        fuelStationName: stationProfile.fuelStationName || DEFAULT_STATION_PROFILE.fuelStationName,
        gstin: stationProfile.gstin || DEFAULT_STATION_PROFILE.gstin,
        address: stationProfile.address || DEFAULT_STATION_PROFILE.address,
        phone: stationProfile.phone || DEFAULT_STATION_PROFILE.phone,
        email: stationProfile.email || DEFAULT_STATION_PROFILE.email,
        ownerName: stationProfile.ownerName || '',
        managerName: stationProfile.managerName || '',
        openingShreeSilak: stationProfile.openingShreeSilak !== undefined ? stationProfile.openingShreeSilak : 50000
      });
    }
  }, [stationProfile]);

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      await updateStationProfile(formData);
    } catch (err) {
      showToast('Failed to save profile: ' + (err?.message || err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn bg-[#0c121d] min-h-screen select-text text-slate-100">
      {/* Centered Max-Width Container */}
      <div className="max-w-3xl mx-auto space-y-5">
        
        {/* Header Banner */}
        <div className="bg-[#121927] p-4 rounded-xl border border-[#1e293b] shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#192438] border border-blue-500/30 text-blue-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <span>Station Profile & Configuration</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Manage fuel station business details, GSTIN, and Opening Shree Silak drawer cash balance.
              </p>
            </div>
          </div>
        </div>

        {/* Centered Fuel Station Business Profile Card */}
        <div className="bg-[#121927] rounded-xl border border-[#1e293b] p-5 space-y-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-[#1b2537]">
            <h3 className="font-semibold text-xs text-slate-200 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <span>Fuel Station Business Profile</span>
            </h3>
            <span className="text-[11px] font-mono font-medium text-emerald-400 flex items-center gap-1.5 bg-[#103a27] px-2.5 py-0.5 rounded-full border border-[#15803d]/40">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Cloud Sync Active</span>
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            {/* Station Name */}
            <div>
              <label className="block text-slate-300 mb-1.5 font-medium text-[11px]">Fuel Station Name</label>
              <input
                type="text"
                required
                placeholder="e.g. SHITAL PETROL PUMP"
                value={formData.fuelStationName}
                onChange={(e) => setFormData({ ...formData, fuelStationName: e.target.value })}
                className="w-full bg-[#172033] border border-[#23304a] rounded-lg px-3 py-2 text-slate-100 outline-none text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
              />
            </div>

            {/* GSTIN & Contact Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 mb-1.5 font-medium text-[11px]">GSTIN Registration Number</label>
                <input
                  type="text"
                  placeholder="e.g. 24AAAAA0000A1Z5"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg px-3 py-2 text-slate-100 outline-none font-mono uppercase text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1.5 font-medium text-[11px]">Contact Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg px-3 py-2 text-slate-100 outline-none font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Owner Name & Manager Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 mb-1.5 font-medium text-[11px]">Owner Name</label>
                <input
                  type="text"
                  placeholder="e.g. Owner Name"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg px-3 py-2 text-slate-100 outline-none text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1.5 font-medium text-[11px]">Manager Name</label>
                <input
                  type="text"
                  placeholder="e.g. Shift Manager"
                  value={formData.managerName}
                  onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg px-3 py-2 text-slate-100 outline-none text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-slate-300 mb-1.5 font-medium text-[11px]">Address & Highway Location</label>
              <textarea
                rows="2"
                placeholder="Highway NH-48, Fuel Station Complex, Kheralu, Mehsana"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-[#172033] border border-[#23304a] rounded-lg px-3 py-2 text-slate-100 outline-none leading-relaxed text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* Opening Shree Silak Field */}
            <div className="bg-[#172033] p-3.5 rounded-lg border border-[#23304a] space-y-1.5">
              <label className="block text-emerald-400 font-semibold text-[11px]">Opening Shree Silak (Initial Drawer Cash Balance) (₹)</label>
              <input
                type="number"
                placeholder="50000"
                value={formData.openingShreeSilak}
                onChange={(e) => setFormData({ ...formData, openingShreeSilak: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#0e1420] border border-emerald-500/50 rounded-lg px-3 py-2 text-emerald-300 font-mono text-xs font-bold outline-none text-right focus:border-emerald-400 transition-all"
              />
              <p className="text-[10px] text-slate-400 pt-0.5">Initial cash in drawer used in Section I (Daily Balance Sheet) Inflow calculation.</p>
            </div>

            {/* Save Button */}
            <div className="pt-3 flex justify-end border-t border-[#1b2537]">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-95 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg shadow-md shadow-blue-900/30 transition-all text-xs cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving to Cloud...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Station Profile</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
