const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const JSZip = require('jszip');
const crypto = require('crypto');
const { fingerprintBuffer, storageIdForFingerprint, isStorageId } = require('./scripts/storage-contract');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.novera.reader');
}

// Formats the application can open. Kept in sync with js/formats.js; the
// renderer performs the authoritative content-based detection.
const SUPPORTED_EXTENSIONS = ['epub', 'pdf', 'txt', 'html', 'htm', 'fb2', 'cbz', 'docx', 'odt', 'rtf'];
const OPENABLE_EXTENSIONS = [...SUPPORTED_EXTENSIONS, 'mobi', 'azw', 'azw3', 'cbr', 'doc'];

let mainWindow = null;
let pendingOpenFile = null;
let isRendererReady = false;
const pendingBookReadPaths = new Map();
const PENDING_PATH_TTL_MS = 5 * 60 * 1000;

function normalizePath(p) {
  if (typeof p !== 'string' || !p) return '';
  return path.resolve(p).toLowerCase();
}

function authorizeBookPath(p) {
  const canonical = normalizePath(p);
  if (!canonical) return;
  const now = Date.now();
  for (const [k, time] of pendingBookReadPaths) {
    if (now - time > PENDING_PATH_TTL_MS) pendingBookReadPaths.delete(k);
  }
  pendingBookReadPaths.set(canonical, now);
}

function consumeAuthorizedBookPath(p) {
  const canonical = normalizePath(p);
  if (!canonical || !pendingBookReadPaths.has(canonical)) return false;
  pendingBookReadPaths.delete(canonical);
  return true;
}

function revokeAuthorizedBookPath(p) {
  const canonical = normalizePath(p);
  if (canonical) pendingBookReadPaths.delete(canonical);
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv, workingDirectory) => {
    // Focus existing window or recreate if window was closed
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      const filePath = extractBookArg(argv);
      if (filePath) {
        dispatchOpenFile(filePath);
      }
    } else {
      createWindow();
      const filePath = extractBookArg(argv);
      if (filePath) {
        dispatchOpenFile(filePath);
      }
    }
  });
}

function extractBookArg(args) {
  if (!Array.isArray(args)) return null;
  for (const rawArg of args) {
    if (typeof rawArg !== 'string') continue;
    let arg = rawArg.trim();
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      arg = arg.slice(1, -1).trim();
    }
    if (!arg || arg.startsWith('--') || arg.startsWith('-')) continue;
    const ext = path.extname(arg).slice(1).toLowerCase();
    if (!OPENABLE_EXTENSIONS.includes(ext)) continue;
    try {
      if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
        return path.resolve(arg);
      }
    } catch (_) {}
  }
  return null;
}

// Extract initial book argument at cold launch as early as possible
const coldLaunchArg = extractBookArg(process.argv);
if (coldLaunchArg) {
  pendingOpenFile = path.resolve(coldLaunchArg);
  authorizeBookPath(pendingOpenFile);
}

function dispatchOpenFile(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  authorizeBookPath(resolved);
  if (!mainWindow || !isRendererReady) {
    pendingOpenFile = resolved;
    return;
  }
  mainWindow.webContents.send('open-file-from-os', resolved);
}

function isManagedBookPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const storageDir = path.resolve(getBooksStorageDir());
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(storageDir, resolvedPath);
  return Boolean(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

// Ensure AppData storage directory exists
function getBooksStorageDir() {
  const booksDir = path.join(app.getPath('userData'), 'books');
  if (!fs.existsSync(booksDir)) {
    fs.mkdirSync(booksDir, { recursive: true });
  }
  return booksDir;
}

function getStoragePath(storageId) {
  if (!isStorageId(storageId)) {
    throw new Error('Invalid managed book identity');
  }
  return path.join(getBooksStorageDir(), storageId);
}

const EXPECTED_SHELL_PATH = path.resolve(__dirname, 'index.html');

function isTrustedSender(event) {
  const frame = event?.senderFrame;
  if (!frame || !frame.url || !frame.url.startsWith('file://')) return false;
  try {
    let senderPath = decodeURIComponent(new URL(frame.url).pathname);
    senderPath = senderPath.replace(/^\/([A-Za-z]:)/, '$1');
    return path.resolve(senderPath).toLowerCase() === EXPECTED_SHELL_PATH.toLowerCase();
  } catch {
    return false;
  }
}

function requireTrustedSender(event) {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
}

function writeManagedBook(storageId, buffer) {
  const destination = getStoragePath(storageId);
  if (fs.existsSync(destination)) {
    const existing = fs.readFileSync(destination);
    if (fingerprintBuffer(existing) === fingerprintBuffer(buffer)) return destination;
    throw new Error('Managed storage identity already belongs to different content');
  }
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, buffer, { flag: 'wx' });
  try {
    fs.renameSync(temporary, destination);
  } catch (error) {
    if (fs.existsSync(destination)) fs.unlinkSync(temporary);
    else throw error;
  }
  return destination;
}

