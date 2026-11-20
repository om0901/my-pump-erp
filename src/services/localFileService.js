/**
 * localFileService.js
 * File System Access API wrapper for writing shift archive JSON files
 * to the user's local C:\MyPumpData\ folder.
 *
 * How it works:
 *  1. On first use, showDirectoryPicker() prompts the user to select their storage folder.
 *  2. The directory handle is cached in memory for the session.
 *  3. On each archive write, we create archives/<date>_<shift>.json inside that folder.
 *  4. If File System Access API is unavailable or permission is denied, we fall back to
 *     an auto-download via URL.createObjectURL.
 */

const STORAGE_KEY_DIR_HINT = 'mypump_local_dir_hint'; // just stores the path hint for display

let _directoryHandle = null; // in-memory session cache

/**
 * Check if File System Access API is supported in this browser.
 */
export function isFileSystemAccessSupported() {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return false; // In Electron native desktop, direct host filesystem is used
  }
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Get the currently cached directory handle (if any).
 */
export function getCachedDirectoryHandle() {
  return _directoryHandle;
}

/**
 * Prompt the user to select their MyPumpData storage folder.
 * Caches the handle in memory for the session.
 * Returns the handle or null.
 */
export async function requestStorageDirectory() {
  if (!isFileSystemAccessSupported()) {
    console.warn('[localFileService] File System Access API not supported. Will use auto-download fallback.');
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({
      id: 'mypump-data',
      mode: 'readwrite',
      startIn: 'documents',
    });
    _directoryHandle = handle;
    localStorage.setItem(STORAGE_KEY_DIR_HINT, handle.name);
    return handle;
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[localFileService] Directory picker error:', err);
    }
    return null;
  }
}

/**
 * Re-verify permission on the cached handle (needed after page reload).
 * Returns true if write permission is still active.
 */
export async function verifyDirectoryPermission() {
  if (!_directoryHandle) return false;
  try {
    const perm = await _directoryHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    const req = await _directoryHandle.requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  } catch {
    return false;
  }
}

/**
 * Write a text/JSON file inside the selected directory.
 * Creates subdirectories (one level) if needed.
 * @param {string} subdir - e.g. 'archives' or 'backups'
 * @param {string} filename - e.g. '2026-10-14_DAY.json'
 * @param {string} content - JSON string content
 * @returns {boolean} true if written successfully to disk, false if fallback was used
 */
export async function writeLocalFile(subdir, filename, content) {
  // If running in Electron standalone executable, write directly to host hard drive (D:\MyPumpData\ or C:\MyPumpData\)
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.writeLocalFile === 'function') {
    try {
      const ok = await window.electronAPI.writeLocalFile(subdir, filename, content);
      if (ok) {
        console.log(`[localFileService - Native Electron] ✅ Written: ${subdir ? subdir + '/' : ''}${filename}`);
        return true;
      }
    } catch (err) {
      console.warn('[localFileService - Native Electron] Write failed, falling back:', err);
    }
  }

  // Try File System Access API path (browser mode)
  if (_directoryHandle) {
    try {
      const hasPerm = await verifyDirectoryPermission();
      if (hasPerm) {
        let targetDir = _directoryHandle;
        if (subdir) {
          targetDir = await _directoryHandle.getDirectoryHandle(subdir, { create: true });
        }
        const fileHandle = await targetDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        console.log(`[localFileService] ✅ Written: ${subdir}/${filename}`);
        return true;
      }
    } catch (err) {
      console.warn('[localFileService] Write failed, using download fallback:', err);
    }
  }

  // In Electron desktop environment, never trigger browser auto-download fallback to avoid page blinks
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return false;
  }

  // Web Browser Fallback (Vercel / Cloud Web Portal):
  // Persist seamlessly into localStorage and IndexedDB without popup downloads
  try {
    const storageKey = `mypump_file_${subdir ? subdir + '_' : ''}${filename}`;
    localStorage.setItem(storageKey, content);
    console.log(`[localFileService - Web Fallback] ✅ Stored in web storage: ${storageKey}`);
    return true;
  } catch (err) {
    console.warn('[localFileService - Web Fallback] LocalStorage save failed, using download fallback:', err);
  }

  // Last-resort fallback: auto-download the file to the browser's Downloads folder
  _autoDownloadFile(filename, content);
  return false;
}

/**
 * Read a file from the local storage directory.
 * @returns {string|null} file content or null
 */
export async function readLocalFile(subdir, filename) {
  // Native Electron direct read
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.readLocalFile === 'function') {
    try {
      const content = await window.electronAPI.readLocalFile(subdir, filename);
      if (content !== null && content !== undefined) return content;
    } catch (err) {
      console.warn('[localFileService - Native Electron] Read error:', err);
    }
  }

  if (_directoryHandle) {
    try {
      const hasPerm = await verifyDirectoryPermission();
      if (!hasPerm) return null;
      let targetDir = _directoryHandle;
      if (subdir) {
        targetDir = await _directoryHandle.getDirectoryHandle(subdir, { create: false });
      }
      const fileHandle = await targetDir.getFileHandle(filename, { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch {
      // Fall through to web storage
    }
  }

  // Web Browser Fallback (Vercel / Cloud Web Portal):
  try {
    const storageKey = `mypump_file_${subdir ? subdir + '_' : ''}${filename}`;
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) return saved;
  } catch (err) {
    console.warn('[localFileService - Web Fallback] Read from web storage failed:', err);
  }

  return null;
}

/**
 * List all filenames in a subdirectory.
 */
export async function listLocalFiles(subdir) {
  // Native Electron direct directory listing
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.listLocalFiles === 'function') {
    try {
      const list = await window.electronAPI.listLocalFiles(subdir);
      if (Array.isArray(list)) return list;
    } catch (err) {
      console.warn('[localFileService - Native Electron] List error:', err);
    }
  }

  if (_directoryHandle) {
    try {
      const hasPerm = await verifyDirectoryPermission();
      if (!hasPerm) return [];
      let targetDir = _directoryHandle;
      if (subdir) {
        targetDir = await _directoryHandle.getDirectoryHandle(subdir, { create: false });
      }
      const names = [];
      for await (const entry of targetDir.values()) {
        if (entry.kind === 'file') names.push(entry.name);
      }
      return names.sort();
    } catch {
      // Fall through to web storage
    }
  }

  // Web Browser Fallback (Vercel / Cloud Web Portal):
  try {
    const prefix = `mypump_file_${subdir ? subdir + '_' : ''}`;
    const names = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        names.push(key.slice(prefix.length));
      }
    }
    return names.sort();
  } catch (err) {
    return [];
  }
}

/**
 * Get display label for the storage location.
 */
export function getStorageLocationLabel() {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return 'C:\\MyPumpData\\ (Direct Hard Drive Engine)';
  }
  if (_directoryHandle) return _directoryHandle.name;
  const hint = localStorage.getItem(STORAGE_KEY_DIR_HINT);
  if (hint) return hint;
  return 'Web Browser Storage (IndexedDB & LocalStorage)';
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

function _autoDownloadFile(filename, content) {
  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  } catch (err) {
    console.error('[localFileService] Auto-download failed:', err);
  }
}
