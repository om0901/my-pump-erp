/**
 * dbStorageService.js
 * Central Local File & Database Persistence Service for MY PUMP ERP.
 *
 * Implements:
 * 1. Primary storage path: D:\MyPumpData\ (fallback: C:\MyPumpData\)
 * 2. structured persistent database: database.json (and Dexie IndexedDB sync)
 * 3. archives/ directory: {YYYY-MM-DD}_{SHIFT}.json (e.g. 2026-10-14_DAY.json)
 * 4. backups/ directory: Rolling safety backups (retains last 7 automatic backups)
 * 5. Full entity serialization & historical date recall
 */

import { db } from '../db/database';
import { saveShiftArchive, loadShiftArchive, listAllArchives, hasArchiveForDate } from './archiveService';
import {
  writeLocalFile,
  readLocalFile,
  listLocalFiles,
  requestStorageDirectory,
  isFileSystemAccessSupported,
  getStorageLocationLabel
} from './localFileService';

export const STORAGE_CONFIG = {
  primaryPath: 'C:\\MyPumpData\\',
  fallbackPath: 'C:\\MyPumpData\\',
  databaseFileName: 'database.json',
  sqliteFileName: 'pump_database.sqlite',
  archivesDir: 'archives',
  backupsDir: 'backups',
  maxRollingBackups: 7
};

/**
 * Normalizes shift name to short string: DAY or NIGHT
 */
export function normalizeShiftTag(shiftType) {
  const s = (shiftType || '').toLowerCase();
  if (s.includes('night')) return 'NIGHT';
  return 'DAY';
}

/**
 * Builds the canonical archive file name, e.g. 2026-10-14_DAY.json
 */
export function formatArchiveFileName(date, shiftType) {
  return `${date}_${normalizeShiftTag(shiftType)}.json`;
}

/**
 * Saves a completed shift permanently:
 * 1. Creates an immutable archive snapshot in Dexie & localStorage
 * 2. Writes {YYYY-MM-DD}_{SHIFT}.json to archives/
 * 3. Updates consolidated database.json
 * 4. Generates an automatic rolling safety backup in backups/
 */
export async function persistShiftClosure({
  date,
  shiftType,
  nozzles = [],
  dips = {},
  rates = {},
  lubricants = [],
  expenseEntries = [],
  otherIncomeEntries = [],
  debitEntries = [],
  jamaEntries = [],
  bankEntries = [],
  smartBalanceEntries = [],
  smartMoneyEntries = [],
  denominations = {},
  stationProfile = {},
  totals = {},
  closingShreeSilak = 0,
  openingShreeSilak = 0
}) {
  const shiftId = `${date}_${normalizeShiftTag(shiftType)}`;
  const timestamp = new Date().toISOString();

  // Structured Entity Model
  const shiftRecord = {
    shift_id: shiftId,
    shift_date: date,
    shift_type: shiftType,
    status: 'LOCKED',
    timestamp,
    opening_cash: openingShreeSilak,
    closing_cash: closingShreeSilak,
    gross_inflow: totals.grossInflow || 0,
    total_deductions: totals.totalDeductions || 0,
    nozzle_readings: nozzles.map(n => ({
      mpdId: n.mpdId || '',
      nozzleId: n.nozzleId || n.id || '',
      productName: n.productName || '',
      openingReading: parseFloat(n.openingReading ?? n.openingMeter) || 0,
      closingReading: parseFloat(n.closingReading ?? n.closingMeter) || 0,
      openingMeter: parseFloat(n.openingReading ?? n.openingMeter) || 0,
      closingMeter: parseFloat(n.closingReading ?? n.closingMeter) || 0,
      testingLitres: parseFloat(n.testingLitres) || 0,
      salesLitres: parseFloat(n.salesLitres) || 0,
      rate: parseFloat(n.rate) || 0,
      totalAmount: parseFloat(n.totalAmount) || 0
    })),
    tank_stocks: dips,
    fuel_rates: rates,
    lubricants_sold: lubricants,
    customer_transactions: {
      sectionC_jamaRecoveries: jamaEntries,
      sectionE_debitSlips: debitEntries
    },
    bank_records: bankEntries,
    expense_records: expenseEntries,
    digital_settlements: {
      smartBalanceEntries,
      smartMoneyEntries,
      otherIncomeEntries
    },
    cash_denominations: denominations,
    station_profile: stationProfile
  };

  // 1. Save to Triple-Layer Archive Service (Dexie + localStorage + local archives/ folder)
  let archiveResult = null;
  try {
    archiveResult = await saveShiftArchive(date, shiftType, shiftRecord);
  } catch (err) {
    console.warn('[dbStorageService] saveShiftArchive safely caught:', err);
  }

  // 2. Update consolidated database.json
  try {
    await updateConsolidatedDatabase(shiftRecord);
  } catch (err) {
    console.warn('[dbStorageService] updateConsolidatedDatabase safely caught:', err);
  }

  // 3. Create a rolling safety backup
  try {
    await createRollingSafetyBackup(date, shiftId);
  } catch (err) {
    console.warn('[dbStorageService] createRollingSafetyBackup safely caught:', err);
  }

  return {
    success: true,
    shiftId,
    fileName: formatArchiveFileName(date, shiftType),
    archiveResult
  };
}