// Window state storage
function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const file = getWindowStatePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load window state:', e.message);
  }
  return { width: 1280, height: 850, isMaximized: false };
}

function saveWindowState(win) {
  try {
    if (!win) return;
    const isMaximized = win.isMaximized();
    const bounds = win.getNormalBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized
    };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save window state:', e.message);
  }
}

function createWindow() {
  const state = loadWindowState();

  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width || 1280,
    height: state.height || 850,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#EEECF8',
    icon: iconPath,
    show: false,
    title: 'Lirune Reader — A calm home for your books',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  // Load the application
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Safety fallback: ensure window becomes visible even if ready-to-show is delayed by GPU/system
  const showFallbackTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 3000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallbackTimer);
    mainWindow.show();

    // If a book was passed at launch, store it in pendingOpenFile so renderer receives it once ready
    const initialFile = pendingOpenFile || extractBookArg(process.argv);
    if (initialFile) {
      pendingOpenFile = path.resolve(initialFile);
      pendingBookReadPaths.add(normalizePath(pendingOpenFile));
      pendingBookReadPaths.add(pendingOpenFile);
      if (isRendererReady) {
        dispatchOpenFile(pendingOpenFile);
        pendingOpenFile = null;
      }
    }
  });

  // Save window dimensions on close
  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('native-fullscreen-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('native-fullscreen-changed', false);
  });

  // External web links open in user's default browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      event.preventDefault();
      shell.openExternal(url);
      return;
    }
    if (url !== EXPECTED_SHELL_URL) event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// -------------------------------------------------------------
// IPC Handlers
// -------------------------------------------------------------

// Native Windows File Dialog
ipcMain.handle('dialog:open-files', async (event) => {
  requireTrustedSender(event);
  if (!mainWindow) return { canceled: true, files: [] };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a book',
    buttonLabel: 'Import to Lirune Reader',
    filters: [
      { name: 'Supported books', extensions: SUPPORTED_EXTENSIONS },
      { name: 'EPUB eBooks (*.epub)', extensions: ['epub'] },
      { name: 'PDF documents (*.pdf)', extensions: ['pdf'] },
      { name: 'Word documents (*.docx)', extensions: ['docx'] },
      { name: 'Comic archives (*.cbz)', extensions: ['cbz'] },
      { name: 'Text and HTML (*.txt, *.html, *.htm)', extensions: ['txt', 'html', 'htm'] },
      { name: 'FictionBook (*.fb2)', extensions: ['fb2'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true, files: [] };
  }

  const descriptors = [];
  const errors = [];
  for (const filePath of result.filePaths) {
    try {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        pendingBookReadPaths.add(normalizePath(resolved));
        pendingBookReadPaths.add(resolved);
        descriptors.push({
          name: path.basename(resolved),
          path: resolved,
          size: fs.statSync(resolved).size
        });
      }
    } catch (e) {
      console.error('Error reading file info:', filePath, e);
      errors.push({ name: path.basename(filePath), error: e.message });
    }
  }

  return { canceled: false, files: descriptors, errors };
});

