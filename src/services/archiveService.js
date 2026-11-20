/**
 * archiveService.js
 * Manages permanent shift snapshot archives for the MyPump ERP.
 *
 * Storage strategy (triple-layer):
 *  1. Dexie.js IndexedDB  → shift_archives table (primary, always persisted)
 *  2. localStorage        → my_pump_daily_shifts_archive (fast read cache)
 *  3. Local file system   → C:\MyPumpData\archives\{date}_{SHIFT}.json
 *                           via localFileService (File System Access API)
 */

import { db } from '../db/database';
import { writeLocalFile, readLocalFile, listLocalFiles } from './localFileService';

// Normalize shift type to a clean file-safe key: e.g. "DAY" or "NIGHT"
function shiftKey(shiftType) {
  const s = (shiftType || '').toLowerCase();
  if (s.includes('night')) return 'NIGHT';
  return 'DAY';
}

// Build the archive record key
function buildArchiveKey(date, shiftType) {
  return `${date}_${shiftKey(shiftType)}`;
}

// Build the archive filename
function buildArchiveFilename(date, shiftType) {
  return `${buildArchiveKey(date, shiftType)}.json`;
}

// ─── SAVE ────────────────────────────────────────────────────────────────────

/**
 * Permanently save a complete shift snapshot.
 * Writes to Dexie, localStorage, and (if folder handle set) local JSON file.
 *
 * @param {string} date          - e.g. "2026-10-14"
 * @param {string} shiftType     - e.g. "Day Shift (Morning 6am - 6pm)"
 * @param {object} snapshotData  - the full shift state object
 * @returns {object} { success, archiveKey, writtenToDisk }
 */
export async function saveShiftArchive(date, shiftType, snapshotData) {
  const archiveKey = buildArchiveKey(date, shiftType);
  const filename = buildArchiveFilename(date, shiftType);

  const record = {
    archiveKey,
    date,
    shiftType,
    shiftKeyShort: shiftKey(shiftType),
    status: 'LOCKED',
    savedAt: new Date().toISOString(),
    snapshot: snapshotData,
  };

  // 1. Dexie IndexedDB
  try {
    await db.shift_archives.put(record);
  } catch (err) {
    console.error('[archiveService] Dexie write failed:', err);
  }

  // 2. localStorage fast-cache
  try {
    const existing = _loadLocalStorageArchiveMap();
    existing[archiveKey] = {
      date,
      shiftType,
      status: 'LOCKED',
      savedAt: record.savedAt,
      snapshot: snapshotData,
    };
    localStorage.setItem('my_pump_daily_shifts_archive', JSON.stringify(existing));
  } catch (err) {
    console.warn('[archiveService] localStorage cache failed:', err);
  }

  // 3. Local file (C:\MyPumpData\archives\)
  const jsonContent = JSON.stringify(record, null, 2);
  let writtenToDisk = false;
  try {
    writtenToDisk = await writeLocalFile('archives', filename, jsonContent);
  } catch (err) {
    console.warn('[archiveService] File write failed:', err);
  }

  return { success: true, archiveKey, writtenToDisk, filename };
}

// ─── LOAD ────────────────────────────────────────────────────────────────────

/**
 * Load a specific shift's archived snapshot.
 * Falls back through: Dexie → localStorage → local file.
 *
 * @param {string} date
 * @param {string} shiftType
 * @returns {{ snapshot: object|null, isLocked: boolean, savedAt: string|null }}
 */
export async function loadShiftArchive(date, shiftType) {
  const archiveKey = buildArchiveKey(date, shiftType);

  // 1. Try Dexie first (most reliable)
  try {
    const rec = await db.shift_archives.get(archiveKey);
    if (rec && rec.snapshot) {
      return { snapshot: rec.snapshot, isLocked: rec.status === 'LOCKED', savedAt: rec.savedAt };
    }
  } catch (err) {
    console.warn('[archiveService] Dexie read failed:', err);
  }

  // 2. Try localStorage fallback
  try {
    const map = _loadLocalStorageArchiveMap();
    // Exact match
    if (map[archiveKey]) {
      const r = map[archiveKey];
      return { snapshot: r.snapshot, isLocked: r.status === 'LOCKED', savedAt: r.savedAt };
    }
    // Date-only match (any shift for that date)
    const dateKey = Object.keys(map).find(k => k.startsWith(date));
    if (dateKey && map[dateKey]) {
      const r = map[dateKey];
      return { snapshot: r.snapshot, isLocked: r.status === 'LOCKED', savedAt: r.savedAt };
    }
  } catch (err) {
    console.warn('[archiveService] localStorage read failed:', err);
  }

  // 3. Try local file
  try {
    const filename = buildArchiveFilename(date, shiftType);
    const content = await readLocalFile('archives', filename);
    if (content) {
      const rec = JSON.parse(content);
      return { snapshot: rec.snapshot, isLocked: rec.status === 'LOCKED', savedAt: rec.savedAt };
    }
  } catch (err) {
    console.warn('[archiveService] Local file read failed:', err);
  }

  return { snapshot: null, isLocked: false, savedAt: null };
}

// ─── LIST ────────────────────────────────────────────────────────────────────

/**
 * Get a list of all archived shift dates (sorted ascending).
 * @returns {Array<{ archiveKey, date, shiftType, savedAt, status }>}
 */
export async function listAllArchives() {
  const results = [];

  // Try Dexie first
  try {
    const records = await db.shift_archives.toArray();
    if (records && records.length > 0) {
      records.forEach(r => {
        results.push({
          archiveKey: r.archiveKey,
          date: r.date,
          shiftType: r.shiftType,
          savedAt: r.savedAt,
          status: r.status,
        });
      });
      results.sort((a, b) => a.archiveKey.localeCompare(b.archiveKey));
      return results;
    }
  } catch (err) {
    console.warn('[archiveService] Dexie list failed:', err);
  }

  // Fallback: localStorage
  try {
    const map = _loadLocalStorageArchiveMap();
    Object.keys(map).sort().forEach(key => {
      const r = map[key];
      results.push({
        archiveKey: key,
        date: r.date || key.slice(0, 10),
        shiftType: r.shiftType || key.slice(11),
        savedAt: r.savedAt,
        status: r.status || 'LOCKED',
      });
    });
  } catch (err) {
    console.warn('[archiveService] localStorage list failed:', err);
  }

  return results;
}

/**
 * Check whether a specific date+shift has a saved archive.
 */
export async function hasArchiveForDate(date, shiftType) {
  const { snapshot } = await loadShiftArchive(date, shiftType);
  return !!snapshot;
}

/**
 * Get a list of all archived dates (just the date strings).
 */
export async function getArchivedDateList() {
  const all = await listAllArchives();
  return [...new Set(all.map(r => r.date))].sort();
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────

/**
 * Write a full database backup JSON to the backups/ folder.
 * @param {object} backupData - full export object
 */
export async function writeBackupFile(backupData) {
  const filename = `BACKUP_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const content = JSON.stringify(backupData, null, 2);
  return writeLocalFile('backups', filename, content);
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

function _loadLocalStorageArchiveMap() {
  try {
    const raw = localStorage.getItem('my_pump_daily_shifts_archive');
    if (raw) {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    }
  } catch { }
  return {};
}
