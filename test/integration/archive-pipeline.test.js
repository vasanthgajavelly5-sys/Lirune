const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

// Mock Electron before loading main.js
const mockApp = {
  setAppUserModelId: () => {},
  requestSingleInstanceLock: () => true,
  on: () => {},
  quit: () => {},
  getPath: (name) => path.join(os.tmpdir(), 'lirune-archive-pipe-test', name),
  whenReady: () => new Promise(() => {})
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

const mainModule = require('../../main.js');

test('Archive Pipeline - Selective Import and Noise Filtering', async () => {
  const zip = new JSZip();

  // Legitimate books
  zip.file('books/fiction/Great Novel.epub', 'fake epub content');
  zip.file('books/nonfiction/Manual.pdf', '%PDF-1.4 test content');
  zip.file('notes/readme.txt', 'important reading notes');

  // Noise / malicious files that must be ignored
  zip.file('books/.DS_Store', 'macos junk');
  zip.file('books/Thumbs.db', 'windows junk');
  zip.file('books/desktop.ini', 'windows ini');
  zip.file('books/setup.exe', 'executable');
  zip.file('__MACOSX/._Great Novel.epub', 'apple double resource fork');

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  // 1. Inspect archive
  const books = await mainModule.inspectArchiveBuffer(zipBuffer, 'test-library.zip');
  assert.equal(books.length, 3, 'Must discover exactly the 3 supported books');

  const bookNames = books.map(b => b.name);
  assert.ok(bookNames.includes('Great Novel.epub'));
  assert.ok(bookNames.includes('Manual.pdf'));
  assert.ok(bookNames.includes('readme.txt'));

  // Ensure noise files were filtered out
  for (const b of books) {
    assert.ok(!b.name.includes('.DS_Store'));
    assert.ok(!b.name.includes('Thumbs.db'));
    assert.ok(!b.name.includes('desktop.ini'));
    assert.ok(!b.name.includes('setup.exe'));
    assert.ok(!b.name.startsWith('._'));
  }

  // 2. Extract only selected files
  const selectedPaths = ['books/fiction/Great Novel.epub', 'notes/readme.txt'];
  const extracted = await mainModule.extractArchiveBuffer(zipBuffer, selectedPaths, 'test-library.zip');

  assert.equal(extracted.length, 2, 'Only selected paths should be extracted');
  const extractedNames = extracted.map(f => f.name);
  assert.ok(extractedNames.includes('Great Novel.epub'));
  assert.ok(extractedNames.includes('readme.txt'));
});

test('Archive Pipeline - Path Traversal (Zip Slip) Defense', async () => {
  const zip = new JSZip();
  zip.file('valid.epub', 'valid payload');

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const extracted = await mainModule.extractArchiveBuffer(buffer, ['../../Windows/System32/evil.bat', '../traversal.epub'], 'attack.zip');
  assert.equal(extracted.length, 0, 'Must refuse to extract path traversal entries and return empty');
});

test('Archive Pipeline - Decompression Safety Limits', async () => {
  const mockZip = {
    files: {
      'huge.epub': {
        name: 'huge.epub',
        dir: false,
        _data: { uncompressedSize: 70 * 1024 * 1024 } // 70MB > 64MB limit
      }
    }
  };

  assert.throws(
    () => {
      mainModule.validateZipSafety(mockZip);
    },
    /exceeds the maximum allowed size/i,
    'Entries over 64MB must be rejected by safety validator'
  );
});