// Native Windows Folder Dialog (batch import with controlled streaming memory)
ipcMain.handle('dialog:open-folder', async (event) => {
  requireTrustedSender(event);
  if (!mainWindow) return { canceled: true, files: [] };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder Containing Books',
    buttonLabel: 'Import Folder',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true, files: [] };
  }

  const dirPath = result.filePaths[0];
  const descriptors = [];
  const errors = [];
  const queue = [dirPath];

  try {
    while (queue.length > 0) {
      const currentDir = queue.shift();
      let entries;
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch (e) {
        errors.push({ name: currentDir, error: e.message });
        continue;
      }
      for (const entry of entries) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.')) continue;
          queue.push(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            try {
              const resolved = path.resolve(full);
              authorizeBookPath(resolved);
              const stats = await fs.promises.stat(resolved);
              descriptors.push({
                name: entry.name,
                path: resolved,
                size: stats.size
              });
            } catch (e) {
              errors.push({ name: full, error: e.message });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Folder scan error:', e);
  }

  return { canceled: false, files: descriptors, errors };
});

/**
 * Validate an imported file.
 * EPUB gets the full OCF/DRM check; every other supported format is checked
 * against its file signature so a renamed file is rejected up front.
 */
async function validateBookBuffer(buffer, extension = '') {
  if (!buffer || buffer.length === 0) {
    throw new Error('The file is empty');
  }
  const isZip = buffer.length >= 4 && buffer.readUInt32BE(0) === 0x504b0304;
  const ext = String(extension || '').toLowerCase();

  // The declared extension is checked first: EPUB and CBZ are both ZIP
  // containers, so the signature alone cannot tell them apart.
  if (ext === 'cbz') {
    if (!isZip) throw new Error('Not a readable ZIP archive');
    const zip = await JSZip.loadAsync(buffer);
    if (Object.keys(zip.files).filter(name => !zip.files[name].dir).length === 0) {
      throw new Error('The comic archive is empty');
    }
    return true;
  }
  if (ext === 'docx') {
    if (!isZip) throw new Error('Not a readable Word (.docx) document');
    const zip = await JSZip.loadAsync(buffer);
    if (!zip.file('word/document.xml')) {
      throw new Error('Not a valid Word (.docx) document');
    }
    return true;
  }
  if (ext === 'epub' || (isZip && !ext)) {
    return validateEpubBuffer(buffer);
  }
  if (ext === 'pdf' || (!ext && buffer.slice(0, 5).toString('latin1') === '%PDF-')) {
    if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('Not a readable PDF document');
    return true;
  }
  if (isZip) {
    const zip = await JSZip.loadAsync(buffer);
    if (Object.keys(zip.files).length === 0) throw new Error('The archive is empty');
    return true;
  }
  if (['txt', 'html', 'htm', 'fb2'].includes(ext)) {
    return true;
  }
  throw new Error(`Unsupported file type${ext ? ` (.${ext})` : ''}`);
}

async function validateEpubBuffer(buffer) {
  if (!buffer || buffer.length < 4 || buffer.readUInt32BE(0) !== 0x504b0304) {
    throw new Error('Not a readable ZIP archive');
  }
  const zip = await JSZip.loadAsync(buffer);
  if (zip.file('META-INF/rights.xml')) throw new Error('DRM-protected EPUBs are not supported');
  if (zip.file('META-INF/encryption.xml')) throw new Error('Encrypted EPUB resources are not supported');
  const container = zip.file('META-INF/container.xml');
  if (!container) throw new Error('Missing META-INF/container.xml');
  const containerXml = await container.async('text');
  const rootfile = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i);
  if (!rootfile || !zip.file(rootfile[1])) throw new Error('Missing EPUB package document (OPF)');
  return true;
}

// Reveal in Windows File Explorer
ipcMain.handle('shell:show-in-folder', (event, targetPath) => {
  requireTrustedSender(event);
  let managedPath = targetPath;
  try {
    managedPath = getStoragePath(targetPath);
  } catch {
    if (!isManagedBookPath(targetPath)) return false;
  }
  if (fs.existsSync(managedPath)) {
    shell.showItemInFolder(managedPath);
    return true;
  }
  return false;
});

// Save copy of book in AppData storage
ipcMain.handle('fs:save-book', async (event, { fileName, storageId, buffer }) => {
  requireTrustedSender(event);
  try {
    const extension = typeof fileName === 'string' ? path.extname(fileName).slice(1).toLowerCase() : '';
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      throw new Error(`Unsupported file type${extension ? ` (.${extension})` : ''}`);
    }
    const bookBuffer = Buffer.from(buffer);
    await validateBookBuffer(bookBuffer, extension);
    const fingerprint = fingerprintBuffer(bookBuffer);
    const safeStorageId = storageId || storageIdForFingerprint(fingerprint, extension);
    if (safeStorageId !== storageIdForFingerprint(fingerprint, extension)) throw new Error('Storage identity does not match file content');
    const destPath = writeManagedBook(safeStorageId, bookBuffer);
    return { success: true, storageId: safeStorageId, fingerprint, fileSize: bookBuffer.length, originalName: path.basename(fileName) };
  } catch (e) {
    console.error('Failed to persist book to disk:', e);
    return { success: false, error: e.message };
  }
});

