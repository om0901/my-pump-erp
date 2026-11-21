import { db } from './database';

// --- DAY-WISE SHIFT ARCHIVE & AUTOMATIC CARRY-FORWARD STORAGE ENGINE ---

// Retrieve complete Day-Wise Shifts Archive dictionary from IndexedDB & localStorage
export async function getDailyShiftsArchive() {
  try {
    const rec = await db.settings.get('my_pump_daily_shifts_archive');
    if (rec && rec.data && typeof rec.data === 'object') {
      return rec.data;
    }
    const local = localStorage.getItem('my_pump_daily_shifts_archive');
    if (local) {
      return JSON.parse(local);
    }
  } catch (err) {
    console.error('Error loading daily shifts archive:', err);
  }
  return {};
}

// Helper to compute clean short shift key: DAY or NIGHT
function toShortShiftTag(shiftType) {
  const s = (shiftType || '').toLowerCase();
  if (s.includes('night')) return 'NIGHT';
  return 'DAY';
}

// Save a shift snapshot into Day-Wise Shifts Archive
export async function saveShiftSnapshotToArchive(snapshot) {
  if (!snapshot || !snapshot.date) return;
  const shiftTag = toShortShiftTag(snapshot.shiftType);
  const archiveKey = `${snapshot.date}_${shiftTag}`;
  const shiftKey = `${snapshot.date}_${snapshot.shiftType || 'Day Shift'}`;
  const nowIso = new Date().toISOString();

  try {
    const archive = await getDailyShiftsArchive();
    const isLockedShift = Boolean(snapshot.status === 'LOCKED' || snapshot.isLocked === true);
    const enriched = {
      ...snapshot,
      archiveKey,
      shiftTag,
      status: isLockedShift ? 'LOCKED' : (snapshot.status || 'DRAFT'),
      savedAt: nowIso
    };

    archive[shiftKey] = enriched;
    archive[archiveKey] = enriched;

    await db.settings.put({
      key: 'my_pump_daily_shifts_archive',
      data: archive,
      updatedAt: nowIso
    });
    localStorage.setItem('my_pump_daily_shifts_archive', JSON.stringify(archive));

    // 1. Persist into db.shift_archives table (Dexie Version 12)
    try {
      if (db.shift_archives) {
        await db.shift_archives.put({
          archiveKey,
          date: snapshot.date,
          shiftType: snapshot.shiftType || 'Day Shift',
          status: isLockedShift ? 'LOCKED' : (snapshot.status || 'DRAFT'),
          savedAt: nowIso,
          snapshot: enriched
        });
      }
    } catch (e) {
      console.warn('db.shift_archives table write skipped:', e);
    }

    // 2. Persist into db.shifts table
    try {
      const existingShift = await db.shifts.where({ date: snapshot.date, shiftType: snapshot.shiftType || 'Day Shift' }).first();
      if (existingShift) {
        await db.shifts.update(existingShift.id, { ...enriched, savedAt: nowIso });
      } else {
        await db.shifts.add({ ...enriched, savedAt: nowIso });
      }
    } catch (e) {
      console.warn('db.shifts table write skipped:', e);
    }

    if (isLockedShift) {
      window.dispatchEvent(new CustomEvent('daily_shift_archived', { detail: { date: snapshot.date, shiftType: snapshot.shiftType } }));
    }
  } catch (err) {
    console.error('Error saving shift snapshot to archive:', err);
  }
}

// Helper to get archived snapshot for a specific date and shift
export async function getShiftSnapshotForDate(targetDate, shiftType = 'Day Shift (Morning 6am - 6pm)') {
  if (!targetDate) return { snapshot: null, isExact: false };
  const shiftTag = toShortShiftTag(shiftType);
  const canonicalKey = `${targetDate}_${shiftTag}`;

  // 1. Check db.shift_archives table first (Dexie v12)
  try {
    if (db.shift_archives) {
      const rec = await db.shift_archives.get(canonicalKey);
      if (rec && rec.snapshot) {
        return { snapshot: rec.snapshot, isExact: true };
      }
      // Check any shift for this date
      const dateRecords = await db.shift_archives.where('date').equals(targetDate).toArray();
      if (dateRecords && dateRecords.length > 0) {
        const match = dateRecords.find(r => toShortShiftTag(r.shiftType) === shiftTag) || dateRecords[0];
        if (match && match.snapshot) {
          return { snapshot: match.snapshot, isExact: true };
        }
      }
    }
  } catch (err) {
    console.warn('db.shift_archives read check skipped:', err);
  }

  // 2. Check settings archive
  const archive = await getDailyShiftsArchive();
  const exactKey = `${targetDate}_${shiftType}`;
  if (archive[exactKey]) {
    return { snapshot: archive[exactKey], isExact: true };
  }
  if (archive[canonicalKey]) {
    return { snapshot: archive[canonicalKey], isExact: true };
  }
  // Fallback to date key if shiftName varies
  const matchingDateKey = Object.keys(archive).find(k => k.startsWith(targetDate));
  if (matchingDateKey && archive[matchingDateKey]) {
    return { snapshot: archive[matchingDateKey], isExact: true };
  }

  // 3. Check db.shifts table
  try {
    const shiftRow = await db.shifts.where('date').equals(targetDate).first();
    if (shiftRow) {
      return { snapshot: shiftRow, isExact: true };
    }
  } catch {}

  return { snapshot: null, isExact: false };
}

// Helper to get the most recent recorded shift before targetDate for Carry-Forward
export async function getLatestPreviousShiftSnapshot(targetDate, shiftType) {
  const archive = await getDailyShiftsArchive();
  const targetKey = `${targetDate}_${shiftType}`;
  const keys = Object.keys(archive).sort();
  const prevKeys = keys.filter(k => k < targetKey || k.slice(0, 10) < targetDate);
  if (prevKeys.length > 0) {
    const lastKey = prevKeys[prevKeys.length - 1];
    return archive[lastKey];
  }
  return null;
}

// Export all data as JSON file for auto-backup
export async function exportDatabaseBackup() {
  const backupData = {
    version: 1,
    exportDate: new Date().toISOString(),
    nozzleReadings: await db.nozzleReadings.toArray(),
    tanks: await db.tanks.toArray(),
    customers: await db.customers.toArray(),
    ledgerEntries: await db.ledgerEntries.toArray(),
    expenses: await db.expenses.toArray(),
    purchases: await db.purchases.toArray(),
    cashDenominations: await db.cashDenominations.toArray(),
    upiLogs: await db.upiLogs.toArray(),
    invoices: await db.invoices.toArray(),
    attendance: await db.attendance.toArray(),
    bankDeposits: await db.bankDeposits.toArray(),
    settings: await db.settings.toArray(),
  };

  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(backupData, null, 2)
  )}`;
  const downloadAnchor = document.createElement('a');
  const filename = `MY_PUMP_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Restore database from JSON backup file
