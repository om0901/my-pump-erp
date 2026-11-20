const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getBaseDataDir: () => ipcRenderer.invoke('get-base-data-dir'),
  writeLocalFile: (subdir, filename, content) => ipcRenderer.invoke('write-local-file', subdir, filename, content),
  readLocalFile: (subdir, filename) => ipcRenderer.invoke('read-local-file', subdir, filename),
  listLocalFiles: (subdir) => ipcRenderer.invoke('list-local-files', subdir),
  closeWindow: () => ipcRenderer.send('window-close'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  quitApp: () => {
    ipcRenderer.send('window-close');
    ipcRenderer.invoke('app-quit');
  },
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('MY PUMP Electron Desktop Engine Loaded.');
});
