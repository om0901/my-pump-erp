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
import { supabase } from '../lib/supabaseClient';
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

// ==============================================================================
// ACCOUNT-WISE DATA ISOLATION (CLOUD + LOCAL CACHE SYNC)
// ==============================================================================

/**
 * Namespace all local cache keys by user.id (e.g. mypump_${user.id}_data)
 * so two users on the same browser never overwrite each other's data.
 */
export function getNamespacedKey(userId, baseKey) {
  if (!userId) return `mypump_guest_${baseKey}`;
  return `mypump_${userId}_${baseKey}`;
}

export function getScopedLocalData(userId, baseKey, fallback = null) {
  try {
    const key = getNamespacedKey(userId, baseKey);
    const item = localStorage.getItem(key);
    if (item !== null) {
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    }
    // Fallback to legacy key if user key is not found
    const legacy = localStorage.getItem(baseKey);
    if (legacy !== null) {
      try {
        const parsed = JSON.parse(legacy);
        if (userId) setScopedLocalData(userId, baseKey, parsed);
        return parsed;
      } catch {
        return legacy;
      }
    }
  } catch (err) {
    console.warn(`[dbStorageService] getScopedLocalData error for ${baseKey}:`, err);
  }
  return fallback;
}

export function setScopedLocalData(userId, baseKey, data) {
  try {
    const key = getNamespacedKey(userId, baseKey);
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    localStorage.setItem(key, serialized);
  } catch (err) {
    console.warn(`[dbStorageService] setScopedLocalData error for ${baseKey}:`, err);
  }
}

/**
 * On Login: Fetch the user's data row from pump_station_data in Supabase.
 * If first time, initialize a fresh blank/default profile for that user_id.
 */
export async function fetchUserStationData(userId, defaultOverrides = {}) {
  if (!userId) return { data: null, error: 'User ID is required' };

  try {
    // 1. Query pump_station_data for this authenticated user_id
    const { data: row, error } = await supabase
      .from('pump_station_data')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[dbStorageService] Supabase fetch warning:', error.message);
    }

    if (row) {
      // Hydrate local cache namespaced by user.id
      setScopedLocalData(userId, 'data', row);
      if (row.station_profile) setScopedLocalData(userId, 'station_profile', row.station_profile);
      if (row.fuel_rates) setScopedLocalData(userId, 'pump_last_fuel_rates', row.fuel_rates);
      if (row.nozzle_config) setScopedLocalData(userId, 'pump_nozzle_master_config', row.nozzle_config);
      if (row.dip_levels) setScopedLocalData(userId, 'pump_last_dip_levels', row.dip_levels);
      if (row.other_accounts?.ushinaDirectory) setScopedLocalData(userId, 'pump_ushina_directory', row.other_accounts.ushinaDirectory);
      if (row.bank_hisab) setScopedLocalData(userId, 'pump_bank_accounts_master', row.bank_hisab);

      return { data: row, isNew: false, error: null };
    }

    // 2. First-time login: Initialize fresh default profile for that user_id
    const defaultProfile = {
      fuelStationName: defaultOverrides.fuelStationName || '',
      ownerName: defaultOverrides.ownerName || '',
      managerName: defaultOverrides.managerName || '',
      phone: defaultOverrides.mobile || '',
      email: defaultOverrides.email || '',
      gstin: defaultOverrides.gstin || '',
      address: defaultOverrides.address || '',
      openingShreeSilak: defaultOverrides.openingShreeSilak || 0,
      isOnboarded: false
    };

    const initialData = {
      user_id: userId,
      station_profile: defaultProfile,
      nozzle_config: defaultOverrides.nozzles || [],
      fuel_rates: defaultOverrides.fuel_rates || {
        'Motor Spirit (Petrol)': 0,
        'High Speed Diesel': 0,
        'Speed Petrol': 0,
        'CNG': 0
      },
      dip_levels: defaultOverrides.dip_levels || {
        msDipCm: 0,
        msDipLiters: 0,
        hsdDipCm: 0,
        hsdDipLiters: 0,
        speedDipCm: 0,
        speedDipLiters: 0
      },
      daily_shifts: [],
      other_accounts: {
        ushinaDirectory: defaultOverrides.ushinaDirectory || [],
        pumpExpenses: defaultOverrides.pumpExpenses || []
      },
      bank_hisab: defaultOverrides.bank_hisab || [],
      staff_attendance: {},
      updated_at: new Date().toISOString()
    };

    // Cache locally immediately
    setScopedLocalData(userId, 'data', initialData);
    setScopedLocalData(userId, 'station_profile', defaultProfile);

    // Persist to Supabase
    const { data: inserted, error: insertError } = await supabase
      .from('pump_station_data')
      .insert([initialData])
      .select()
      .maybeSingle();

    if (insertError) {
      console.warn('[dbStorageService] Supabase insert default row warning:', insertError.message);
    }

    return { data: inserted || initialData, isNew: true, error: insertError };
  } catch (err) {
    console.error('[dbStorageService] fetchUserStationData error:', err);
    // Offline fallback to local cache
    const cached = getScopedLocalData(userId, 'data');
    return { data: cached, isNew: false, error: err };
  }
}

/**
 * On Save (Ctrl+S or auto-save): Upsert the state cleanly into pump_station_data
 * for that user.id in the background without reloading the page.
 */
export async function upsertUserStationData(userId, snapshot = {}) {
  if (!userId) return { success: false, error: 'User ID is required' };

  try {
    const payload = {
      user_id: userId,
      station_profile: snapshot.stationProfile || snapshot.station_profile || {},
      nozzle_config: snapshot.nozzles || snapshot.nozzle_config || [],
      fuel_rates: snapshot.rates || snapshot.fuel_rates || {},
      dip_levels: snapshot.dips || snapshot.dip_levels || {},
      daily_shifts: snapshot.dailyShifts || snapshot.daily_shifts || [],
      other_accounts: snapshot.otherAccounts || snapshot.other_accounts || {},
      bank_hisab: snapshot.bankEntries || snapshot.bank_hisab || [],
      staff_attendance: snapshot.staffAttendance || snapshot.staff_attendance || {},
      updated_at: new Date().toISOString()
    };

    // 1. Immediately update namespaced local cache so UI is instantaneous
    setScopedLocalData(userId, 'data', payload);
    if (payload.station_profile) setScopedLocalData(userId, 'station_profile', payload.station_profile);
    if (payload.fuel_rates) setScopedLocalData(userId, 'pump_last_fuel_rates', payload.fuel_rates);
    if (payload.nozzle_config) setScopedLocalData(userId, 'pump_nozzle_master_config', payload.nozzle_config);
    if (payload.dip_levels) setScopedLocalData(userId, 'pump_last_dip_levels', payload.dip_levels);

    // 2. Background Upsert to Supabase pump_station_data table
    const { data, error } = await supabase
      .from('pump_station_data')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.warn('[dbStorageService] Supabase upsert error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('[dbStorageService] upsertUserStationData unexpected error:', err);
    return { success: false, error: err?.message || 'Failed to upsert station data' };
  }
}

