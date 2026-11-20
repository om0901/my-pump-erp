const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Optimize cold-start latency & Chromium cache verification delays
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// Resolve data directory: strictly C:\MyPumpData\ with fallback to Electron appData
function resolveDataDirectory() {
  const primaryPath = 'C:\\MyPumpData';

  try {
    if (!fs.existsSync(primaryPath)) {
      fs.mkdirSync(primaryPath, { recursive: true });
    }
    return primaryPath;
  } catch (e) {
    console.warn('Could not create primary C:\\MyPumpData directory, falling back:', e);
  }

  try {
    const fallbackPath = path.join(app.getPath('userData'), 'MyPumpData');
    if (!fs.existsSync(fallbackPath)) {
      fs.mkdirSync(fallbackPath, { recursive: true });
    }
    return fallbackPath;
  } catch (e) {
    return app.getPath('userData');
  }
}

const baseDataDir = resolveDataDirectory();

// Ensure archives, backups, and app_data folders exist in C:\MyPumpData
const appDataDir = path.join(baseDataDir, 'app_data');
const archivesDir = path.join(baseDataDir, 'archives');
const backupsDir = path.join(baseDataDir, 'backups');

[baseDataDir, appDataDir, archivesDir, backupsDir].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn('Directory auto-create skipped for:', dir, e);
  }
});

// Ensure SQLite database file placeholder exists in C:\MyPumpData
try {
  const sqliteFile = path.join(baseDataDir, 'pump_database.sqlite');
  if (!fs.existsSync(sqliteFile)) {
    fs.writeFileSync(sqliteFile, '', 'utf8');
  }
} catch (e) {
  console.warn('Could not initialize pump_database.sqlite placeholder:', e);
}

// Bind Electron userData strictly to baseDataDir/app_data so IndexedDB & LocalStorage are stored permanently
try {
  app.setPath('userData', appDataDir);
} catch (e) {
  console.warn('Could not set custom userData path:', e);
}

// Ensure Single Instance Lock on appDataDir so multiple .exe processes do not collide on SQLite / IndexedDB
let mainWindow = null;
let isAppClosing = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// IPC Handlers for direct native file system operations
ipcMain.handle('get-base-data-dir', () => {
  return baseDataDir;
});

ipcMain.handle('write-local-file', async (event, subdir, filename, content) => {
  try {
    const targetDir = subdir ? path.join(baseDataDir, subdir) : baseDataDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const filePath = path.join(targetDir, filename);
    await fs.promises.writeFile(filePath, content, 'utf8');
    return true;
  } catch (err) {
    console.error('IPC write-local-file error:', err);
    return false;
  }
});

ipcMain.handle('read-local-file', async (event, subdir, filename) => {
  try {
    const targetDir = subdir ? path.join(baseDataDir, subdir) : baseDataDir;
    const filePath = path.join(targetDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (err) {
    return null;
  }
});

ipcMain.handle('list-local-files', async (event, subdir) => {
  try {
    const targetDir = subdir ? path.join(baseDataDir, subdir) : baseDataDir;
    if (!fs.existsSync(targetDir)) return [];
    const files = await fs.promises.readdir(targetDir);
    return files.sort();
  } catch (err) {
    return [];
  }
});

app.on('before-quit', () => {
  isAppClosing = true;
});

// IPC Handlers for window actions & controls
ipcMain.on('window-close', () => {
  isAppClosing = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

ipcMain.handle('window-close', () => {
  isAppClosing = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('app-quit', () => {
  isAppClosing = true;
  app.quit();
});

ipcMain.on('app-quit', () => {
  isAppClosing = true;
  app.quit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MY PUMP - Daily Sales & ERP System',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Prevent navigation to unknown external destinations, while allowing internal app operations
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url && (url.startsWith('file://') || url.startsWith('http://localhost:5173') || url.startsWith('about:blank'))) {
      return;
    }
    e.preventDefault();
  });

  mainWindow.webContents.on('will-redirect', (e, url) => {
    if (url && (url.startsWith('file://') || url.startsWith('http://localhost:5173') || url.startsWith('about:blank'))) {
      return;
    }
    e.preventDefault();
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.warn('Renderer process note:', details);
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Remove application top menu bar for clean ERP interface
  Menu.setApplicationMenu(null);

  // Block browser refresh keyboard shortcuts at the main window level
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || ((input.control || input.meta) && (input.key === 'r' || input.key === 'R'))) {
      event.preventDefault();
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev && !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    // Allow immediate close if user clicks native 'X' or Alt+F4
    if (!isAppClosing) {
      isAppClosing = true;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  isAppClosing = true;
  if (process.platform !== 'darwin') app.quit();
});