export async function restoreDatabaseFromFile(jsonFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data || !data.nozzleReadings) {
          throw new Error('Invalid backup file format');
        }

        await db.transaction('rw', db.tables, async () => {
          for (const table of db.tables) {
            await table.clear();
            if (data[table.name]) {
              await table.bulkAdd(data[table.name]);
            }
          }
        });
        resolve(true);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(jsonFile);
  });
}

// Quick recalculate daily financial totals
export async function getDailyFinancialSummary(dateStr) {
  const today = dateStr || new Date().toISOString().split('T')[0];

  const nozzleData = await db.nozzleReadings.where('date').equals(today).toArray();
  const totalFuelSales = nozzleData.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
  const totalLitres = nozzleData.reduce((acc, curr) => acc + (curr.salesLitres || 0), 0);

  const expenses = await db.expenses.where('date').equals(today).toArray();
  const totalExpenses = expenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const upiLogs = await db.upiLogs.where('date').equals(today).toArray();
  const totalUpi = upiLogs.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const ledgerEntries = await db.ledgerEntries.where('date').equals(today).toArray();
  const totalCustomerDebits = ledgerEntries
    .filter(e => e.type === 'DEBIT')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const cashData = await db.cashDenominations.where('date').equals(today).first();
  const actualCashCollected = cashData ? cashData.totalCash : 0;

  // Expected Physical Cash formula
  const expectedCash = totalFuelSales - (totalCustomerDebits + totalUpi + totalExpenses);
  const cashVariance = actualCashCollected - expectedCash;

  const netProfit = totalFuelSales - totalExpenses; // High level summary net profit indicator

  return {
    today,
    totalFuelSales: Number(totalFuelSales.toFixed(2)),
    totalLitres: Number(totalLitres.toFixed(2)),
    totalExpenses: Number(totalExpenses.toFixed(2)),
    totalUpi: Number(totalUpi.toFixed(2)),
    totalCustomerDebits: Number(totalCustomerDebits.toFixed(2)),
    actualCashCollected: Number(actualCashCollected.toFixed(2)),
    expectedCash: Number(expectedCash.toFixed(2)),
    cashVariance: Number(cashVariance.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2))
  };
}

// Helper to calculate total sale amount for a lubricant row
export function calculateLubricantRowTotal(row) {
  if (!row) return 0;
  const vol = parseFloat(row.litreVolume !== undefined && row.litreVolume !== null && row.litreVolume !== '' ? row.litreVolume : row.volume) || 0;
  const qty = parseFloat(row.soldQty !== undefined && row.soldQty !== null && row.soldQty !== '' ? row.soldQty : row.soldCount) || 0;
  const price = parseFloat(row.unitPrice !== undefined && row.unitPrice !== null && row.unitPrice !== '' ? row.unitPrice : row.rate) || 0;

  if (vol > 0) {
    return Number((vol * qty * price).toFixed(2));
  }
  return Number((qty * price).toFixed(2));
}