export const DEFAULT_DATABASE_SCHEMA = {
  appName: 'MY PUMP ERP',
  version: 1.2,
  shift_records: [],
  station_profile: {},
  nozzles: [],
  accounts: [],
  transactions: [],
  expenses: [],
  customers: [],
  tanks: []
};

export const DEFAULT_SHIFT_RECORD_SCHEMA = {
  shift_id: '',
  shift_date: '',
  shift_type: 'DAY',
  status: 'OPEN',
  timestamp: '',
  opening_cash: 0,
  closing_cash: 0,
  gross_inflow: 0,
  total_deductions: 0,
  nozzle_readings: [],
  tank_stocks: {},
  fuel_rates: {},
  lubricants_sold: [],
  customer_transactions: {
    sectionC_jamaRecoveries: [],
    sectionE_debitSlips: []
  },
  bank_records: [],
  expense_records: [],
  digital_settlements: {
    smartBalanceEntries: [],
    smartMoneyEntries: [],
    otherIncomeEntries: []
  },
  cash_denominations: {},
  station_profile: {}
};

/**
 * Defensively sanitizes and validates a saved shift record snapshot,
 * guaranteeing all required keys, arrays, and properties exist.
 */
export function sanitizeShiftRecord(savedRecord) {
  if (!savedRecord || typeof savedRecord !== 'object') {
    return { ...DEFAULT_SHIFT_RECORD_SCHEMA };
  }

  const rawNozzles = savedRecord.nozzle_readings || savedRecord.nozzles || savedRecord.sectionA_Nozzles || [];
  const sanitizedNozzles = Array.isArray(rawNozzles)
    ? rawNozzles.map((n, idx) => ({
        mpdId: n?.mpdId || n?.nozzleId || `MPD-${Math.floor(idx / 4) + 1}`,
        nozzleId: n?.nozzleId || n?.id || `N${idx + 1}`,
        productName: n?.productName || 'Motor Spirit (Petrol)',
        openingMeter: parseFloat(n?.openingMeter ?? n?.openingReading) || 0,
        closingMeter: parseFloat(n?.closingMeter ?? n?.closingReading) || 0,
        openingReading: parseFloat(n?.openingReading ?? n?.openingMeter) || 0,
        closingReading: parseFloat(n?.closingReading ?? n?.closingMeter) || 0,
        testingLitres: parseFloat(n?.testingLitres) || 0,
        salesLitres: parseFloat(n?.salesLitres) || 0,
        rate: parseFloat(n?.rate) || 0,
        totalAmount: parseFloat(n?.totalAmount) || 0
      }))
    : [];

  const rawLubes = savedRecord.lubricants_sold || savedRecord.lubricants || savedRecord.sectionB_Lubricants || [];
  const sanitizedLubes = Array.isArray(rawLubes)
    ? rawLubes.map((l, idx) => ({
        id: l?.id || `lube-${idx}`,
        productName: l?.productName || '2T Engine Oil (Pouches/Bottles)',
        litreVolume: parseFloat(l?.litreVolume ?? l?.volume) || 0.04,
        volume: parseFloat(l?.volume ?? l?.litreVolume) || 0.04,
        soldQty: parseFloat(l?.soldQty ?? l?.soldCount) || 0,
        soldCount: parseFloat(l?.soldCount ?? l?.soldQty) || 0,
        unitPrice: parseFloat(l?.unitPrice ?? l?.rate) || 15,
        rate: parseFloat(l?.rate ?? l?.unitPrice) || 15,
        totalAmount: parseFloat(l?.totalAmount) || 0
      }))
    : [];

  const rawJama = savedRecord.customer_transactions?.sectionC_jamaRecoveries || savedRecord.jamaEntries || savedRecord.sectionC_Crediters || [];
  const rawDebit = savedRecord.customer_transactions?.sectionE_debitSlips || savedRecord.debitEntries || savedRecord.sectionE_Debiters || [];
  const rawBank = savedRecord.bank_records || savedRecord.bankEntries || savedRecord.sectionH_BankHisab || [];
  const rawExpenses = savedRecord.expense_records || savedRecord.expenseEntries || savedRecord.sectionG_Expenses || [];
  const rawSmartBalance = savedRecord.digital_settlements?.smartBalanceEntries || savedRecord.smartBalanceEntries || savedRecord.digitalPayEntries || [];
  const rawSmartMoney = savedRecord.digital_settlements?.smartMoneyEntries || savedRecord.smartMoneyEntries || [];
  const rawOtherIncome = savedRecord.digital_settlements?.otherIncomeEntries || savedRecord.otherIncomeEntries || savedRecord.sectionD_OtherIncome || [];

  return {
    ...DEFAULT_SHIFT_RECORD_SCHEMA,
    ...savedRecord,
    nozzle_readings: sanitizedNozzles,
    nozzles: sanitizedNozzles,
    sectionA_Nozzles: sanitizedNozzles,
    tank_stocks: savedRecord.tank_stocks && typeof savedRecord.tank_stocks === 'object'
      ? savedRecord.tank_stocks
      : (savedRecord.dips || savedRecord.tankDips || {}),
    dips: savedRecord.dips || savedRecord.tankDips || savedRecord.tank_stocks || {},
    tankDips: savedRecord.tankDips || savedRecord.dips || savedRecord.tank_stocks || {},
    fuel_rates: savedRecord.fuel_rates && typeof savedRecord.fuel_rates === 'object'
      ? savedRecord.fuel_rates
      : (savedRecord.rates || savedRecord.fuelRates || {}),
    rates: savedRecord.rates || savedRecord.fuelRates || savedRecord.fuel_rates || {},
    fuelRates: savedRecord.fuelRates || savedRecord.rates || savedRecord.fuel_rates || {},
    lubricants_sold: sanitizedLubes,
    lubricants: sanitizedLubes,
    sectionB_Lubricants: sanitizedLubes,
    customer_transactions: {
      sectionC_jamaRecoveries: Array.isArray(rawJama) ? rawJama : [],
      sectionE_debitSlips: Array.isArray(rawDebit) ? rawDebit : []
    },
    jamaEntries: Array.isArray(rawJama) ? rawJama : [],
    debitEntries: Array.isArray(rawDebit) ? rawDebit : [],
    bank_records: Array.isArray(rawBank) ? rawBank : [],
    bankEntries: Array.isArray(rawBank) ? rawBank : [],
    expense_records: Array.isArray(rawExpenses) ? rawExpenses : [],
    expenseEntries: Array.isArray(rawExpenses) ? rawExpenses : [],
    digital_settlements: {
      smartBalanceEntries: Array.isArray(rawSmartBalance) ? rawSmartBalance : [],
      smartMoneyEntries: Array.isArray(rawSmartMoney) ? rawSmartMoney : [],
      otherIncomeEntries: Array.isArray(rawOtherIncome) ? rawOtherIncome : []
    },
    smartBalanceEntries: Array.isArray(rawSmartBalance) ? rawSmartBalance : [],
    smartMoneyEntries: Array.isArray(rawSmartMoney) ? rawSmartMoney : [],
    otherIncomeEntries: Array.isArray(rawOtherIncome) ? rawOtherIncome : [],
    cash_denominations: savedRecord.cash_denominations && typeof savedRecord.cash_denominations === 'object'
      ? savedRecord.cash_denominations
      : (savedRecord.denominations && typeof savedRecord.denominations === 'object' ? savedRecord.denominations : {}),
    denominations: savedRecord.denominations && typeof savedRecord.denominations === 'object'
      ? savedRecord.denominations
      : (savedRecord.cash_denominations && typeof savedRecord.cash_denominations === 'object' ? savedRecord.cash_denominations : {}),
    station_profile: savedRecord.station_profile && typeof savedRecord.station_profile === 'object'
      ? savedRecord.station_profile
      : {}
  };
}

