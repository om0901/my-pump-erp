import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Download,
  Save,
  Edit2,
  X,
  Calendar
} from 'lucide-react';
import NumericInput from '../common/NumericInput';

export default function StockManagement() {
  const {
    selectedDate,
    setSelectedDate,
    showToast,
    fuelStockState = {},
    stockLedgerHistory = {},
    setStockLedgerHistory,
    updateReceivedStock
  } = useApp();
  const [tanks, setTanks] = useState([]);
  const [activeTankId, setActiveTankId] = useState(null);
  const [tankLedgers, setTankLedgers] = useState({}); // Per-tank dictionary state: { [tankId]: [rows] }
  const [loading, setLoading] = useState(false);

  // Modal States
  const [showAddTankModal, setShowAddTankModal] = useState(false);
  const [showEditTankModal, setShowEditTankModal] = useState(false);

  const [newTank, setNewTank] = useState({
    tankName: '',
    productType: 'High Speed Diesel',
  });

  const [editTank, setEditTank] = useState({
    tankName: '',
    productType: '',
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const latestLiveVolumesRef = useRef({});



  // 1. Initial Tank Sheets Setup
  useEffect(() => {
    loadTanks(true);
  }, []);

  // 2. Real-Time (Live) Fuel Sales Listener from Daily Entry (SHIFT DISPENSED VOLUME -> SALES L)
  useEffect(() => {
    const handleLiveSalesUpdate = (e) => {
      const { date: updateDate, volumes } = e.detail || {};
      if (!updateDate || !volumes) return;

      latestLiveVolumesRef.current[updateDate] = volumes;

      setTankLedgers(prev => {
        let hasAnyChange = false;
        const nextLedgers = { ...prev };

        tanks.forEach(tank => {
          const tankName = (tank.tankName || '').toUpperCase();
          let targetVol = null;

          if (tankName.includes('PETROL') || tankName.includes('MS')) {
            targetVol = volumes['PETROL (MS)'];
          } else if (tankName.includes('DIESEL') || tankName.includes('HSD')) {
            targetVol = volumes['DIESEL (HSD)'];
          } else if (tankName.includes('SMART') || tankName.includes('SPEED') || tankName.includes('XP')) {
            targetVol = volumes['SMART FUEL'];
          }

          if (targetVol === undefined || targetVol === null) return;
          const salesLitres = Number(parseFloat(targetVol).toFixed(2)) || 0;

          const existingRows = nextLedgers[tank.id] || [];
          const rowIndex = existingRows.findIndex(r => r.date === updateDate);

          if (rowIndex >= 0) {
            const currentRow = existingRows[rowIndex];
            if (currentRow.sellStock !== salesLitres) {
              const op = parseFloat(currentRow.openingStock || 0);
              const rec = parseFloat(currentRow.receiveStock || 0);
              const total = op + rec;
              const closing = total - salesLitres;

              const updatedRow = {
                ...currentRow,
                sellStock: salesLitres,
                totalStock: Number(total.toFixed(2)),
                closingStock: Number(closing.toFixed(2)),
                updatedAt: new Date().toISOString()
              };

              const newRows = [...existingRows];
              newRows[rowIndex] = updatedRow;
              nextLedgers[tank.id] = newRows;
              hasAnyChange = true;

              if (updatedRow.id) {
                db.tankLedger.put(updatedRow).catch(err => console.error('Error saving live tank cell:', err));
              }
            }
          } else {
            // Row for updateDate does not exist yet -> create and inherit openingStock from previous day
            const prevRows = existingRows
              .filter(r => r.date < updateDate)
              .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
            const lastRecordedRow = prevRows.length > 0 ? prevRows[0] : (existingRows.length > 0 ? existingRows[existingRows.length - 1] : null);

            const previousClosing = lastRecordedRow ? parseFloat(lastRecordedRow.closingStock) : 0;
            const newOpeningStock = !isNaN(previousClosing) && previousClosing > 0
              ? previousClosing
              : (parseFloat(tank.initialCapacity || tank.capacityLitres) || 0);

            const op = Number(newOpeningStock.toFixed(2));
            const total = op + 0;
            const closing = total - salesLitres;

            const newRow = {
              tankId: tank.id,
              date: updateDate,
              openingStock: op,
              receiveStock: 0,
              totalStock: Number(total.toFixed(2)),
              sellStock: salesLitres,
              closingStock: Number(closing.toFixed(2)),
              isFinalized: false,
              createdAt: new Date().toISOString()
            };

            db.tankLedger.add(newRow).then(newId => {
              newRow.id = newId;
            }).catch(console.error);

            const sortedNewRows = [...existingRows, newRow].sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
            nextLedgers[tank.id] = sortedNewRows;
            hasAnyChange = true;
          }
        });

        return hasAnyChange ? nextLedgers : prev;
      });
    };

    window.addEventListener('live_fuel_sales_update', handleLiveSalesUpdate);
    return () => window.removeEventListener('live_fuel_sales_update', handleLiveSalesUpdate);
  }, [tanks]);

  // 3. Listener for Cross-Module Finalized Sync Events
  useEffect(() => {
    let isMounted = true;
    const handleStockSync = () => {
      if (!isMounted) return;
      loadTanks(false);
      if (activeTankId) {
        ensureDateRowAndLoad(activeTankId, selectedDate);
      }
    };
    window.addEventListener('stock_patrak_updated', handleStockSync);
    window.addEventListener('stock_patrak_sync', handleStockSync);
    return () => {
      isMounted = false;
      window.removeEventListener('stock_patrak_updated', handleStockSync);
      window.removeEventListener('stock_patrak_sync', handleStockSync);
    };
  }, [activeTankId, selectedDate]);

  // 4. Ensure Date Row and Load Ledger whenever activeTankId or selectedDate changes
  useEffect(() => {
    if (activeTankId && selectedDate) {
      ensureDateRowAndLoad(activeTankId, selectedDate);
    }
  }, [activeTankId, selectedDate]);

  const loadTanks = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const requiredSheets = [
      { id: 1, tankName: 'PETROL (MS)', productType: 'Motor Spirit (MS)' },
      { id: 2, tankName: 'DIESEL (HSD)', productType: 'High Speed Diesel (HSD)' },
      { id: 3, tankName: 'SMART FUEL', productType: 'Smart Fuel' },
    ];

    try {
      let tankList = await db.tanks.toArray();
      if (!tankList || tankList.length === 0) {
        tankList = [];
        for (const sheet of requiredSheets) {
          const id = await db.tanks.add({ tankName: sheet.tankName, productType: sheet.productType, initialCapacity: 0 }).catch(() => sheet.id);
          tankList.push({ id, ...sheet });
        }
      }
      setTanks(tankList);
      if (tankList.length > 0) {
        setActiveTankId(prev => (prev && tankList.find(t => t.id === prev) ? prev : tankList[0].id));
      }
    } catch (e) {
      setTanks(requiredSheets);
      setActiveTankId(prev => prev || 1);
    }
    if (showSpinner) setLoading(false);
  };

  const loadLedgerForTank = async (tankId, targetDate = selectedDate) => {
    if (!tankId) return;
    let ledgerRecords = await db.tankLedger.where('tankId').equals(tankId).toArray();
    ledgerRecords = ledgerRecords.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);

    const targetTank = tanks.find(t => t.id === tankId);
    const tankName = (targetTank?.tankName || '').toUpperCase();

    // 1. If ledger is completely empty, initialize first row
    if (ledgerRecords.length === 0) {
      let initSales = 0;
      const cachedVols = latestLiveVolumesRef.current?.[targetDate];
      if (cachedVols) {
        if (tankName.includes('PETROL') || tankName.includes('MS')) initSales = cachedVols['PETROL (MS)'] || 0;
        else if (tankName.includes('DIESEL') || tankName.includes('HSD')) initSales = cachedVols['DIESEL (HSD)'] || 0;
        else if (tankName.includes('SMART') || tankName.includes('SPEED') || tankName.includes('XP')) initSales = cachedVols['SMART FUEL'] || 0;
      }

      const startingStock = parseFloat(targetTank?.initialCapacity || targetTank?.capacityLitres) || 0;
      const initialRow = {
        tankId,
        date: targetDate,
        openingStock: startingStock,
        receiveStock: 0,
        totalStock: startingStock,
        sellStock: initSales,
        closingStock: Number((startingStock - initSales).toFixed(2)),
        isFinalized: false,
        createdAt: new Date().toISOString()
      };
      const newId = await db.tankLedger.add(initialRow);
      initialRow.id = newId;
      ledgerRecords = [initialRow];
    } else {
      // 2. Check if a row exists for targetDate
      let targetRow = ledgerRecords.find(r => r.date === targetDate);

      // If targetDate does NOT exist in ledger, create it inheriting previous day's closing stock
      if (!targetRow && targetDate) {
        const prevRows = ledgerRecords
          .filter(r => r.date < targetDate)
          .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
        const lastRecordedRow = prevRows.length > 0 ? prevRows[0] : ledgerRecords[ledgerRecords.length - 1];

        const previousClosing = lastRecordedRow ? parseFloat(lastRecordedRow.closingStock) : 0;
        const newOpeningStock = !isNaN(previousClosing) && previousClosing > 0
          ? previousClosing
          : (parseFloat(targetTank?.initialCapacity || targetTank?.capacityLitres) || 0);

        let initSales = 0;
        const cachedVols = latestLiveVolumesRef.current?.[targetDate];
        if (cachedVols) {
          if (tankName.includes('PETROL') || tankName.includes('MS')) initSales = cachedVols['PETROL (MS)'] || 0;
          else if (tankName.includes('DIESEL') || tankName.includes('HSD')) initSales = cachedVols['DIESEL (HSD)'] || 0;
          else if (tankName.includes('SMART') || tankName.includes('SPEED') || tankName.includes('XP')) initSales = cachedVols['SMART FUEL'] || 0;
        }

        const op = Number(newOpeningStock.toFixed(2));
        const total = op + 0;
        const closing = total - initSales;

        const newRow = {
          tankId,
          date: targetDate,
          openingStock: op,
          receiveStock: 0,
          totalStock: Number(total.toFixed(2)),
          sellStock: initSales,
          closingStock: Number(closing.toFixed(2)),
          isFinalized: false,
          createdAt: new Date().toISOString()
        };

        const newId = await db.tankLedger.add(newRow);
        newRow.id = newId;
        ledgerRecords.push(newRow);
        ledgerRecords.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
      } else if (targetRow && !targetRow.isFinalized) {
        // Self-heal: If unfinalized row was previously contaminated with hardcoded 10,000 opening stock, recover previous closing
        const prevRows = ledgerRecords
          .filter(r => r.date < targetDate)
          .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
        const lastRecordedRow = prevRows.length > 0 ? prevRows[0] : null;
        if (lastRecordedRow) {
          const previousClosing = parseFloat(lastRecordedRow.closingStock) || 0;
          if (previousClosing > 0 && targetRow.openingStock === 10000 && previousClosing !== 10000) {
            const op = previousClosing;
            const rec = parseFloat(targetRow.receiveStock) || 0;
            const sell = parseFloat(targetRow.sellStock) || 0;
            const total = op + rec;
            const closing = total - sell;
            targetRow.openingStock = op;
            targetRow.totalStock = Number(total.toFixed(2));
            targetRow.closingStock = Number(closing.toFixed(2));
            await db.tankLedger.update(targetRow.id, {
              openingStock: op,
              totalStock: Number(total.toFixed(2)),
              closingStock: Number(closing.toFixed(2))
            });
          }
        }
      }
    }

    setTankLedgers(prev => ({
      ...prev,
      [tankId]: ledgerRecords
    }));
  };

  const ensureDateRowAndLoad = loadLedgerForTank;

  const handleAddTankSubmit = async (e) => {
    e.preventDefault();
    try {
      const tankRecord = {
        tankName: newTank.tankName || 'Fuel Tank',
        productType: newTank.productType || 'Diesel',
      };

      const newId = await db.tanks.add(tankRecord);

      const initialRow = {
        tankId: newId,
        date: selectedDate,
        openingStock: 0,
        receiveStock: 0,
        totalStock: 0,
        sellStock: 0,
        closingStock: 0,
      };
      const rowId = await db.tankLedger.add(initialRow);
      initialRow.id = rowId;

      setTankLedgers(prev => ({
        ...prev,
        [newId]: [initialRow]
      }));

      showToast(`Created Tank Sheet: ${tankRecord.tankName}`, 'success');
      setShowAddTankModal(false);
      setNewTank({ tankName: '', productType: 'High Speed Diesel' });

      await loadTanks();
      setActiveTankId(newId);
    } catch (err) {
      showToast('Error adding tank: ' + err.message, 'error');
    }
  };

  const handleEditTankSubmit = async (e) => {
    e.preventDefault();
    if (!activeTankId) return;
    try {
      await db.tanks.update(activeTankId, {
        tankName: editTank.tankName,
        productType: editTank.productType,
      });
      showToast('Tank details updated!', 'success');
      setShowEditTankModal(false);
      loadTanks();
    } catch (err) {
      showToast('Error editing tank: ' + err.message, 'error');
    }
  };

  const handleDeleteTank = async (tankId) => {
    const target = tanks.find(t => t.id === tankId);
    if (!target) return;

    if (window.confirm(`Are you sure you want to delete the "${target.tankName}" Excel Sheet and all its ledger records?`)) {
      try {
        await db.tanks.delete(tankId);
        const relatedLedgers = await db.tankLedger.where('tankId').equals(tankId).toArray();
        for (const l of relatedLedgers) {
          await db.tankLedger.delete(l.id);
        }

        setTankLedgers(prev => {
          const copy = { ...prev };
          delete copy[tankId];
          return copy;
        });

        showToast(`Deleted ${target.tankName} sheet`, 'info');
        loadTanks();
      } catch (err) {
        showToast('Error deleting tank: ' + err.message, 'error');
      }
    }
  };

  const activeTank = tanks.find(t => t.id === activeTankId);

  const activeProductKey = activeTank ? (
    (activeTank.tankName || '').toUpperCase().includes('PETROL') || (activeTank.tankName || '').toUpperCase().includes('MS') ? 'PETROL (MS)' :
    (activeTank.tankName || '').toUpperCase().includes('DIESEL') || (activeTank.tankName || '').toUpperCase().includes('HSD') ? 'DIESEL (HSD)' :
    'SMART FUEL'
  ) : 'PETROL (MS)';

  const liveState = fuelStockState?.[activeProductKey];
  const inMemoryRows = stockLedgerHistory?.[activeProductKey] || [];
  const dbRows = (activeTankId && tankLedgers[activeTankId]) ? tankLedgers[activeTankId] : [];
  const baseRows = inMemoryRows.length > 0 ? inMemoryRows : dbRows;

  const rows = baseRows.map(r => {
    if (r.date === selectedDate && liveState) {
      const liveSales = liveState.salesLitres ?? (parseFloat(r.sellStock) || 0);
      const total = (parseFloat(r.openingStock) || 0) + (parseFloat(r.receiveStock) || 0);
      const closing = total - liveSales;
      return {
        ...r,
        salesLitres: liveSales,
        sellStock: liveSales,
        totalStock: Number(total.toFixed(2)),
        closingStock: Number(closing.toFixed(2))
      };
    }
    return r;
  });

  const handleAddRow = async () => {
    if (!activeTankId) return;

    const existing = rows.length > 0 ? rows : (tankLedgers[activeTankId] || []);
    const lastRow = existing.length > 0 ? existing[existing.length - 1] : null;
    const carryOpening = lastRow ? (parseFloat(lastRow.closingStock) || 0) : (parseFloat(activeTank?.initialCapacity) || 10000);

    let nextDate = selectedDate;
    if (lastRow && lastRow.date) {
      try {
        const [y, m, d] = lastRow.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        dateObj.setDate(dateObj.getDate() + 1);
        const nextY = dateObj.getFullYear();
        const nextM = String(dateObj.getMonth() + 1).padStart(2, '0');
        const nextD = String(dateObj.getDate()).padStart(2, '0');
        nextDate = `${nextY}-${nextM}-${nextD}`;
      } catch (e) {
        nextDate = selectedDate;
      }
    }

    const newRow = {
      id: Date.now() + Math.random(),
      tankId: activeTankId,
      date: nextDate,
      openingStock: Number(carryOpening.toFixed(2)),
      receiveStock: 0,
      totalStock: Number(carryOpening.toFixed(2)),
      sellStock: 0,
      closingStock: Number(carryOpening.toFixed(2)),
    };

    try {
      const newId = await db.tankLedger.add(newRow);
      if (newId) newRow.id = newId;
    } catch (e) {}

    const updated = [...existing, newRow];
    setTankLedgers(prev => ({
      ...prev,
      [activeTankId]: updated
    }));

    if (setStockLedgerHistory) {
      setStockLedgerHistory(prev => ({
        ...prev,
        [activeProductKey]: updated
      }));
    }

    showToast('Added new ledger row with Auto-Carry Forward Opening Stock!', 'info');
  };

  const handleDeleteRow = async (index) => {
    if (!activeTankId) return;
    const existing = rows.length > 0 ? rows : (tankLedgers[activeTankId] || []);
    const target = existing[index];
    if (target && target.id) {
      try {
        await db.tankLedger.delete(target.id);
      } catch (e) {}
    }
    const updated = existing.filter((_, i) => i !== index);
    setTankLedgers(prev => ({
      ...prev,
      [activeTankId]: updated
    }));
    if (setStockLedgerHistory) {
      setStockLedgerHistory(prev => ({
        ...prev,
        [activeProductKey]: updated
      }));
    }
    showToast('Row removed', 'info');
  };

  const handleCellChange = (index, field, value) => {
    if (!activeTankId) return;
    const existing = [...rows];
    const item = { ...existing[index] };

    if (field === 'date') {
      item[field] = value;
    } else {
      item[field] = value === '' ? '' : (parseFloat(value) || 0);
    }

    const op = parseFloat(item.openingStock) || 0;
    const rec = parseFloat(item.receiveStock) || 0;
    const sell = parseFloat(item.sellStock) || 0;

    const total = op + rec;
    const closing = total - sell;

    item.totalStock = Number(total.toFixed(2));
    item.closingStock = Number(closing.toFixed(2));

    existing[index] = item;

    setTankLedgers(prev => ({
      ...prev,
      [activeTankId]: existing
    }));

    if (setStockLedgerHistory) {
      setStockLedgerHistory(prev => ({
        ...prev,
        [activeProductKey]: existing
      }));
    }

    if (field === 'receiveStock' && updateReceivedStock) {
      updateReceivedStock(activeProductKey, rec);
    }

    if (item.id) {
      try {
        db.tankLedger.put(item).catch(() => {});
      } catch (err) {}
    }
  };

  const handleSaveSheet = async () => {
    showToast('Saved Excel Tank Sheet to in-memory state & database!', 'success');
    if (!activeTankId) return;
    try {
      await db.transaction('rw', db.tankLedger, async () => {
        for (const r of rows) {
          if (r.id) {
            await db.tankLedger.put(r);
          } else {
            const newId = await db.tankLedger.add(r);
            r.id = newId;
          }
        }
      });
    } catch (err) {
      console.warn('DB persistence skipped in simulation mode:', err);
    }
  };

  const handleExportCSV = () => {
    const currentTank = tanks.find(t => t.id === activeTankId);
    if (!currentTank || rows.length === 0) return;

    let csvContent = `DATE,OPENING STOCK (L),RECEIVED STOCK (L),TOTAL STOCK (L),SALES (L),CLOSING STOCK (L)\n`;

    rows.forEach(r => {
      csvContent += `"${r.date}",${r.openingStock},${r.receiveStock},${r.totalStock},${r.sellStock},${r.closingStock}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `MY_PUMP_${currentTank.tankName.replace(/\s+/g, '_')}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported Tank Sheet to CSV spreadsheet!', 'success');
  };

  const selectedDateRow = rows.find(r => r.date === selectedDate) || (liveState ? {
    tankId: activeTankId,
    date: selectedDate,
    openingStock: liveState.openingStock,
    receiveStock: liveState.receivedStock,
    totalStock: liveState.totalStock,
    sellStock: liveState.salesLitres,
    closingStock: liveState.closingStock
  } : null);

  const totalReceived = rows.reduce((acc, r) => acc + (parseFloat(r.receiveStock) || 0), 0);
  const totalSold = rows.reduce((acc, r) => acc + (parseFloat(r.sellStock) || 0), 0);
  const currentAvailableStock = rows.length > 0 ? (rows[rows.length - 1].closingStock || 0) : (liveState?.closingStock || 10000);

  if (loading) return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading Stock Patrak...</div>;

  return (
    <div className="p-3.5 space-y-3 animate-fadeIn bg-[#0c121d] min-h-screen select-text text-slate-200 font-sans">
      {/* Top Action Toolbar & Universal Date Selector */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        {/* Tank Tabs Bar */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 lg:pb-0 select-none">
          {tanks.map((tank) => {
            const isActive = tank.id === activeTankId;
            return (
              <div
                key={tank.id}
                onClick={() => setActiveTankId(tank.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 border-l-2 border-blue-600 font-bold shadow-xs dark:bg-[#192438] dark:text-white dark:border-blue-500'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold border border-slate-300 dark:bg-[#0e1420] dark:hover:bg-[#131b29] dark:text-slate-300 dark:border-[#1b2537]'
                }`}
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`} />
                <span className="font-bold">{tank.tankName}</span>
                <span className={`text-[10px] font-mono ${isActive ? 'text-blue-700 dark:text-blue-200 font-semibold' : 'text-slate-600 dark:text-slate-400 font-medium'}`}>
                  ({tank.productType})
                </span>
              </div>
            );
          })}
        </div>

        {/* Universal Date Picker & Sheet Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Universal Prominent Date Selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-900 dark:text-slate-100 font-semibold text-xs outline-none cursor-pointer"
            />
          </div>

          {activeTank && (
            <>
              <button type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] hover:bg-slate-50 dark:hover:bg-[#1f2b45] text-slate-800 dark:text-slate-300 font-semibold text-xs transition-all active:scale-95 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button type="button"
                onClick={handleSaveSheet}
                className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md shadow-blue-900/30 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save (Ctrl+S)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selected Date Metric Highlights Banner */}
      {selectedDateRow && (
        <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-md p-3">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#1e293b]/80">
            <div className="flex items-center gap-2">
              <span className="text-xs">📅</span>
              <span className="text-[12px] font-bold text-slate-200">
                {activeTank?.tankName} — Daily Record for <span className="font-mono text-blue-400">{selectedDate}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">OPENING STOCK</span>
              <span className="text-sm font-mono font-bold text-slate-100 tabular-nums">
                {(selectedDateRow.openingStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
              </span>
            </div>

            <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg text-right">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block text-left">RECEIVED STOCK</span>
              <span className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
                +{(selectedDateRow.receiveStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
              </span>
            </div>

            <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg text-right">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block text-left">TOTAL STOCK</span>
              <span className="text-sm font-mono font-bold text-blue-400 tabular-nums">
                {(selectedDateRow.totalStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
              </span>
            </div>

            <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg text-right">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block text-left">
                SALES (L)
              </span>
              <span className="text-sm font-mono font-bold text-rose-400 tabular-nums">
                -{(selectedDateRow.sellStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
              </span>
            </div>

            <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg text-right">
              <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block text-left">CLOSING STOCK</span>
              <span className="text-sm font-mono font-bold text-emerald-300 tabular-nums">
                {(selectedDateRow.closingStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Excel Sheet View Container */}
      {tanks.length === 0 ? (
        <div className="bg-white dark:bg-[#121927] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-lg p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#172033] text-orange-500 flex items-center justify-center mx-auto border border-slate-200 dark:border-[#23304a]">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-slate-900 dark:text-slate-100">No Tank Sheets Configured Yet</h3>
            <p className="text-[12px] font-normal text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-0.5">
              Click the <strong>"+ Add Tank"</strong> button to create your first multi-tab Excel tank ledger.
            </p>
          </div>
          <button type="button"
            onClick={() => setShowAddTankModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add First Tank Sheet</span>
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#121927] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-lg overflow-hidden space-y-3 p-3.5">
          {/* Excel Grid Header & Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1e293b]">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/60">
                  <th className="text-[11px] font-bold text-slate-900 dark:text-slate-300 uppercase tracking-wider py-2 px-2 text-center bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800 w-12 font-mono">#</th>
                  <th className="text-[11px] font-bold text-slate-900 dark:text-slate-300 uppercase tracking-wider py-2 px-2.5 text-left bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800">DATE</th>
                  <th className="text-[11px] font-bold text-slate-900 dark:text-slate-300 uppercase tracking-wider py-2 px-2 text-right bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800">OPENING STOCK (L)</th>
                  <th className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800">RECEIVED STOCK (L)</th>
                  <th className="text-[11px] font-bold text-blue-900 dark:text-blue-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800">TOTAL STOCK (L)</th>
                  <th className="text-[11px] font-bold text-rose-800 dark:text-rose-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800">SALES (L)</th>
                  <th className="text-[11px] font-bold text-emerald-950 dark:text-emerald-400 uppercase tracking-wider py-2 px-2 text-right bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800">CLOSING STOCK (L)</th>
                  <th className="text-[11px] font-bold text-slate-900 dark:text-slate-300 uppercase tracking-wider py-2 px-2 text-center bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-800 w-14">ACTION</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-[#1e293b] select-text">
                {rows.map((row, idx) => {
                  const isSelected = row.date === selectedDate;
                  return (
                    <tr
                      key={row.id || `tank-row-${idx}`}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 dark:bg-blue-950/40 border-l-4 border-l-blue-600 dark:border-l-blue-500 font-semibold shadow-xs'
                          : 'hover:bg-slate-50 dark:hover:bg-[#172033]/50'
                      }`}
                    >
                      {/* Row Index */}
                      <td className="py-1.5 px-2 text-center text-slate-700 dark:text-slate-400 font-mono text-xs font-semibold">
                        {idx + 1}
                      </td>

                      {/* Date Input */}
                      <td className="py-1.5 px-2.5">
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => handleCellChange(idx, 'date', e.target.value)}
                          className="bg-white dark:bg-[#172033] border border-slate-400/80 dark:border-[#23304a] rounded px-2 py-1 font-mono text-xs font-bold text-black dark:text-slate-100 outline-none focus:border-blue-600 dark:focus:border-blue-500"
                        />
                      </td>

                    {/* Opening Stock (Editable / Auto-Carried) */}
                    <td className="py-1.5 px-2 text-right">
                      <NumericInput
                        step="0.1"
                        value={row.openingStock}
                        onChange={(val) => handleCellChange(idx, 'openingStock', val)}
                        className="bg-white dark:bg-[#172033] border border-slate-400/80 dark:border-[#23304a] focus:border-blue-600 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-black font-bold dark:text-slate-100 text-xs px-2 py-1 rounded text-right font-mono outline-none transition-all w-28 tabular-nums placeholder:text-slate-500 dark:placeholder:text-slate-500"
                      />
                    </td>

                    {/* Receive Stock (Inward Tanker Purchase) */}
                    <td className="py-1.5 px-2 text-right">
                      <NumericInput
                        step="0.1"
                        value={row.receiveStock}
                        onChange={(val) => handleCellChange(idx, 'receiveStock', val)}
                        className="bg-white dark:bg-[#172033] border border-slate-400/80 dark:border-[#23304a] focus:border-emerald-600 dark:focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-emerald-800 font-bold dark:text-emerald-400 text-xs px-2 py-1 rounded text-right font-mono outline-none transition-all w-28 tabular-nums"
                      />
                    </td>

                    {/* Total (Auto-calculated B+C) */}
                    <td className="py-1.5 px-2 text-right">
                      <span className="inline-block py-1 px-2 font-mono text-[12px] font-bold rounded tabular-nums bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                        {(row.totalStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                      </span>
                    </td>

                    {/* Sell Stock (Dispensed E) */}
                    <td className="py-1.5 px-2 text-right">
                      <NumericInput
                        step="0.1"
                        value={row.sellStock}
                        onChange={(val) => handleCellChange(idx, 'sellStock', val)}
                        className="bg-white dark:bg-[#172033] border border-slate-400/80 dark:border-[#23304a] focus:border-rose-600 dark:focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-800 font-bold dark:text-rose-400 text-xs px-2 py-1 rounded text-right font-mono outline-none transition-all w-28 tabular-nums"
                      />
                    </td>

                    {/* Closing Stock (Auto-calculated D-E) */}
                    <td className="py-1.5 px-2 text-right">
                      <span className="inline-block py-1 px-2 font-mono text-[12px] font-bold rounded tabular-nums bg-emerald-100 text-emerald-950 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                        {(row.closingStock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-1.5 px-2 text-center">
                      <button type="button"
                        onClick={() => handleDeleteRow(idx)}
                        title="Delete Row"
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

          {/* Excel Controls Footer & Stock Summary Metrics */}
          <div className="bg-slate-100 dark:bg-[#0e1420] rounded-lg border border-slate-300 dark:border-[#1b2537] p-2.5 flex flex-col md:flex-row items-center justify-between gap-3 font-mono text-xs text-slate-800 dark:text-slate-300">
            {/* Add Row Button */}
            <div className="flex items-center gap-2.5">
              <button type="button"
                onClick={handleAddRow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer dark:bg-[#192438] dark:hover:bg-[#202f4a] dark:text-blue-400 dark:border-blue-500/40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Row (Carry Forward)</span>
              </button>
              <span className="text-slate-700 font-semibold dark:text-slate-400 text-[11px]">
                • {rows.length} Ledger Rows
              </span>
            </div>

            {/* Right Stock Summary Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-xs">
                <span className="text-[11px] text-slate-700 font-sans font-bold uppercase dark:text-slate-400">Received:</span>
                <span className="text-xs font-bold text-emerald-800 font-mono dark:text-emerald-400">+{totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
              </div>

              <div className="bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-xs">
                <span className="text-[11px] text-slate-700 font-sans font-bold uppercase dark:text-slate-400">Sold:</span>
                <span className="text-xs font-bold text-rose-800 font-mono dark:text-rose-400">-{totalSold.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
              </div>

              <div className="bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-xs">
                <span className="text-[11px] text-slate-700 font-sans font-bold uppercase dark:text-slate-400">Available:</span>
                <span className="text-xs font-bold text-blue-900 font-mono dark:text-blue-400">{currentAvailableStock.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tank Sheet Modal */}
      {showAddTankModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-base font-extrabold text-slate-900">Add New Excel Tank Sheet Tab</h3>
              <button type="button" onClick={() => setShowAddTankModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddTankSubmit(e); }} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Tank Name / Identifier</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Diesel Tank 1, Petrol Main, Power Petrol"
                  value={newTank.tankName}
                  onChange={(e) => setNewTank({ ...newTank, tankName: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Fuel Product Type</label>
                <input
                  type="text"
                  placeholder="e.g., High Speed Diesel, Motor Spirit (Petrol), XP Speed, CNG"
                  value={newTank.productType}
                  onChange={(e) => setNewTank({ ...newTank, productType: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddTankModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-bold shadow-md transition-all active:scale-95"
                >
                  Create Tank Sheet Tab
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tank Sheet Modal */}
      {showEditTankModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-base font-extrabold text-slate-900">Edit Tank Sheet Details</h3>
              <button type="button" onClick={() => setShowEditTankModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleEditTankSubmit(e); }} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Tank Name</label>
                <input
                  type="text"
                  required
                  value={editTank.tankName}
                  onChange={(e) => setEditTank({ ...editTank, tankName: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Fuel Product Type</label>
                <input
                  type="text"
                  value={editTank.productType}
                  onChange={(e) => setEditTank({ ...editTank, productType: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditTankModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-bold shadow-md transition-all active:scale-95"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