// Sync Section B Lubricants sales entries to central lubricants register in IndexedDB
export async function syncSectionBToLubricants(activeDate, sectionBRows) {
  if (!activeDate || !Array.isArray(sectionBRows)) return;
  try {
    const existing = await db.lubricants.where('date').equals(activeDate).toArray();
    for (const item of existing) {
      await db.lubricants.delete(item.id);
    }

    const validRows = sectionBRows.filter(r => r.productName && (parseFloat(r.soldQty ?? r.soldCount) > 0));

    for (const r of validRows) {
      const qty = parseFloat(r.soldQty ?? r.soldCount) || 0;
      const price = parseFloat(r.unitPrice ?? r.rate) || 0;
      const vol = parseFloat(r.litreVolume ?? r.volume) || 0;
      const totalSaleAmount = calculateLubricantRowTotal(r);

      await db.lubricants.add({
        date: activeDate,
        monthKey: activeDate.slice(0, 7),
        productName: r.productName,
        litreVolume: vol,
        soldQty: qty,
        totalSaleAmount: totalSaleAmount,
        unitPrice: price,
        entrySource: 'daily_shift',
        updatedAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('Error syncing Section B lubricants to IndexedDB:', err);
  }
}

// Sync Shift Dispensed Volume (Active Nozzles) directly to Stock Patrak module
export async function syncNozzlesToStockPatrak(shiftDate, volumes, isFinalized = false) {
  if (!shiftDate) return;

  const { petrolLitres = 0, dieselLitres = 0, speedLitres = 0 } = volumes || {};

  try {
    let tankList = await db.tanks.toArray();
    const requiredSheets = [
      { tankName: 'PETROL (MS)', productType: 'Motor Spirit (MS)', vol: petrolLitres },
      { tankName: 'DIESEL (HSD)', productType: 'High Speed Diesel (HSD)', vol: dieselLitres },
      { tankName: 'SMART FUEL', productType: 'Smart Fuel', vol: speedLitres }
    ];

    const hasExactThree =
      tankList.length === 3 &&
      tankList.every((t, i) => t.tankName === requiredSheets[i].tankName);

    if (tankList.length === 0) {
      tankList = [];
      for (const sheet of requiredSheets) {
        const id = await db.tanks.add({ tankName: sheet.tankName, productType: sheet.productType, initialCapacity: 0 });
        tankList.push({ id, ...sheet });
      }
    }

    for (const sheet of requiredSheets) {
      const targetTank = tankList.find(t => t.tankName === sheet.tankName);
      if (!targetTank || !targetTank.id) continue;

      const salesLiters = Number((parseFloat(sheet.vol) || 0).toFixed(2));

      let ledgerRecords = await db.tankLedger.where('tankId').equals(targetTank.id).toArray();
      ledgerRecords = ledgerRecords.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);

      const prevRows = ledgerRecords
        .filter(r => r.date < shiftDate)
        .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
      const lastRecordedRow = prevRows.length > 0 ? prevRows[0] : (ledgerRecords.length > 0 ? ledgerRecords[ledgerRecords.length - 1] : null);

      const previousClosing = lastRecordedRow ? parseFloat(lastRecordedRow.closingStock) : 0;
      const newOpeningStock = !isNaN(previousClosing) && previousClosing > 0
        ? previousClosing
        : (parseFloat(targetTank.initialCapacity || targetTank.capacityLitres) || 0);

      let targetRow = ledgerRecords.find(r => r.date === shiftDate);

      if (targetRow) {
        let op = parseFloat(targetRow.openingStock) || 0;
        // Auto-heal unfinalized rows contaminated by previous 10,000 default
        if (!targetRow.isFinalized && op === 10000 && previousClosing > 0 && previousClosing !== 10000) {
          op = previousClosing;
        }

        const rec = parseFloat(targetRow.receiveStock) || 0;
        const total = op + rec;
        const closing = total - salesLiters;

        await db.tankLedger.update(targetRow.id, {
          openingStock: Number(op.toFixed(2)),
          sellStock: salesLiters,
          totalStock: Number(total.toFixed(2)),
          closingStock: Number(closing.toFixed(2)),
          isFinalized: isFinalized || targetRow.isFinalized || false,
          updatedAt: new Date().toISOString()
        });
      } else {
        const op = Number(newOpeningStock.toFixed(2));
        const rec = 0;
        const total = op + rec;
        const closing = total - salesLiters;

        await db.tankLedger.add({
          tankId: targetTank.id,
          date: shiftDate,
          openingStock: op,
          receiveStock: 0,
          totalStock: Number(total.toFixed(2)),
          sellStock: salesLiters,
          closingStock: Number(closing.toFixed(2)),
          isFinalized: isFinalized || false,
          createdAt: new Date().toISOString()
        });
      }
    }

    // Persist to localStorage key pump_stock_patrak_store as requested
    const allTanks = await db.tanks.toArray();
    const allLedgers = await db.tankLedger.toArray();
    localStorage.setItem('pump_stock_patrak_store', JSON.stringify({ tanks: allTanks, ledgers: allLedgers }));

    // Broadcast update events
    window.dispatchEvent(new CustomEvent('stock_patrak_updated', {
      detail: { date: shiftDate, isFinalized }
    }));
    window.dispatchEvent(new Event('stock_patrak_sync'));

  } catch (err) {
    console.error('Error syncing nozzles to Stock Patrak:', err);
  }
}

// Sync Cash Sales vs Debit Sales per fuel grade (Petrol, Diesel, Speed, CNG) to Sell Patrak module
export async function processSellPatrakSync(shiftDate, dailyData) {
  if (!shiftDate) return;
  const activeDate = shiftDate;
  const monthKey = activeDate.slice(0, 7);
  const storageKey = `sell_patrak_${monthKey}`;

  const {
    nozzles = [],
    nozzleTotals = null,
    debitEntries = [],
    rates = {},
    lubricants = []
  } = dailyData || {};

  // 1. Total Dispensed Volume (P, D, SP, CNG)
  let P = 0;
  let D = 0;
  let SP = 0;
  let CNG = 0;

  if (nozzleTotals) {
    P = parseFloat(nozzleTotals.petrolLitres) || 0;
    D = parseFloat(nozzleTotals.dieselLitres) || 0;
    SP = parseFloat(nozzleTotals.speedLitres) || 0;
    CNG = parseFloat(nozzleTotals.cngKg ?? nozzleTotals.totalCngKgCombined) || 0;
  } else if (Array.isArray(nozzles) && nozzles.length > 0) {
    nozzles.forEach(n => {
      const p = (n.productName || '').toLowerCase();
      const s = parseFloat(n.salesLitres) || 0;
      if (p.includes('diesel') || p.includes('hsd')) D += s;
      else if (p.includes('speed') || p.includes('xp') || p.includes('smart') || p.includes('power')) SP += s;
      else if (p.includes('cng')) CNG += s;
      else P += s;
    });
  }

  // Include any CNG volume listed under Lubricants / Oil Section B if applicable
  const cngLube = (lubricants || []).find(l => (l.productName || '').toLowerCase().includes('cng'));
  if (cngLube) {
    CNG += parseFloat(cngLube.soldQty ?? cngLube.soldCount) || 0;
  }

  P = Number(P.toFixed(2));
  D = Number(D.toFixed(2));
  SP = Number(SP.toFixed(2));
  CNG = Number(CNG.toFixed(2));

  // 2. Total Debit Volume (DBP, DBD, DBSP, DBCNG) from Section E (debitEntries)
  // STRICT FILTER: Only rows where billType === 'Debit Bill' contribute to DEBIT in Sell Patrak.
  let DBP = 0;
  let DBD = 0;
  let DBSP = 0;
  let DBCNG = 0;

  if (Array.isArray(debitEntries)) {
    debitEntries.forEach(d => {
      const bType = d.billType || 'Debit Bill';
      if (bType !== 'Debit Bill') return; // Exclude 'Local Bill'

      const fuel = (d.fuelProduct || d.fuelType || d.productName || '').toLowerCase();
      const litres = parseFloat(d.quantityLitres ?? d.litres) || 0;
      if (fuel.includes('hsd') || fuel.includes('diesel')) {
        DBD += litres;
      } else if (fuel.includes('speed') || fuel.includes('xp') || fuel.includes('smart') || fuel.includes('power')) {
        DBSP += litres;
      } else if (fuel.includes('cng')) {
        DBCNG += litres;
      } else {
        DBP += litres;
      }
    });
  }

  DBP = Number(DBP.toFixed(2));
  DBD = Number(DBD.toFixed(2));
  DBSP = Number(DBSP.toFixed(2));
  DBCNG = Number(DBCNG.toFixed(2));

  // 3. Cash Sales Volume (CS = max(0, Total - DB))
  const PCS = Number(Math.max(0, P - DBP).toFixed(2));
  const DCS = Number(Math.max(0, D - DBD).toFixed(2));
  const SPCS = Number(Math.max(0, SP - DBSP).toFixed(2));
  const CNGCS = Number(Math.max(0, CNG - DBCNG).toFixed(2));

  // 4. Read Live Fuel Rates
  const msRate = parseFloat(rates['Motor Spirit (Petrol)'] ?? rates['MS Petrol'] ?? rates.msPetrol) || 94.48;
  const hsdRate = parseFloat(rates['High Speed Diesel'] ?? rates['HSD Diesel'] ?? rates.hsdDiesel) || 90.16;
  const speedRate = parseFloat(rates['Speed Petrol'] ?? rates['XP Premium Petrol'] ?? rates.speedRate) || 104.50;
  const cngRate = parseFloat(rates['CNG'] ?? rates.cngRate) || 75.80;

  try {
    const rec = await db.settings.get(storageKey);
    let loaded = rec && rec.data ? { ...rec.data } : {
      petrol: [],
      diesel: [],
      cng: [],
      cngSale: [],
      smartFuel: []
    };

    if (!Array.isArray(loaded.petrol)) loaded.petrol = [];
    if (!Array.isArray(loaded.diesel)) loaded.diesel = [];
    if (!Array.isArray(loaded.smartFuel)) loaded.smartFuel = [];
    if (!Array.isArray(loaded.cng)) loaded.cng = [];
    if (!Array.isArray(loaded.cngSale)) loaded.cngSale = [];

    const updateFuelArray = (arr, cashVal, debitVal, rateVal) => {
      const totalVol = Number((cashVal + debitVal).toFixed(2));
      const amountVal = Number((totalVol * rateVal).toFixed(2));
      const existingIdx = arr.findIndex(r => r.date === activeDate);
      const newObj = {
        date: activeDate,
        cashSale: cashVal,
        debit: debitVal,
        total: totalVol,
        rate: rateVal,
        amount: amountVal
      };

      if (existingIdx >= 0) {
        arr[existingIdx] = newObj;
      } else {
        arr.push(newObj);
      }
      arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    const updateCngSaleArray = (arr, kgVal, rateVal) => {
      const totalAmt = Number((kgVal * rateVal).toFixed(2));
      const existingIdx = arr.findIndex(r => r.date === activeDate);
      const newObj = {
        id: existingIdx >= 0 ? arr[existingIdx].id : Date.now(),
        date: activeDate,
        saleKg: kgVal,
        rate: rateVal,
        total: totalAmt
      };
      if (existingIdx >= 0) {
        arr[existingIdx] = { ...arr[existingIdx], ...newObj };
      } else {
        arr.push(newObj);
      }
      arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    const updateCngRegisterArray = (arr, kgVal, rateVal) => {
      const totalAmt = Number((kgVal * rateVal).toFixed(2));
      const existingIdx = arr.findIndex(r => r.date === activeDate);
      const existingPay = existingIdx >= 0 ? (parseFloat(arr[existingIdx].paymentDone) || 0) : 0;
      const newObj = {
        id: existingIdx >= 0 ? arr[existingIdx].id : Date.now(),
        date: activeDate,
        paymentDone: existingPay,
        cngSaleKg: kgVal,
        cngAmount: totalAmt
      };
      if (existingIdx >= 0) {
        arr[existingIdx] = { ...arr[existingIdx], ...newObj };
      } else {
        arr.push(newObj);
      }
      arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    updateFuelArray(loaded.petrol, PCS, DBP, msRate);
    updateFuelArray(loaded.diesel, DCS, DBD, hsdRate);
    updateFuelArray(loaded.smartFuel, SPCS, DBSP, speedRate);

    if (CNG > 0 || (loaded.cng && loaded.cng.some(r => r.date === activeDate))) {
      updateCngSaleArray(loaded.cngSale, CNG, cngRate);
      updateCngRegisterArray(loaded.cng, CNG, cngRate);
    }

    await db.settings.put({
      key: storageKey,
      data: loaded,
      updatedAt: new Date().toISOString()
    });

    localStorage.setItem('pump_sell_patrak_store', JSON.stringify(loaded));

    window.dispatchEvent(new CustomEvent('sell_patrak_updated', {
      detail: { date: activeDate, monthKey }
    }));
    window.dispatchEvent(new Event('sell_patrak_sync'));
  } catch (err) {
    console.error('Error in processSellPatrakSync:', err);
  }
}

// Utility to cleanup and purge duplicate ledger entries safely
export async function cleanupDuplicateLedgerEntries() {
  try {
    const allEntries = await db.ledgerEntries.toArray();
    const seenMap = new Map();
    const duplicateIds = [];

    for (const entry of allEntries) {
      const custKey = entry.customerId || entry.partyId || 'unknown';
      const detKey = entry.deterministicId || '';
      const dateKey = entry.date || '';
      const typeKey = entry.type || '';
      const amtKey = (parseFloat(entry.amount) || 0).toFixed(2);
      const descKey = (entry.description || entry.vehicleNo || entry.slipNo || '').trim().toLowerCase();

      let uniqueKey = '';
      if (detKey) {
        uniqueKey = `DET_${custKey}_${detKey}`;
      } else {
        uniqueKey = `COMP_${custKey}_${dateKey}_${typeKey}_${amtKey}_${descKey}`;
      }

      if (seenMap.has(uniqueKey)) {
        duplicateIds.push(entry.id);
      } else {
        seenMap.set(uniqueKey, entry.id);
      }
    }

    if (duplicateIds.length > 0) {
      for (const id of duplicateIds) {
        await db.ledgerEntries.delete(id);
      }
      console.log(`Cleaned up ${duplicateIds.length} duplicate ledger entries from IndexedDB.`);
    }

    // Also recalculate customer balances to ensure 100% integrity
    const allCusts = await db.customers.toArray();
    for (const cust of allCusts) {
      const custLedger = await db.ledgerEntries.where('customerId').equals(cust.id).toArray();
      const totalUdhar = custLedger.filter(e => e.type === 'DEBIT' || e.type === 'UDHAR').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const totalJama = custLedger.filter(e => e.type === 'CREDIT' || e.type === 'JAMA').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const openBal = parseFloat(cust.openingBalance) || 0;
      const newBal = openBal + totalUdhar - totalJama;
      await db.customers.update(cust.id, { currentBalance: Math.max(0, newBal) });
    }
  } catch (err) {
    console.error('Error cleaning up duplicate ledger entries:', err);
  }
}

// Master Cross-Module Data Synchronization Pipeline
export async function syncDailyEntryToModules(shiftDate, shiftType, dailyData) {
  if (!shiftDate) return;
  const activeDate = shiftDate;
  const activeShift = shiftType || 'Day Shift';
  const monthKey = activeDate.slice(0, 7);

  const {
    lubricants = [],
    nozzles = [],
    nozzleTotals = null,
    debitEntries = [],
    jamaEntries = [],
    otherIncomeEntries = [],
    expenseEntries = [],
    smartBalanceEntries = [],
    digitalPayEntries = [],
    smartMoneyEntries = [],
    bankEntries = [],
    customerList = []
  } = dailyData || {};

  // Extract fuel volumes for Stock Patrak sync
  let petrolVol = nozzleTotals ? nozzleTotals.petrolLitres : 0;
  let dieselVol = nozzleTotals ? nozzleTotals.dieselLitres : 0;
  let speedVol = nozzleTotals ? nozzleTotals.speedLitres : 0;

  if (!nozzleTotals && Array.isArray(nozzles) && nozzles.length > 0) {
    nozzles.forEach(n => {
      const p = (n.productName || '').toLowerCase();
      const s = parseFloat(n.salesLitres) || 0;
      if (p.includes('diesel') || p.includes('hsd')) dieselVol += s;
      else if (p.includes('speed') || p.includes('xp') || p.includes('smart')) speedVol += s;
      else if (!p.includes('cng')) petrolVol += s;
    });
  }

  // Trigger Stock Patrak sync pipeline for MS, HSD, and Speed (CNG excluded)
  await syncNozzlesToStockPatrak(activeDate, {
    petrolLitres: petrolVol,
    dieselLitres: dieselVol,
    speedLitres: speedVol
  });

  // Trigger Sell Patrak sync pipeline for Cash vs Debit separation (CNG excluded)
  await processSellPatrakSync(activeDate, dailyData);

  try {
    const activeTables = [
      db.lubricants,
      db.debitEntries,
      db.jamaEntries,
      db.ledgerEntries,
      db.customers,
      db.upiLogs,
      db.bankDeposits,
      db.settings
    ].filter(Boolean);

    await db.transaction('rw', activeTables, async () => {
      // 1. SECTION B -> LUBRICANTS SALES REGISTER
      const existingLube = await db.lubricants.where('date').equals(activeDate).toArray();
      for (const item of existingLube) {
        if (item.entrySource === 'daily_shift' || !item.entrySource) {
          await db.lubricants.delete(item.id);
        }
      }

      const validLubeRows = lubricants.filter(r => r.productName && (parseFloat(r.soldQty ?? r.soldCount) > 0));
      for (const r of validLubeRows) {
        const qty = parseFloat(r.soldQty ?? r.soldCount) || 0;
        const price = parseFloat(r.unitPrice ?? r.rate) || 0;
        const vol = parseFloat(r.litreVolume ?? r.volume) || 0;
        const totalSaleAmount = calculateLubricantRowTotal(r);

        await db.lubricants.add({
          date: activeDate,
          monthKey,
          productName: r.productName,
          litreVolume: vol,
          soldQty: qty,
          totalSaleAmount,
          unitPrice: price,
          shiftId: activeShift,
          entrySource: 'daily_shift',
          updatedAt: new Date().toISOString()
        });
      }

      // 2. SECTION C & E -> DEBIT-CREDIT LEDGER & CUSTOMERS
      // Purge existing daily shift entries for this activeDate before writing fresh idempotent entries
      const existingDebits = await db.debitEntries.where('date').equals(activeDate).toArray();
      for (const d of existingDebits) {
        if (d.entrySource === 'daily_shift' || !d.entrySource) await db.debitEntries.delete(d.id);
      }

      const existingJama = await db.jamaEntries.where('date').equals(activeDate).toArray();
      for (const j of existingJama) {
        if (j.entrySource === 'daily_shift' || !j.entrySource) await db.jamaEntries.delete(j.id);
      }

      const existingLedgerForDate = await db.ledgerEntries.where('date').equals(activeDate).toArray();
      for (const el of existingLedgerForDate) {
        const det = el.deterministicId || '';
        if (
          el.entrySource === 'daily_shift' ||
          !el.entrySource ||
          det.startsWith(`debit-daily-${activeDate}`) ||
          det.startsWith(`jama-daily-${activeDate}`) ||
          det.startsWith(`SYNC-`)
        ) {
          await db.ledgerEntries.delete(el.id);
        }
      }

      const currentCusts = customerList.length > 0 ? customerList : await db.customers.toArray();

      // Process Section E Debits
      for (let idx = 0; idx < debitEntries.length; idx++) {
        const d = debitEntries[idx];
        if (parseFloat(d.amount) > 0) {
          const detId = d.syncId || `SYNC-E-${activeDate}-${activeShift}-${d.id || idx}`;
          const prodName = d.fuelProduct || d.productName || d.fuelType || 'MS Petrol';
          const litresVal = parseFloat(d.quantityLitres ?? d.litres) || 0;
          const rateVal = parseFloat(d.rate) || (litresVal > 0 ? Number((parseFloat(d.amount) / litresVal).toFixed(2)) : 0);

          await db.debitEntries.add({
            deterministicId: detId,
            customerName: d.customerName,
            date: activeDate,
            monthKey,
            vehicleNumber: d.vehicleNumber || d.vehicleNo || 'GUJ-AUTO',
            slipNumber: d.slipNumber || d.slipNo || `SLIP-${Math.floor(1000 + Math.random() * 9000)}`,
            billType: d.billType || 'Debit Bill',
            productName: prodName,
            quantityLitres: litresVal,
            rate: rateVal,
            amount: parseFloat(d.amount) || 0,
            shiftId: activeShift,
            entrySource: 'daily_shift'
          });

          const cust = currentCusts.find(c => (c.name || '').toLowerCase() === (d.customerName || '').toLowerCase());
          if (cust) {
            await db.ledgerEntries.add({
              deterministicId: detId,
              customerId: cust.id,
              partyId: cust.id,
              date: activeDate,
              monthKey,
              type: 'DEBIT',
              amount: parseFloat(d.amount) || 0,
              litres: litresVal,
              rate: rateVal,
              productName: prodName,
              billType: d.billType || 'Debit Bill',
              vehicleNo: d.vehicleNumber || d.vehicleNo || '',
              slipNo: d.slipNumber || d.slipNo || '',
              description: `Credit Slip (${prodName}) [${d.billType || 'Debit Bill'}] - Slip #${d.slipNumber || d.slipNo || 'AUTO'}`,
              entrySource: 'daily_shift'
            });
          }
        }
      }

      // Process Section C Jama Recovery (CREDIT)
      for (let idx = 0; idx < jamaEntries.length; idx++) {
        const j = jamaEntries[idx];
        if (parseFloat(j.amount) > 0) {
          const detId = j.syncId || `SYNC-C-${activeDate}-${activeShift}-${j.id || idx}`;
          await db.jamaEntries.add({
            deterministicId: detId,
            customerName: j.customerName,
            date: activeDate,
            monthKey,
            paymentMode: j.paymentMode || 'Cash',
            amount: parseFloat(j.amount) || 0,
            notes: j.notes || 'Shift Jama Recovery',
            entrySource: 'daily_shift'
          });

          const cust = currentCusts.find(c => (c.name || '').toLowerCase() === (j.customerName || '').toLowerCase());
          if (cust) {
            await db.ledgerEntries.add({
              deterministicId: detId,
              customerId: cust.id,
              partyId: cust.id,
              date: activeDate,
              monthKey,
              type: 'CREDIT',
              amount: parseFloat(j.amount) || 0,
              paymentMode: j.paymentMode || 'Cash',
              vehicleNo: j.paymentMode || 'Cash',
              description: `Jama Credit Recovery (${j.paymentMode || 'Cash'})`,
              entrySource: 'daily_shift'
            });
          }
        }
      }

      // Recalculate customer balances: Balance = OpeningBalance + TotalUdhar - TotalJama
      const allCustomers = await db.customers.toArray();
      for (const cust of allCustomers) {
        const custLedger = await db.ledgerEntries.where('customerId').equals(cust.id).toArray();
        const totalUdhar = custLedger.filter(e => e.type === 'DEBIT' || e.type === 'UDHAR').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const totalJama = custLedger.filter(e => e.type === 'CREDIT' || e.type === 'JAMA').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const openingBal = parseFloat(cust.openingBalance) || 0;
        const newBal = openingBal + totalUdhar - totalJama;
        await db.customers.update(cust.id, { currentBalance: Math.max(0, newBal) });
      }

      // 3. SECTION F -> DIGITAL PAY, ATM, SMART MONEY
      const existingUpi = await db.upiLogs.where('date').equals(activeDate).toArray();
      for (const u of existingUpi) {
        if (u.entrySource === 'daily_shift' || !u.entrySource) await db.upiLogs.delete(u.id);
      }

      const upiRows = smartBalanceEntries.filter(s => {
        const p = (s.provider || '').toLowerCase();
        return p.includes('upi') || p.includes('phonepe') || p.includes('gpay') || p.includes('google pay') || p.includes('paytm');
      });

      for (let idx = 0; idx < upiRows.length; idx++) {
        const u = upiRows[idx];
        const amt = parseFloat(u.netReceived ?? u.settledAmount ?? u.amount) || 0;
        if (amt > 0) {
          await db.upiLogs.add({
            deterministicId: `upi-daily-${activeDate}-${activeShift}-${idx}`,
            date: activeDate,
            monthKey,
            provider: u.provider || 'UPI QR',
            amount: amt,
            shiftId: activeShift,
            utrNo: u.txnId || `UPI-${Math.floor(100000 + Math.random() * 900000)}`,
            entrySource: 'daily_shift'
          });
        }
      }

      // Sync bank_hisab_store
      let bankHisabRec = await db.settings.get('bank_hisab_store');
      let bankHisabData = bankHisabRec?.data || {
        bank_accounts: [],
        upi_transactions: [],
        atm_transactions: [],
        smart_money_transactions: []
      };

      const nonDailyUpi = (bankHisabData.upi_transactions || []).filter(t => t.date !== activeDate || t.entrySource !== 'daily_shift');
      const newDailyUpiTrans = upiRows.map((u, idx) => ({
        id: `upi-daily-${activeDate}-${activeShift}-${idx}`,
        date: activeDate,
        monthKey,
        provider: u.provider || 'UPI QR',
        utrNo: u.txnId || `UPI-${Math.floor(100000 + Math.random() * 900000)}`,
        bankAccount: 'Main Pump Account',
        amount: parseFloat(u.netReceived ?? u.settledAmount ?? u.amount) || 0,
        entrySource: 'daily_shift'
      }));
      bankHisabData.upi_transactions = [...nonDailyUpi, ...newDailyUpiTrans];

      const atmRows = smartBalanceEntries.filter(s => {
        const p = (s.provider || '').toLowerCase();
        return p.includes('pos') || p.includes('pine') || p.includes('card') || p.includes('edc') || p.includes('swipe');
      });
      const nonDailyAtm = (bankHisabData.atm_transactions || []).filter(t => t.date !== activeDate || t.entrySource !== 'daily_shift');
      const newDailyAtmTrans = atmRows.map((a, idx) => ({
        id: `atm-daily-${activeDate}-${activeShift}-${idx}`,
        date: activeDate,
        monthKey,
        posTid: a.provider || 'POS Machine',
        batchNo: a.txnId || `BATCH-${Math.floor(100 + Math.random() * 900)}`,
        cardType: 'Debit/Credit Card',
        netAmount: parseFloat(a.netReceived ?? a.settledAmount ?? a.amount) || 0,
        mdrAmount: parseFloat(a.feeDeduction) || 0,
        entrySource: 'daily_shift'
      }));
      bankHisabData.atm_transactions = [...nonDailyAtm, ...newDailyAtmTrans];

      const nonDailySmart = (bankHisabData.smart_money_transactions || []).filter(t => t.date !== activeDate || t.entrySource !== 'daily_shift');
      const newDailySmartTrans = smartMoneyEntries.map((sm, idx) => ({
        id: `sm-daily-${activeDate}-${activeShift}-${idx}`,
        date: activeDate,
        monthKey,
        program: sm.program || 'Fleet / Petro Card',
        cardNo: sm.cardNo || 'PUMP-FLEET-CARD',
        amount: parseFloat(sm.amount) || 0,
        remarks: sm.remarks || 'Daily Shift Smart Money Settlement',
        entrySource: 'daily_shift'
      }));
      bankHisabData.smart_money_transactions = [...nonDailySmart, ...newDailySmartTrans];

      // 4. SECTION H -> BANK HISAB & DIRECTORY SYNC
      const existingBankDeposits = await db.bankDeposits.where('date').equals(activeDate).toArray();
      for (const ob of existingBankDeposits) {
        if (ob.entrySource === 'daily_shift' || !ob.entrySource) await db.bankDeposits.delete(ob.id);
      }

      for (let idx = 0; idx < bankEntries.length; idx++) {
        const b = bankEntries[idx];
        if (parseFloat(b.amount) > 0) {
          await db.bankDeposits.add({
            deterministicId: `bank-dep-daily-${activeDate}-${activeShift}-${idx}`,
            bankAccountId: b.bankAccountId || '',
            date: activeDate,
            monthKey,
            bankName: b.bankName,
            accountNumber: b.accountNumber || '',
            slipNo: b.slipNo || 'DEP-AUTO',
            amount: parseFloat(b.amount) || 0,
            depositedBy: b.depositedBy || 'Shift Manager',
            entrySource: 'daily_shift'
          });
        }
      }

      let bankAccountsList = Array.isArray(bankHisabData.bank_accounts)
        ? bankHisabData.bank_accounts
        : (await db.settings.get('bank_accounts_master'))?.data;

      if (!Array.isArray(bankAccountsList)) {
        bankAccountsList = [];
      }

      for (let idx = 0; idx < bankEntries.length; idx++) {
        const b = bankEntries[idx];
        const amt = parseFloat(b.amount) || 0;
        if (amt <= 0) continue;

        let matchedBank = bankAccountsList.find(acc =>
          (b.bankAccountId && acc.id === b.bankAccountId) ||
          (b.bankName && acc.name.toLowerCase() === b.bankName.toLowerCase()) ||
          (b.accountNumber && acc.accountNumber === b.accountNumber)
        );

        if (!matchedBank) {
          matchedBank = {
            id: b.bankAccountId || `bank-custom-${Date.now()}-${idx}`,
            name: b.bankName || 'Other Bank',
            accountNumber: b.accountNumber || `ACC-${Math.floor(10000 + Math.random() * 90000)}`,
            branch: 'Main Branch',
            openingBalance: 0,
            deposits: []
          };
          bankAccountsList.push(matchedBank);
        }

        matchedBank.deposits = (matchedBank.deposits || []).filter(d => d.date !== activeDate || d.entrySource !== 'daily_shift');
        matchedBank.deposits.push({
          id: `bank-dep-daily-${activeDate}-${activeShift}-${idx}`,
          date: activeDate,
          monthKey,
          slipRefNo: b.slipNo || 'DEP-AUTO',
          debit: 0,
          credit: amt,
          entrySource: 'daily_shift'
        });
      }

      for (const acc of bankAccountsList) {
        const totalCredit = (acc.deposits || []).reduce((s, d) => s + (parseFloat(d.credit) || 0), 0);
        const totalDebit = (acc.deposits || []).reduce((s, d) => s + (parseFloat(d.debit) || 0), 0);
        acc.currentBalance = (parseFloat(acc.openingBalance) || 0) + totalCredit - totalDebit;
      }

      bankHisabData.bank_accounts = bankAccountsList;

      await db.settings.put({
        key: 'bank_hisab_store',
        data: bankHisabData,
        updatedAt: new Date().toISOString()
      });

      await db.settings.put({
        key: 'bank_accounts_master',
        data: bankAccountsList,
        updatedAt: new Date().toISOString()
      });

      // 9. Sync Other Expenses (Section G) into pump_other_expenses store
      const otherExps = (expenseEntries || []).filter(e => 
        (e.category === 'Other Expenses' || e.category === 'Other Expense') && (parseFloat(e.amount) || 0) > 0
      );
      if (otherExps.length > 0) {
        try {
          let existingOther = [];
          const saved = localStorage.getItem('pump_other_expenses') || localStorage.getItem('other_expenses');
          if (saved) {
            try { existingOther = JSON.parse(saved); } catch (e) {}
          }
          if (!Array.isArray(existingOther)) existingOther = [];
          const filtered = existingOther.filter(e => !(e.date === activeDate && e.shiftId === activeShift && e.fromDailyShift));
          const newItems = otherExps.map((e, idx) => ({
            id: `oe-shift-${activeDate}-${activeShift}-${e.id || idx}`,
            date: activeDate,
            shiftId: activeShift,
            remarks: e.description || 'Shift Expense',
            amount: parseFloat(e.amount) || 0,
            fromDailyShift: true
          }));
          const merged = [...newItems, ...filtered];
          localStorage.setItem('pump_other_expenses', JSON.stringify(merged));
          await db.settings.put({
            key: 'pump_other_expenses',
            data: merged,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error('Error syncing other expenses in storageService:', err);
        }
        // 10. Sync Ushina Accounts: Section D (Other Income -> Ushina JAMA) & Section G (Ushina Khata -> Ushina UDHAR)
        try {
          let currentUshina = [];
          const savedUsh = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
          if (savedUsh) {
            try { currentUshina = JSON.parse(savedUsh); } catch (e) {}
          }
          if (!Array.isArray(currentUshina) || currentUshina.length === 0) {
            const dbUsh = (await db.settings.get('other_accounts_ushina')) || (await db.settings.get('vividh_khata_accounts'));
            if (dbUsh && Array.isArray(dbUsh.data)) currentUshina = dbUsh.data;
          }

          if (Array.isArray(currentUshina) && currentUshina.length > 0) {
            const updatedUshina = currentUshina.map((acc, aIdx) => {
              const accName = (acc.name || '').trim().toLowerCase();

              // Remove previous saved entries from this shift to ensure idempotency
              const cleanJama = (acc.jamaEntries || []).filter(j => !(j.fromDailyShift && j.date === activeDate && j.shiftId === activeShift));
              const cleanUdhar = (acc.udharEntries || []).filter(u => !(u.fromDailyShift && u.date === activeDate && u.shiftId === activeShift));

              // Find Section D matching entries (JAMA)
              const newJamaFromSecD = (otherIncomeEntries || [])
                .filter(inc => {
                  const amt = parseFloat(inc.amount) || 0;
                  if (amt <= 0) return false;
                  let cat = (inc.category || '').trim().toLowerCase();
                  const desc = (inc.description || '').trim().toLowerCase();
                  const pName = (inc.partyName || '').trim().toLowerCase();
                  const accId = (inc.accountId || '').trim().toLowerCase();
                  const currentAccId = (acc.id || '').trim().toLowerCase();

                  if (!cat && !pName && aIdx === 0) cat = accName;
                  return (
                    cat === accName ||
                    pName === accName ||
                    (accId && accId === currentAccId) ||
                    desc === accName ||
                    (cat === 'ushina khata' && desc === accName) ||
                    (cat === 'ushina' && desc === accName) ||
                    (cat === 'other income' && desc === accName) ||
                    currentUshina.length === 1
                  );
                })
                .map((inc, iIdx) => ({
                  id: `jama-shift-${activeDate}-${activeShift}-${inc.id || iIdx}`,
                  date: activeDate,
                  shiftId: activeShift,
                  amount: parseFloat(inc.amount) || 0,
                  remarks: inc.description ? `${inc.description} (Daily Entry Other Income)` : `Daily Entry Other Income (${activeDate})`,
                  fromDailyShift: true
                }));

              // Find Section G matching entries (UDHAR)
              const newUdharFromSecG = (expenseEntries || [])
                .filter(exp => {
                  const amt = parseFloat(exp.amount) || 0;
                  if (amt <= 0) return false;
                  const cat = (exp.category || '').trim().toLowerCase();
                  const desc = (exp.description || '').trim().toLowerCase();
                  return (cat === 'ushina khata' || cat === 'ushina') && (desc === accName || (!desc && aIdx === 0));
                })
                .map((exp, eIdx) => ({
                  id: `udhar-shift-${activeDate}-${activeShift}-${exp.id || eIdx}`,
                  date: activeDate,
                  shiftId: activeShift,
                  amount: parseFloat(exp.amount) || 0,
                  description: exp.description ? `Daily Entry Shift Expense (${activeDate}) - ${exp.description}` : `Daily Entry Shift Expense (${activeDate})`,
                  fromDailyShift: true
                }));

              return {
                ...acc,
                jamaEntries: [...newJamaFromSecD, ...cleanJama],
                udharEntries: [...newUdharFromSecG, ...cleanUdhar]
              };
            });

            localStorage.setItem('ushina_accounts', JSON.stringify(updatedUshina));
            localStorage.setItem('pump_ushina_directory', JSON.stringify(updatedUshina));
            await db.settings.put({
              key: 'other_accounts_ushina',
              data: updatedUshina,
              updatedAt: new Date().toISOString()
            });
            await db.settings.put({
              key: 'vividh_khata_accounts',
              data: updatedUshina,
              updatedAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error('Error syncing Ushina accounts in storageService:', err);
        }
      }
    });

    // Cleanup duplicate ledger entries and broadcast events
    await cleanupDuplicateLedgerEntries();
    window.dispatchEvent(new CustomEvent('ledger_updated', { detail: { date: activeDate } }));
    window.dispatchEvent(new Event('pump_parties_updated'));
    window.dispatchEvent(new Event('pump_oa_sync'));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.error('Error executing syncDailyEntryToModules:', err);
    throw err;
  }
}

// Automatically sync purchasing invoices (Tax -> Purchasing) to Stock Patrak (Tank Ledger)
export async function syncPurchasingToStockPatrak(purchasingRows) {
  if (!Array.isArray(purchasingRows)) return;

  try {
    let tanks = await db.tanks.toArray();
    const requiredSheets = [
      { tankName: 'PETROL (MS)', productType: 'Motor Spirit (MS)' },
      { tankName: 'DIESEL (HSD)', productType: 'High Speed Diesel (HSD)' },
      { tankName: 'SMART FUEL', productType: 'Smart Fuel' },
    ];

    if (!tanks || tanks.length === 0) {
      tanks = [];
      for (const sheet of requiredSheets) {
        const id = await db.tanks.add(sheet);
        tanks.push({ id, ...sheet });
      }
    }

    const findTank = (keywords) =>
      tanks.find(t =>
        keywords.some(k =>
          (t.tankName || '').toLowerCase().includes(k.toLowerCase()) ||
          (t.productType || '').toLowerCase().includes(k.toLowerCase())
        )
      );

    const msTank = findTank(['petrol', 'ms', 'motor spirit']);
    const hsdTank = findTank(['diesel', 'hsd', 'high speed']);
    const smartTank = findTank(['smart', 'speed', 'power', 'premium']);

    // Group fuel purchases by target tankId and date
    const totalsByTankDate = {};
    const processedTankDates = new Set();

    purchasingRows.forEach(row => {
      const prod = (row.product || '').toLowerCase();
      let targetTank = null;

      if (prod.includes('petrol') || prod.includes('ms')) {
        targetTank = msTank;
      } else if (prod.includes('diesel') || prod.includes('hsd')) {
        targetTank = hsdTank;
      } else if (prod.includes('speed') || prod.includes('power') || prod.includes('smart')) {
        targetTank = smartTank;
      }

      if (targetTank && row.date) {
        const vol = parseFloat(
          row.volumeOrQty !== undefined
            ? row.volumeOrQty
            : (row.liters !== undefined && row.liters > 0 ? row.liters : (row.quantity || 0))
        ) || 0;

        const key = `${targetTank.id}_${row.date}`;
        totalsByTankDate[key] = (totalsByTankDate[key] || 0) + vol;
        processedTankDates.add(key);
      }
    });

    // Update db.tankLedger for all processed tank dates
    for (const key of Object.keys(totalsByTankDate)) {
      const parts = key.split('_');
      const tankId = parseInt(parts[0], 10) || parts[0];
      const dateStr = parts[1];
      const purchasedLiters = totalsByTankDate[key];

      const ledgerRecords = await db.tankLedger.where('tankId').equals(tankId).toArray();
      const existingRow = ledgerRecords.find(r => r.date === dateStr);

      if (existingRow) {
        const op = parseFloat(existingRow.openingStock) || 0;
        const rec = purchasedLiters;
        const sell = parseFloat(existingRow.sellStock) || 0;
        const total = op + rec;
        const closing = total - sell;

        await db.tankLedger.update(existingRow.id, {
          receiveStock: rec,
          totalStock: Number(total.toFixed(2)),
          closingStock: Number(closing.toFixed(2))
        });
      } else {
        const sorted = ledgerRecords.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
        const lastRow = sorted.length > 0 ? sorted[sorted.length - 1] : null;
        const previousClosing = lastRow ? parseFloat(lastRow.closingStock) : 0;
        const carryOpening = !isNaN(previousClosing) && previousClosing > 0 ? previousClosing : 0;

        const op = carryOpening;
        const rec = purchasedLiters;
        const sell = 0;
        const total = op + rec;
        const closing = total - sell;

        await db.tankLedger.add({
          tankId,
          date: dateStr,
          openingStock: op,
          receiveStock: rec,
          totalStock: Number(total.toFixed(2)),
          sellStock: sell,
          closingStock: Number(closing.toFixed(2))
        });
      }
    }

    // Broadcast event for live UI update across tabs
    window.dispatchEvent(new Event('stock_patrak_sync'));
  } catch (err) {
    console.error('Error in syncPurchasingToStockPatrak:', err);
  }
}


