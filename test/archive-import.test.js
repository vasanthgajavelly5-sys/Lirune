const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

const mockApp = {
  setAppUserModelId: () => {},
  requestSingleInstanceLock: () => true,
  on: () => {},
  quit: () => {},
  getPath: (name) => path.join(os.tmpdir(), 'lirune-archive-test', name),
  whenReady: () => new Promise(() => {}),
  getVersion: () => '5.6.3'
};

require.cache[require.resolve('electron')] = {
  exports: {
    app: mockApp,
    BrowserWindow: class {
      constructor() {
        this.webContents = {
          on: () => {},
          setWindowOpenHandler: () => {},
          send: () => {}
        };
      }
      isDestroyed() { return false; }
      isVisible() { return true; }
      isMaximized() { return false; }
      isFullScreen() { return false; }
      on() {}
      once() {}
      loadFile() {}
      show() {}
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openExternal: () => {} },
    ipcMain: { handle: () => {}, on: () => {} },
    session: {
      defaultSession: {
        setPermissionRequestHandler: () => {},
        setPermissionCheckHandler: () => {}
      }
    }
  }
};

const mainModule = require('../main.js');

test('ARCHIVE_EXTENSIONS contains zip, 7z, and rar', () => {
  assert.ok(Array.isArray(mainModule.ARCHIVE_EXTENSIONS));
  assert.ok(mainModule.ARCHIVE_EXTENSIONS.includes('zip'));
  assert.ok(mainModule.ARCHIVE_EXTENSIONS.includes('7z'));
  assert.ok(mainModule.ARCHIVE_EXTENSIONS.includes('rar'));
});

test('inspectArchiveBuffer finds only supported books and ignores malicious/noise entries', async () => {
  const zip = new JSZip();
  zip.file('chapter1.epub', 'fake epub content');
  zip.file('notes.txt', 'some reading notes');
  zip.file('malicious.exe', 'MZ executable data');
  zip.file('__MACOSX/._chapter1.epub', 'apple double metadata');
  zip.file('.DS_Store', 'desktop services store');

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const books = await mainModule.inspectArchiveBuffer(buffer, 'test-books.zip');

  assert.equal(books.length, 2, 'Should only discover the 2 valid book files');
  const names = books.map(b => b.name);
  assert.ok(names.includes('chapter1.epub'));
  assert.ok(names.includes('notes.txt'));
  assert.ok(!names.includes('malicious.exe'), 'Must not list EXE files');
  assert.ok(!names.includes('._chapter1.epub'), 'Must not list __MACOSX metadata');
});

test('extractArchiveBuffer selectively extracts only chosen paths safely', async () => {
  const zip = new JSZip();
  zip.file('book-a.epub', 'content of book A');
  zip.file('book-b.epub', 'content of book B');
  zip.file('book-c.epub', 'content of book C');

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  // Extract only book-b.epub
  const extracted = await mainModule.extractArchiveBuffer(buffer, ['book-b.epub'], 'books.zip');
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].name, 'book-b.epub');
  assert.equal(extracted[0].data.toString('utf-8'), 'content of book B');

  // Extract all books when selectedPaths is null
  const allExtracted = await mainModule.extractArchiveBuffer(buffer, null, 'books.zip');
  assert.equal(allExtracted.length, 3);
});

test('extractArchiveBuffer refuses Zip Slip path traversal extraction', async () => {
  const zip = new JSZip();
  zip.file('valid.epub', 'valid payload');

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const extracted = await mainModule.extractArchiveBuffer(buffer, ['../traversal.epub', '..\\traversal.epub'], 'attack.zip');
  assert.equal(extracted.length, 0, 'Must refuse to extract path traversal entry');
});

test('Live in-place test against Downloads/Villain_Young_Master_Novels.zip (read-only)', async () => {
  const targetZip = path.join(process.env.USERPROFILE || '', 'Downloads', 'Villain_Young_Master_Novels.zip');
  if (!fs.existsSync(targetZip)) {
    return;
  }

  const initialStat = fs.statSync(targetZip);
  const buffer = fs.readFileSync(targetZip);

  // 1. Inspect
  const books = await mainModule.inspectArchiveBuffer(buffer, 'Villain_Young_Master_Novels.zip');
  assert.equal(books.length, 3, 'Should discover exactly 3 EPUB novels inside archive');
  const names = books.map(b => b.name);
  assert.ok(names.includes('The Villain Wants to Live.epub'));
  assert.ok(names.includes('This Young Master is Not Cannon Fodder.epub'));
  assert.ok(names.includes("History's Strongest Senior Brother.epub"));

  // 2. Selective extract single book
  const single = await mainModule.extractArchiveBuffer(buffer, ['The Villain Wants to Live.epub'], 'Villain_Young_Master_Novels.zip');
  assert.equal(single.length, 1);
  assert.equal(single[0].name, 'The Villain Wants to Live.epub');
  assert.ok(single[0].size > 2000000, 'EPUB file should be over 2MB');

  // 3. Verify target file in Downloads was untouched (strictly read-only)
  const finalStat = fs.statSync(targetZip);
  assert.equal(finalStat.size, initialStat.size, 'Target zip size must be identical');
  assert.equal(finalStat.mtimeMs, initialStat.mtimeMs, 'Target zip modification time must be unchanged');
});

test('index.html contains archive import modal and components', () => {
  const indexPath = path.resolve(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf-8');

  assert.ok(html.includes('id="archive-import-modal"'), 'Must have archive import modal');
  assert.ok(html.includes('id="archive-book-list"'), 'Must have archive book list container');
  assert.ok(html.includes('id="archive-select-all-cb"'), 'Must have select all checkbox');
  assert.ok(html.includes('id="import-selected-archive-btn"'), 'Must have import selected button');
  assert.ok(html.includes('id="import-all-archive-btn"'), 'Must have import all button');
  assert.ok(html.includes('id="import-archive-btn"'), 'Must have import archive option in Add modal');
});

test('preload.js exposes archive IPC bindings', () => {
  const preloadPath = path.resolve(__dirname, '..', 'preload.js');
  const js = fs.readFileSync(preloadPath, 'utf-8');

  assert.ok(js.includes('inspectArchive'), 'Must expose inspectArchive');
  assert.ok(js.includes('extractArchiveFiles'), 'Must expose extractArchiveFiles');
  assert.ok(js.includes('openArchiveDialog'), 'Must expose openArchiveDialog');
});
