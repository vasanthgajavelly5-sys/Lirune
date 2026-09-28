const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noveraDesktop', {
  isDesktop: true,
  platform: process.platform,

  // Native Windows File Dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:open-files'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),

  // Windows Explorer Integration
  showInExplorer: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),

  // Storage Management
  saveBookToStorage: (fileName, arrayBuffer, storageId) => ipcRenderer.invoke('fs:save-book', { fileName, storageId, buffer: arrayBuffer }),
  deleteBookFromStorage: (storageId) => ipcRenderer.invoke('fs:delete-book', storageId),
  getStoragePath: () => ipcRenderer.invoke('fs:get-storage-path'),
  readBookFile: (filePath) => ipcRenderer.invoke('fs:read-book', filePath),
  readManagedBook: (storageId, fingerprint, fileSize) => ipcRenderer.invoke('fs:read-managed-book', { storageId, fingerprint, fileSize }),
  listManagedBooks: () => ipcRenderer.invoke('fs:list-managed-books'),
  inspectManagedBook: (storageId) => ipcRenderer.invoke('fs:inspect-managed-book', { storageId }),
  deleteOrphanFiles: (storageIds, referencedIds) => ipcRenderer.invoke('fs:delete-orphan-files', { storageIds, referencedIds }),

  // Native Electron fullscreen state
  toggleNativeFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  isNativeFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Metadata
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Listen for file opened by Windows Explorer / CLI / Drag to app
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file-from-os', (_event, filePath) => callback(filePath));
  },
  onNativeFullscreenChanged: (callback) => {
    ipcRenderer.on('native-fullscreen-changed', (_event, isFullscreen) => callback(Boolean(isFullscreen)));
  }
});
