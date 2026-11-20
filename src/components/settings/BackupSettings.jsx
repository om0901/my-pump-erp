import React, { useState, useEffect } from 'react';
import { useApp, DEFAULT_STATION_PROFILE } from '../../context/AppContext';
import { Settings, Building2, ShieldCheck, Save, HardDrive, FolderCheck, Download, Upload, RefreshCw, Database } from 'lucide-react';
import { exportDatabaseBackup, restoreDatabaseFromFile } from '../../db/storageService';
import { getStorageStatus, setupLocalStorageDirectory, createRollingSafetyBackup, STORAGE_CONFIG } from '../../services/dbStorageService';

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

  const [storageStatus, setStorageStatus] = useState(() => getStorageStatus());
  const [isSettingUpDir, setIsSettingUpDir] = useState(false);

  const handleSelectFolder = async () => {
    setIsSettingUpDir(true);
    try {
      const handle = await setupLocalStorageDirectory();
      if (handle) {
        showToast(`Connected local storage directory: ${handle.name}`, 'success');
      } else {
        showToast('Directory selection cancelled or not supported in this browser mode.', 'info');
      }
      setStorageStatus(getStorageStatus());
    } catch (e) {
      showToast('Error setting directory: ' + e.message, 'error');
    } finally {
      setIsSettingUpDir(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      await exportDatabaseBackup();
      showToast('Full Database JSON Exported successfully!', 'success');
    } catch (e) {
      showToast('Export failed: ' + e.message, 'error');
    }
  };

  const handleCreateRollingBackup = async () => {
    try {
      await createRollingSafetyBackup();
      showToast('New rolling safety backup created successfully!', 'success');
    } catch (e) {
      showToast('Backup creation failed: ' + e.message, 'error');
    }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (window.confirm('Are you sure you want to restore from this backup? Current data will be replaced.')) {
      try {
        await restoreDatabaseFromFile(file);
        showToast('Database restored successfully! All data updated in-memory.', 'success');
      } catch (err) {
        showToast('Failed to restore backup: ' + err.message, 'error');
      }
    }
  };

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
    await updateStationProfile(formData);
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
              <span>DSR Sync Active</span>
            </span>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(e); }} className="space-y-4 text-xs">
            {/* Station Name */}
            <div>
              <label className="block text-slate-300 mb-1.5 font-medium text-[11px]">Fuel Station Name</label>
              <input
                type="text"
                required
                placeholder="e.g. SHITAL PETROL PUMP"
                value={formData.fuelStationName}
                onChange={(e) => setFormData({ ...formData, fuelStationName: e.target.value })}
                className="w-full bg-[#172033] border border-[#23304a] rounded-lg px-3 py-2 text-slate-100 outline-none text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
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
            <div className="bg-[#172033] p-3 rounded-lg border border-[#23304a] space-y-1">
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
                className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold px-4 py-2 rounded-lg shadow-md shadow-blue-900/30 transition-all text-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Station Profile</span>
              </button>
            </div>
          </form>
        </div>

        {/* Local Database Engine & Hard Drive Storage Card */}
        <div className="bg-[#121927] rounded-xl border border-[#1e293b] p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-[#1b2537]">
            <h3 className="font-semibold text-xs text-slate-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <span>Permanent Local Database & Hard Drive Storage Engine</span>
            </h3>
            <span className="text-[11px] font-mono font-medium text-emerald-400 flex items-center gap-1.5 bg-[#103a27] px-2.5 py-0.5 rounded-full border border-[#15803d]/40">
              <FolderCheck className="w-3.5 h-3.5" />
              <span>Offline Engine Ready</span>
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-[#172033] rounded-lg border border-[#23304a] space-y-1">
                <span className="text-[10px] uppercase font-mono text-slate-400">Primary Local Directory</span>
                <p className="font-mono text-emerald-300 font-bold text-xs">{STORAGE_CONFIG.primaryPath}</p>
                <p className="text-[10px] text-slate-400">Fallback target: {STORAGE_CONFIG.fallbackPath}</p>
              </div>

              <div className="p-3 bg-[#172033] rounded-lg border border-[#23304a] space-y-1">
                <span className="text-[10px] uppercase font-mono text-slate-400">Current Storage Target</span>
                <p className="font-mono text-blue-300 font-bold text-xs truncate">
                  {storageStatus.connectedFolder ? `Connected: ${storageStatus.connectedFolder}` : 'C:\\MyPumpData\\ (Default Engine)'}
                </p>
                <p className="text-[10px] text-slate-400">Managed files: database.json, archives/, backups/</p>
              </div>
            </div>

            <div className="p-3 bg-[#0e1420] rounded-lg border border-[#1b2537] space-y-1.5 text-[11px] text-slate-300">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span>Automatic Triple-Layer Persistence:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[10px]">
                <li><strong className="text-slate-300">IndexedDB:</strong> In-memory and browser-level relational tables (v12) for 0ms latency.</li>
                <li><strong className="text-slate-300">Daily Shift Archives:</strong> Immutable snapshots saved to <code className="text-emerald-400">archives/&#123;YYYY-MM-DD&#125;_&#123;SHIFT&#125;.json</code> on every "Save To Next Shift".</li>
                <li><strong className="text-slate-300">Rolling Safety Backups:</strong> Automatic rolling backups retained in <code className="text-blue-400">backups/</code> folder.</li>
              </ul>
            </div>

            {/* Storage Actions */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#1b2537]">
              <button
                type="button"
                onClick={handleSelectFolder}
                disabled={isSettingUpDir}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>{isSettingUpDir ? 'Selecting...' : 'Select / Connect C:\\MyPumpData\\ Folder'}</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateRollingBackup}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] hover:bg-[#1f2b45] text-slate-200 border border-[#23304a] text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Create Rolling Backup</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] hover:bg-[#1f2b45] text-slate-200 border border-[#23304a] text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Export JSON Backup</span>
                </button>

                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] hover:bg-[#1f2b45] text-slate-200 border border-[#23304a] text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restore Backup</span>
                  <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
