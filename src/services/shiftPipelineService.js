/**
 * Shift Pipeline Service
 * Manages daily shift snapshots, carry-forward of nozzle meter readings,
 * historical archive hydration, and clean module syncing.
 */

import { db } from '../db/database';
import { saveShiftSnapshotToArchive, getShiftSnapshotForDate, syncDailyEntryToModules, syncNozzlesToStockPatrak } from '../db/storageService';

export async function processShiftSave({ selectedDate, activeShift, shiftData, showToast }) {
  try {
    const snapshot = {
      date: selectedDate,
      shiftType: activeShift,
      timestamp: new Date().toISOString(),
      ...shiftData
    };

    // 1. Save shift snapshot to persistent archive
    await saveShiftSnapshotToArchive(snapshot);

    // 2. Synchronize shift data cleanly into module stores (Stock Patrak, Ledger, Bank, etc.)
    await syncDailyEntryToModules(selectedDate, activeShift, snapshot);

    // 3. Atomically finalize Stock Patrak row with isFinalized: true
    const { nozzleTotals, nozzles } = shiftData || {};
    let petrolVol = nozzleTotals ? nozzleTotals.petrolLitres : 0;
    let dieselVol = nozzleTotals ? nozzleTotals.dieselLitres : 0;
    let speedVol = nozzleTotals ? nozzleTotals.speedLitres : 0;
    if (!nozzleTotals && Array.isArray(nozzles)) {
      nozzles.forEach(n => {
        const p = (n.productName || '').toLowerCase();
        const s = parseFloat(n.salesLitres) || 0;
        if (p.includes('diesel') || p.includes('hsd')) dieselVol += s;
        else if (p.includes('speed') || p.includes('xp') || p.includes('smart')) speedVol += s;
        else if (!p.includes('cng')) petrolVol += s;
      });
    }

    await syncNozzlesToStockPatrak(selectedDate, {
      petrolLitres: petrolVol,
      dieselLitres: dieselVol,
      speedLitres: speedVol
    }, true);

    // 4. ATOMIC COMMIT ON "SAVE TO NEXT SHIFT":
    const nextShiftDate = (() => {
      const cur = new Date(selectedDate);
      cur.setDate(cur.getDate() + 1);
      return cur.toISOString().split('T')[0];
    })();

    const tankList = await db.tanks.toArray();
    for (const currentTank of tankList) {
      let ledgerRecords = await db.tankLedger.where('tankId').equals(currentTank.id).toArray();
      ledgerRecords = ledgerRecords.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
      let activeRow = ledgerRecords.find(r => r.date === selectedDate);

      if (!activeRow) {
        const prevRows = ledgerRecords
          .filter(r => r.date < selectedDate)
          .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
        const lastRecordedRow = prevRows.length > 0 ? prevRows[0] : null;
        const previousClosing = lastRecordedRow ? parseFloat(lastRecordedRow.closingStock) : 0;
        const newOpeningStock = !isNaN(previousClosing) && previousClosing > 0
          ? previousClosing
          : (parseFloat(currentTank.initialCapacity || currentTank.capacityLitres) || 0);

        let sales = 0;
        const tName = (currentTank.tankName || '').toUpperCase();
        if (tName.includes('PETROL') || tName.includes('MS')) sales = petrolVol;
        else if (tName.includes('DIESEL') || tName.includes('HSD')) sales = dieselVol;
        else if (tName.includes('SMART') || tName.includes('SPEED') || tName.includes('XP')) sales = speedVol;

        const total = newOpeningStock;
        const closing = total - sales;
        activeRow = {
          tankId: currentTank.id,
          date: selectedDate,
          openingStock: Number(newOpeningStock.toFixed(2)),
          receiveStock: 0,
          totalStock: Number(total.toFixed(2)),
          sellStock: Number(sales.toFixed(2)),
          closingStock: Number(closing.toFixed(2)),
          isFinalized: true,
          createdAt: new Date().toISOString()
        };
        const newId = await db.tankLedger.add(activeRow);
        activeRow.id = newId;
      } else {
        // Finalize and lock the current date's row:
        const currentClosing = parseFloat(activeRow.totalStock) - parseFloat(activeRow.sellStock);
        activeRow.closingStock = Number(currentClosing.toFixed(2));
        activeRow.isFinalized = true;
        await db.tankLedger.put(activeRow);
      }

      // For the subsequent date / new shift:
      // Automatically prepare the next ledger row for each tank:
      const existingNextRow = ledgerRecords.find(r => r.date === nextShiftDate);
      if (existingNextRow) {
        const nextRec = parseFloat(existingNextRow.receiveStock) || 0;
        const nextSell = parseFloat(existingNextRow.sellStock) || 0;
        const nextTotal = activeRow.closingStock + nextRec;
        const nextClosing = nextTotal - nextSell;
        await db.tankLedger.update(existingNextRow.id, {
          openingStock: activeRow.closingStock,
          totalStock: Number(nextTotal.toFixed(2)),
          closingStock: Number(nextClosing.toFixed(2)),
          updatedAt: new Date().toISOString()
        });
      } else {
        await db.tankLedger.add({
          tankId: activeRow.tankId,
          date: nextShiftDate,
          openingStock: activeRow.closingStock, // Pure carry forward!
          receiveStock: 0,
          totalStock: activeRow.closingStock,
          sellStock: 0,
          closingStock: activeRow.closingStock,
          createdAt: new Date().toISOString()
        });
      }
    }

    // Persist into pump_stock_patrak_store in localStorage
    const allTanks = await db.tanks.toArray();
    const allLedgers = await db.tankLedger.toArray();
    localStorage.setItem('pump_stock_patrak_store', JSON.stringify({ tanks: allTanks, ledgers: allLedgers }));

    window.dispatchEvent(new CustomEvent('stock_patrak_updated', {
      detail: { date: selectedDate, nextShiftDate, isFinalized: true }
    }));
    window.dispatchEvent(new Event('stock_patrak_sync'));

    if (showToast) {
      showToast(`Shift saved successfully for ${selectedDate} (${activeShift})`, 'success');
    }

    return { success: true, snapshot };
  } catch (error) {
    console.error('Error in processShiftSave:', error);
    if (showToast) {
      showToast(`Failed to save shift: ${error.message}`, 'error');
    }
    return { success: false, error };
  }
}

export async function loadShiftForDate(targetDate, shiftType = 'Day Shift (Morning 6am - 6pm)') {
  try {
    const result = await getShiftSnapshotForDate(targetDate, shiftType);
    return result;
  } catch (error) {
    console.error('Error loading shift snapshot:', error);
    return { snapshot: null, isExact: false };
  }
}