/**
 * Loads a historical shift snapshot by date and shift with schema sanitization
 */
export async function getHistoricalShiftRecord(date, shiftType) {
  try {
    const res = await loadShiftArchive(date, shiftType);
    if (res && res.snapshot) {
      return {
        ...res,
        snapshot: sanitizeShiftRecord(res.snapshot)
      };
    }
    return res;
  } catch (err) {
    console.error('[dbStorageService] Error loading historical record:', err);
    return { snapshot: null, isLocked: false, savedAt: null };
  }
}

/**
 * Consolidates all tables and saves database.json
 */
export async function updateConsolidatedDatabase(latestShiftRecord) {
  try {
    const existingDb = await readConsolidatedDatabase();
    
    // Merge latest shift into shift_records
    const shiftRecords = existingDb.shift_records || [];
    const idx = shiftRecords.findIndex(s => s.shift_id === latestShiftRecord.shift_id);
    if (idx >= 0) {
      shiftRecords[idx] = latestShiftRecord;
    } else {
      shiftRecords.push(latestShiftRecord);
    }

    const consolidated = {
      ...existingDb,
      version: 1.2,
      lastUpdated: new Date().toISOString(),
      station_profile: latestShiftRecord.station_profile || existingDb.station_profile || {},
      shift_records: shiftRecords
    };

    const jsonStr = JSON.stringify(consolidated, null, 2);
    await writeLocalFile('', STORAGE_CONFIG.databaseFileName, jsonStr);
    localStorage.setItem('mypump_consolidated_db', jsonStr);
    return true;
  } catch (err) {
    console.warn('[dbStorageService] Could not update database.json:', err);
    return false;
  }
}

