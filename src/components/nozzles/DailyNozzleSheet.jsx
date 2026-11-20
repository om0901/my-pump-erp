import React, { useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import { Fuel, Save, Plus, Trash2, RotateCcw, ArrowRightCircle } from 'lucide-react';
import NumericInput from '../common/NumericInput';
import { calculateNozzleSales } from '../../utils/petroleumMath';

export default function DailyNozzleSheet() {
  const { selectedDate, activeShift, showToast, nozzles, setNozzles, dbReady } = useApp();
  const [globalRates, setGlobalRates] = useState({
    'High Speed Diesel': 90.16,
    'Motor Spirit (Petrol)': 94.48,
    'XP Premium Petrol': 102.50,
  });

  // ✅ FIX: Add Nozzle — correctly adds a new nozzle row with mpdId
  const handleAddNozzle = useCallback(() => {
    const nextIndex = nozzles.length + 1;
    const isPetrol = nextIndex % 2 !== 0;
    const defaultProduct = isPetrol ? 'Motor Spirit (Petrol)' : 'High Speed Diesel';
    const defaultRate = isPetrol
      ? (globalRates['Motor Spirit (Petrol)'] || 94.48)
      : (globalRates['High Speed Diesel'] || 90.16);

    const mpdNum = Math.ceil(nextIndex / 4);
    const newNozzle = {
      _localId: Date.now() + Math.random(),  // local-only temp id for key
      date: selectedDate,
      mpdId: `MPD-${mpdNum}`,
      nozzleId: `N${nextIndex} (${isPetrol ? 'MS' : 'HSD'})`,
      productName: defaultProduct,
      openingReading: 0.0,
      closingReading: 0.0,
      testingLitres: 0.0,
      salesLitres: 0.0,
      rate: defaultRate,
      totalAmount: 0.0,
      shiftId: activeShift,
    };

    setNozzles(prev => [...prev, newNozzle]);
    showToast(`✅ Nozzle added: ${newNozzle.nozzleId}`, 'success');
  }, [nozzles, selectedDate, activeShift, globalRates, setNozzles, showToast]);

  // ✅ FIX: Delete Nozzle — uses index-based filter (no broken DB id lookup for local rows)
  const handleDeleteNozzle = useCallback(async (index) => {
    const target = nozzles[index];
    if (!target) return;

    // If nozzle has a valid integer DB id (from IndexedDB), delete it from DB too
    if (target.id && Number.isInteger(target.id)) {
      try {
        await db.nozzleReadings.delete(target.id);
      } catch (e) {
        console.warn('DB delete skipped:', e);
      }
    }

    // Always filter by index from memory state
    const updated = nozzles.filter((_, i) => i !== index);
    setNozzles(updated);
    showToast(`🗑️ Nozzle "${target.nozzleId || 'row'}" removed`, 'info');
  }, [nozzles, setNozzles, showToast]);

  const handleClearAll = useCallback(() => {
    if (nozzles.length === 0) return;
    if (window.confirm('Saari readings clear karein? (Nozzle IDs aur Products rahenge)')) {
      const reset = nozzles.map(n => ({
        ...n,
        openingReading: 0.0,
        closingReading: 0.0,
        testingLitres: 0.0,
        salesLitres: 0.0,
        totalAmount: 0.0,
      }));
      setNozzles(reset);
      showToast('Saari numeric readings reset ho gayi. Nozzle rows intact hain.', 'info');
    }
  }, [nozzles, setNozzles, showToast]);

  const handleCarryForward = useCallback(() => {
    if (nozzles.length === 0) return;
    const updated = nozzles.map(n => ({
      ...n,
      openingReading: n.closingReading || 0.0,
      closingReading: 0.0,
      testingLitres: 0.0,
      salesLitres: 0.0,
      totalAmount: 0.0,
    }));
    setNozzles(updated);
    showToast('Closing readings → Opening readings carry forward ho gaye!', 'success');
  }, [nozzles, setNozzles, showToast]);

  const handleFieldChange = useCallback((index, field, value) => {
    const updated = [...nozzles];
    const item = { ...updated[index] };

    if (field === 'nozzleId' || field === 'productName' || field === 'mpdId') {
      item[field] = value;
      if (field === 'productName' && globalRates[value]) {
        item.rate = globalRates[value];
      }
    } else {
      item[field] = value === '' ? '' : (parseFloat(value) || 0);
    }

    const opening = parseFloat(item.openingReading) || 0;
    const closing = parseFloat(item.closingReading) || 0;
    const testing = parseFloat(item.testingLitres) || 0;
    const rate = parseFloat(item.rate) || 0;

    const { net, totalAmount } = calculateNozzleSales(opening, closing, testing, rate);
    item.salesLitres = net;
    item.totalAmount = totalAmount;

    updated[index] = item;
    setNozzles(updated);
  }, [nozzles, globalRates, setNozzles]);

  const handleApplyGlobalRates = useCallback(() => {
    const updated = nozzles.map((n) => {
      const newRate = globalRates[n.productName] || n.rate;
      const totalAmount = n.salesLitres * newRate;
      return {
        ...n,
        rate: newRate,
        totalAmount: Number(totalAmount.toFixed(2)),
      };
    });
    setNozzles(updated);
    showToast('Saare nozzles par naye rates apply ho gaye!', 'success');
  }, [nozzles, globalRates, setNozzles, showToast]);

  // ✅ FIX: handleSaveAll — removed broken loadNozzles() call (function didn't exist)
  const handleSaveAll = async () => {
    try {
      await db.transaction('rw', db.nozzleReadings, async () => {
        const oldRecords = await db.nozzleReadings.where('date').equals(selectedDate).toArray();
        for (const r of oldRecords) {
          await db.nozzleReadings.delete(r.id);
        }

        for (const item of nozzles) {
          // Remove local-only fields before saving to DB
          const { id, _localId, ...cleanItem } = item;
          await db.nozzleReadings.add({ ...cleanItem, date: selectedDate, shiftId: activeShift });
        }
      });
      showToast('✅ Nozzle Readings save ho gaye!', 'success');
      // ✅ FIX: Reload nozzles from DB after save to get proper DB ids
      const freshNozzles = await db.nozzleReadings.where('date').equals(selectedDate).toArray();
      if (freshNozzles && freshNozzles.length > 0) {
        setNozzles(freshNozzles.map((n, idx) => ({
          ...n,
          mpdId: n.mpdId || `MPD-${Math.ceil((idx + 1) / 4)}`,
          nozzleId: n.nozzleId || `N${idx + 1}`,
          productName: n.productName || 'Motor Spirit (Petrol)',
          openingReading: parseFloat(n.openingReading) || 0,
          closingReading: parseFloat(n.closingReading) || 0,
          testingLitres: parseFloat(n.testingLitres) || 0,
          salesLitres: parseFloat(n.salesLitres) || 0,
          rate: parseFloat(n.rate) || 0,
          totalAmount: parseFloat(n.totalAmount) || 0,
        })));
      }
    } catch (err) {
      showToast('❌ Save karte waqt error: ' + err.message, 'error');
      console.error('Save nozzle error:', err);
    }
  };

  const grandTotalLitres = nozzles.reduce((sum, n) => sum + (parseFloat(n.salesLitres) || 0), 0);
  const grandTotalAmount = nozzles.reduce((sum, n) => sum + (parseFloat(n.totalAmount) || 0), 0);

  if (!dbReady) return <div className="p-8 text-center text-sm font-semibold text-slate-300">Nozzle Reading Module load ho raha hai...</div>;

  return (
    <div className="p-3.5 space-y-3 animate-fadeIn bg-[#0c121d] min-h-screen text-slate-200 font-sans">
      {/* Top Action Toolbar */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Fuel className="w-4 h-4 text-blue-400" />
          <span className="text-[13px] font-semibold text-slate-100 tracking-wide">Daily Shift Entry (Fuel Grid)</span>
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-950/60 text-blue-400 border border-blue-800/40 font-mono">
            {nozzles.length} Nozzles
          </span>
        </div>

        {/* Global Rates & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-[#0e1420] border border-[#1b2537] rounded-lg px-2.5 py-1 text-xs">
            <span className="text-[11px] font-bold text-amber-400">Diesel: ₹</span>
            <NumericInput
              step="0.01"
              value={globalRates['High Speed Diesel']}
              onChange={(val) => setGlobalRates(prev => ({ ...prev, 'High Speed Diesel': parseFloat(val) || 0 }))}
              className="w-14 bg-[#172033] border border-[#23304a] rounded px-1.5 py-0.5 font-mono font-bold text-xs text-slate-100 outline-none text-right focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[11px] font-bold text-emerald-400">Petrol: ₹</span>
            <NumericInput
              step="0.01"
              value={globalRates['Motor Spirit (Petrol)']}
              onChange={(val) => setGlobalRates(prev => ({ ...prev, 'Motor Spirit (Petrol)': parseFloat(val) || 0 }))}
              className="w-14 bg-[#172033] border border-[#23304a] rounded px-1.5 py-0.5 font-mono font-bold text-xs text-slate-100 outline-none text-right focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleApplyGlobalRates}
              className="px-2 py-0.5 rounded bg-blue-900/40 border border-blue-700/40 text-blue-300 text-[10px] font-semibold hover:bg-blue-700 hover:text-white transition-all cursor-pointer"
            >
              Apply
            </button>
          </div>

          <button type="button"
            onClick={handleCarryForward}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] hover:bg-[#1f2b45] text-slate-300 border border-[#23304a] text-xs font-semibold tracking-wide transition-all active:scale-95 cursor-pointer"
            title="Closing → Opening carry forward karein"
          >
            <ArrowRightCircle className="w-3.5 h-3.5 text-blue-400" />
            <span>Carry Forward</span>
          </button>

          <button type="button"
            onClick={handleAddNozzle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold tracking-wide transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Nozzle Add Karein</span>
          </button>

          <button type="button"
            onClick={handleSaveAll}
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md shadow-blue-900/30 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save (Ctrl+S)</span>
          </button>
        </div>
      </div>

      {/* Nozzle Table */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg overflow-hidden flex flex-col justify-between">
        {nozzles.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[#172033] text-orange-400 flex items-center justify-center mx-auto border border-[#23304a]">
              <Fuel className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-slate-100">Koi Nozzle Record Nahi Hai</h3>
              <p className="text-[12px] font-normal text-slate-400 max-w-sm mx-auto mt-0.5">
                <strong>"+ Nozzle Add Karein"</strong> button dabao naya nozzle add karne ke liye.
              </p>
            </div>
            <button type="button"
              onClick={handleAddNozzle}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold tracking-wide transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Pehla Nozzle Add Karein</span>
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse select-text">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2 text-center bg-slate-900/60 border-b border-slate-800 w-16">MPD</th>
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2 text-center bg-slate-900/60 border-b border-slate-800 w-20">NOZZLE ID</th>
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2.5 text-left bg-slate-900/60 border-b border-slate-800">FUEL PRODUCT</th>
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-900/60 border-b border-slate-800">OPENING</th>
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-900/60 border-b border-slate-800">CLOSING</th>
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-900/60 border-b border-slate-800 w-24">TESTING (L)</th>
                    <th className="text-[11px] font-bold text-blue-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-900/60 border-b border-slate-800">SALES (L)</th>
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-900/60 border-b border-slate-800 w-24">RATE (₹)</th>
                    <th className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider py-2 px-2.5 text-right bg-slate-900/60 border-b border-slate-800">TOTAL (₹)</th>
                    <th className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2 px-2 text-center bg-slate-900/60 border-b border-slate-800 w-14">DEL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {nozzles.map((item, idx) => {
                    const isDiesel = item.productName && (item.productName.includes('Diesel') || item.productName.includes('HSD'));
                    const isXP = item.productName && (item.productName.includes('XP') || item.productName.includes('Speed') || item.productName.includes('Premium'));
                    const isCNG = item.productName && item.productName.includes('CNG');

                    return (
                      <tr
                        key={item._localId || item.id || idx}
                        className="hover:bg-[#172033]/50 transition-colors duration-150"
                      >
                        {/* MPD ID */}
                        <td className="py-1.5 px-2 text-center">
                          <input
                            type="text"
                            value={item.mpdId || ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleFieldChange(idx, 'mpdId', e.target.value)}
                            className="w-14 bg-[#172033] border border-[#23304a] text-amber-400 font-bold text-xs px-1.5 py-1 rounded text-center font-mono outline-none focus:ring-1 focus:ring-amber-500"
                            placeholder="MPD-1"
                          />
                        </td>

                        {/* Nozzle ID */}
                        <td className="py-1.5 px-2 text-center">
                          <input
                            type="text"
                            value={item.nozzleId || ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleFieldChange(idx, 'nozzleId', e.target.value)}
                            className="w-16 bg-[#172033] border border-[#23304a] text-blue-400 font-bold text-xs px-1.5 py-1 rounded text-center font-mono outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>

                        {/* Fuel Product */}
                        <td className="py-1.5 px-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={isDiesel ? 'badge-hsd' : isXP ? 'badge-xp' : isCNG ? 'badge-cng' : 'badge-ms'}>
                              {isDiesel ? 'HSD' : isXP ? 'XP' : isCNG ? 'CNG' : 'MS'}
                            </span>
                            <input
                              type="text"
                              placeholder="Product Name"
                              value={item.productName || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => handleFieldChange(idx, 'productName', e.target.value)}
                              className="w-full bg-transparent border-0 text-slate-200 text-xs font-semibold outline-none"
                            />
                          </div>
                        </td>

                        {/* Opening Reading */}
                        <td className="py-1.5 px-2 text-right">
                          <NumericInput
                            step="0.1"
                            value={item.openingReading}
                            onChange={(val) => handleFieldChange(idx, 'openingReading', val)}
                            className="bg-[#172033] border border-[#23304a] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-100 font-bold text-xs px-2 py-1 rounded text-right font-mono outline-none transition-all w-28 tabular-nums"
                          />
                        </td>

                        {/* Closing Reading */}
                        <td className="py-1.5 px-2 text-right">
                          <NumericInput
                            step="0.1"
                            value={item.closingReading}
                            onChange={(val) => handleFieldChange(idx, 'closingReading', val)}
                            className="bg-[#172033] border border-[#23304a] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-100 font-bold text-xs px-2 py-1 rounded text-right font-mono outline-none transition-all w-28 tabular-nums"
                          />
                        </td>

                        {/* Testing Litres */}
                        <td className="py-1.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <NumericInput
                              step="0.1"
                              value={item.testingLitres}
                              onChange={(val) => handleFieldChange(idx, 'testingLitres', val)}
                              className="bg-[#172033] border border-[#23304a] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-300 font-semibold text-xs px-1.5 py-1 rounded text-right font-mono outline-none transition-all w-16 tabular-nums"
                            />
                            <span className="badge-testing">T</span>
                          </div>
                        </td>

                        {/* Sales Litres (Auto-calculated) */}
                        <td className="py-1.5 px-2 text-right font-mono text-[12px] font-bold text-blue-400 bg-blue-950/20 tabular-nums">
                          {(parseFloat(item.salesLitres) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                        </td>

                        {/* Rate */}
                        <td className="py-1.5 px-2 text-right">
                          <NumericInput
                            step="0.01"
                            value={item.rate}
                            onChange={(val) => handleFieldChange(idx, 'rate', val)}
                            className="bg-[#172033] border border-[#23304a] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-amber-400 font-bold text-xs px-2 py-1 rounded text-right font-mono outline-none transition-all w-20 tabular-nums"
                          />
                        </td>

                        {/* Total Amount (Auto-calculated) */}
                        <td className="py-1.5 px-2.5 text-right font-mono text-[12px] font-bold text-emerald-400 bg-emerald-950/20 tabular-nums">
                          ₹{(parseFloat(item.totalAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Delete Button */}
                        <td className="py-1.5 px-2 text-center">
                          <button type="button"
                            onClick={() => handleDeleteNozzle(idx)}
                            title="Is nozzle ko hatayein"
                            className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totalizer Strip */}
            <div className="bg-[#0f1726] border-t border-[#1e293b] p-2.5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button"
                  onClick={handleClearAll}
                  className="px-3 py-1 rounded bg-[#172033] border border-[#23304a] text-rose-400 hover:bg-rose-950/40 text-xs font-medium transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Readings Reset Karein</span>
                </button>

                <span className="text-slate-400 text-[11px] font-mono">
                  • {nozzles.length} Nozzles Active
                </span>
              </div>

              <div className="flex items-center gap-5">
                <div className="text-right flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-400 uppercase">Volume Sold:</span>
                  <span className="font-mono text-[13px] font-semibold text-blue-400">
                    {grandTotalLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                  </span>
                </div>

                <div className="text-right flex items-center gap-2 bg-[#0e1420] border border-[#1b2537] rounded-lg px-3 py-1">
                  <span className="text-[11px] font-medium text-slate-400 uppercase">Total Amount:</span>
                  <span className="text-emerald-400 font-bold font-mono text-[13px] flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                    ₹{grandTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