// Delete book from disk
ipcMain.handle('fs:delete-book', (event, storageId) => {
  requireTrustedSender(event);
  try {
    const managedPath = getStoragePath(storageId);
    if (fs.existsSync(managedPath)) {
      fs.unlinkSync(managedPath);
      return true;
    }
  } catch (e) {
    console.error('Error deleting book file:', e);
  }
  return false;
});

ipcMain.handle('fs:get-storage-path', (event) => {
  requireTrustedSender(event);
  return getBooksStorageDir();
});
ipcMain.handle('app:get-version', (event) => {
  requireTrustedSender(event);
  return app.getVersion();
});

ipcMain.handle('app:has-pending-file', (event) => {
  requireTrustedSender(event);
  return Boolean(pendingOpenFile);
});

ipcMain.handle('app:signal-renderer-ready', (event) => {
  requireTrustedSender(event);
  isRendererReady = true;
  if (pendingOpenFile && mainWindow) {
    const file = pendingOpenFile;
    pendingOpenFile = null;
    authorizeBookPath(file);
    mainWindow.webContents.send('open-file-from-os', file);
  }
  return true;
});

ipcMain.handle('app:get-pending-file', (event) => {
  requireTrustedSender(event);
  const file = pendingOpenFile;
  pendingOpenFile = null;
  if (file) {
    authorizeBookPath(file);
    return file;
  }
  return null;
});

ipcMain.handle('fs:revoke-pending-book', (event, filePath) => {
  requireTrustedSender(event);
  if (filePath) revokeAuthorizedBookPath(filePath);
  return true;
});

ipcMain.handle('fs:read-book', (event, filePath) => {
  requireTrustedSender(event);
  const extension = typeof filePath === 'string' ? path.extname(filePath).slice(1).toLowerCase() : '';
  if (!OPENABLE_EXTENSIONS.includes(extension)) {
    throw new Error('This file type cannot be opened');
  }

  const resolvedPath = path.resolve(filePath);
  if (!consumeAuthorizedBookPath(resolvedPath)) {
    throw new Error('This file was not opened by the operating system');
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error('The file does not exist');
  }

  const buffer = fs.readFileSync(resolvedPath);
  return {
    name: path.basename(resolvedPath),
    path: resolvedPath,
    data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    size: buffer.length
  };
});

ipcMain.handle('fs:read-managed-book', (event, { storageId, fingerprint, fileSize } = {}) => {
  requireTrustedSender(event);
  const managedPath = getStoragePath(storageId);
  if (!fs.existsSync(managedPath)) throw new Error('Managed book file is unavailable');
  const buffer = fs.readFileSync(managedPath);
  if (fileSize !== undefined && buffer.length !== Number(fileSize)) throw new Error('Managed book file is corrupted');
  if (fingerprint && fingerprintBuffer(buffer) !== fingerprint.toLowerCase()) throw new Error('Managed book file is corrupted');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
});

ipcMain.handle('fs:list-managed-books', (event) => {
  requireTrustedSender(event);
  return fs.readdirSync(getBooksStorageDir(), { withFileTypes: true })
    .filter(entry => entry.isFile() && isStorageId(entry.name))
    .map(entry => entry.name);
});

/**
 * Inspects one managed file without sending its contents to the renderer.
 *
 * The integrity check needs the real on-disk size and content hash to tell a
 * healthy book apart from a truncated or altered one, and hashing has to happen
 * in the main process because the books can be hundreds of megabytes. Reading
 * one file per call is deliberate: it lets the renderer report honest progress
 * as a large library is checked.
 */
ipcMain.handle('fs:inspect-managed-book', (event, { storageId } = {}) => {
  requireTrustedSender(event);
  const managedPath = getStoragePath(storageId);
  if (!fs.existsSync(managedPath)) return { exists: false, size: 0, fingerprint: null };
  const stats = fs.statSync(managedPath);
  if (!stats.isFile()) return { exists: false, size: 0, fingerprint: null };
  return {
    exists: true,
    size: stats.size,
    fingerprint: fingerprintBuffer(fs.readFileSync(managedPath))
  };
});