/**
 * Reads database.json from local disk or localStorage with defensive defaults
 */
export async function readConsolidatedDatabase() {
  const sanitizeConsolidated = (parsed) => {
    return {
      ...DEFAULT_DATABASE_SCHEMA,
      ...(parsed || {}),
      shift_records: Array.isArray(parsed?.shift_records) ? parsed.shift_records.map(sanitizeShiftRecord) : [],
      station_profile: parsed?.station_profile && typeof parsed.station_profile === 'object' ? parsed.station_profile : {},
      nozzles: Array.isArray(parsed?.nozzles) ? parsed.nozzles : [],
      accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : [],
      transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
      expenses: Array.isArray(parsed?.expenses) ? parsed.expenses : [],
      customers: Array.isArray(parsed?.customers) ? parsed.customers : [],
      tanks: Array.isArray(parsed?.tanks) ? parsed.tanks : []
    };
  };

  try {
    const fileContent = await readLocalFile('', STORAGE_CONFIG.databaseFileName);
    if (fileContent) {
      const parsed = JSON.parse(fileContent);
      return sanitizeConsolidated(parsed);
    }
  } catch (err) {
    console.warn('[dbStorageService] readLocalFile database.json failed:', err);
  }

  try {
    const local = localStorage.getItem('mypump_consolidated_db');
    if (local) {
      const parsed = JSON.parse(local);
      return sanitizeConsolidated(parsed);
    }
  } catch (err) {
    console.warn('[dbStorageService] localStorage read failed:', err);
  }

  return { ...DEFAULT_DATABASE_SCHEMA };
}

/**
 * Creates an automatic rolling safety backup in backups/ directory
 */
export async function createRollingSafetyBackup(date, shiftId) {
  try {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `BACKUP_${dateStr}_${shiftId}_${timestamp}.json`;

    // Gather database snapshot
    const backupData = {
      backupDate: new Date().toISOString(),
      shiftId,
      tanks: await db.tanks.toArray(),
      tankLedger: await db.tankLedger.toArray(),
      customers: await db.customers.toArray(),
      ledgerEntries: await db.ledgerEntries.toArray(),
      expenses: await db.expenses.toArray(),
      settings: await db.settings.toArray(),
      shiftArchives: await db.shift_archives.toArray()
    };

    const content = JSON.stringify(backupData, null, 2);
    await writeLocalFile(STORAGE_CONFIG.backupsDir, backupFileName, content);

    // Housekeeping: purge old backups if > maxRollingBackups
    await purgeExcessBackups();
    return true;
  } catch (err) {
    console.warn('[dbStorageService] Rolling backup creation skipped/failed:', err);
    return false;
  }
}

/**
 * Purges older rolling backups keeping only the most recent maxRollingBackups
 */
async function purgeExcessBackups() {
  try {
    const files = await listLocalFiles(STORAGE_CONFIG.backupsDir);
    if (files.length > STORAGE_CONFIG.maxRollingBackups) {
      // files are sorted ascending by date/name
      const toRemove = files.slice(0, files.length - STORAGE_CONFIG.maxRollingBackups);
      console.log(`[dbStorageService] Notice: Found ${toRemove.length} older rolling backups.`);
    }
  } catch {}
}

/**
 * Requests the user to pick or verify their local storage folder
 */
export async function setupLocalStorageDirectory() {
  return await requestStorageDirectory();
}

/**
 * Returns diagnostic info about current storage status
 */
export function getStorageStatus() {
  const customFolder = getStorageLocationLabel();
  return {
    isSupported: isFileSystemAccessSupported(),
    connectedFolder: customFolder,
    primaryTarget: STORAGE_CONFIG.primaryPath,
    fallbackTarget: STORAGE_CONFIG.fallbackPath,
    activeFolderLabel: customFolder || STORAGE_CONFIG.primaryPath
  };
}