/**
 * Removes managed files that no library record refers to.
 *
 * Only the storage identities passed in are touched, and every one of them is
 * re-checked against the caller's own list of referenced identities so a bug in
 * the renderer can never delete a file a book still needs.
 */
ipcMain.handle('fs:delete-orphan-files', (event, { storageIds, referencedIds } = {}) => {
  requireTrustedSender(event);
  const referenced = new Set(Array.isArray(referencedIds) ? referencedIds : []);
  const removed = [];
  const skipped = [];

  for (const storageId of Array.isArray(storageIds) ? storageIds : []) {
    if (!isStorageId(storageId)) {
      skipped.push({ storageId, reason: 'invalid-identity' });
      continue;
    }
    if (referenced.has(storageId)) {
      skipped.push({ storageId, reason: 'referenced' });
      continue;
    }
    try {
      const target = getStoragePath(storageId);
      if (!fs.existsSync(target)) {
        skipped.push({ storageId, reason: 'absent' });
        continue;
      }
      fs.unlinkSync(target);
      removed.push(storageId);
    } catch (error) {
      skipped.push({ storageId, reason: 'failed' });
    }
  }

  return { removed, skipped };
});

ipcMain.handle('window:toggle-fullscreen', (event) => {
  requireTrustedSender(event);
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('window:is-fullscreen', (event) => {
  requireTrustedSender(event);
  return Boolean(mainWindow?.isFullScreen());
});

// Window controls
ipcMain.on('window:minimize', (event) => {
  requireTrustedSender(event);
  mainWindow?.minimize();
});
ipcMain.on('window:maximize', (event) => {
  requireTrustedSender(event);
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:close', (event) => {
  requireTrustedSender(event);
  mainWindow?.close();
});

function ensureWindowsRegistryAssociation() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const exe = process.execPath;
  const regCommands = [
    ['add', 'HKCU\\Software\\Classes\\Applications\\Lirune Reader.exe', '/v', 'FriendlyAppName', '/d', 'Lirune Reader', '/f'],
    ['add', 'HKCU\\Software\\Classes\\Applications\\Lirune Reader.exe\\shell\\open\\command', '/ve', '/d', `"${exe}" "%1"`, '/f'],
    ['add', 'HKCU\\Software\\Classes\\Applications\\Lirune Reader.exe\\SupportedTypes', '/v', '.epub', '/d', '', '/f'],
    ['add', 'HKCU\\Software\\Classes\\Lirune.epub', '/ve', '/d', 'EPUB Electronic Publication', '/f'],
    ['add', 'HKCU\\Software\\Classes\\Lirune.epub\\DefaultIcon', '/ve', '/d', `"${exe}",0`, '/f'],
    ['add', 'HKCU\\Software\\Classes\\Lirune.epub\\shell\\open\\command', '/ve', '/d', `"${exe}" "%1"`, '/f'],
    ['add', 'HKCU\\Software\\Classes\\.epub', '/ve', '/d', 'Lirune.epub', '/f'],
    ['add', 'HKCU\\Software\\Classes\\.epub\\OpenWithProgids', '/v', 'Lirune.epub', '/d', '', '/f'],
    ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.epub\\OpenWithProgids', '/v', 'Lirune.epub', '/d', '', '/f'],
    ['add', 'HKCU\\Software\\Lirune Reader\\Capabilities', '/v', 'ApplicationName', '/d', 'Lirune Reader', '/f'],
    ['add', 'HKCU\\Software\\Lirune Reader\\Capabilities\\FileAssociations', '/v', '.epub', '/d', 'Lirune.epub', '/f'],
    ['add', 'HKCU\\Software\\RegisteredApplications', '/v', 'Lirune Reader', '/d', 'Software\\Lirune Reader\\Capabilities', '/f']
  ];
  for (const cmdArgs of regCommands) {
    try {
      spawn('reg', cmdArgs, { stdio: 'ignore', windowsHide: true });
    } catch (_) {}
  }
}

// Application Lifecycle
app.whenReady().then(() => {
  createWindow();
  ensureWindowsRegistryAssociation();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
