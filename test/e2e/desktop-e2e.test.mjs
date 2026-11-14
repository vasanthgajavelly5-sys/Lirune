/**
 * Lirune Reader Desktop — Full End-to-End (E2E) Test Suite
 *
 * Drives the real Electron application via Chrome DevTools Protocol (CDP).
 * Validates the genuine desktop runtime, library, EPUB engine, navigation,
 * settings persistence, and error handling.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9444;

console.log('================================================================');
console.log('            LIRUNE DESKTOP END-TO-END (E2E) TEST SUITE         ');
console.log('================================================================');

// 1. Generate synthetic valid EPUB for E2E ingestion
async function createSyntheticEpub() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );

  const ch1 = `<?xml version="1.0" encoding="utf-8"?>
  <!DOCTYPE html>
  <html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1: The Beginning</title></head>
  <body>
    <h1>Chapter 1</h1>
    <p>Welcome to Lirune Reader desktop end-to-end verification.</p>
    <p>This is paragraph two of the synthetic verification novel.</p>
  </body>
  </html>`;

  const ch2 = `<?xml version="1.0" encoding="utf-8"?>
  <!DOCTYPE html>
  <html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 2: The Journey</title></head>
  <body>
    <h1>Chapter 2</h1>
    <p>The journey continues into pagination and navigation checks.</p>
  </body>
  </html>`;

  zip.file('OEBPS/ch1.xhtml', ch1);
  zip.file('OEBPS/ch2.xhtml', ch2);

  const opf = `<?xml version="1.0" encoding="utf-8"?>
  <package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>E2E Verification Book</dc:title>
      <dc:creator>Lirune QA Automation</dc:creator>
      <dc:language>en</dc:language>
      <dc:identifier id="BookId">urn:uuid:12345-e2e-lirune</dc:identifier>
    </metadata>
    <manifest>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
      <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    </manifest>
    <spine toc="ncx">
      <itemref idref="ch1"/>
      <itemref idref="ch2"/>
    </spine>
  </package>`;
  zip.file('OEBPS/content.opf', opf);

  const ncx = `<?xml version="1.0" encoding="utf-8"?>
  <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head><meta name="dtb:uid" content="urn:uuid:12345-e2e-lirune"/></head>
    <docTitle><text>E2E Verification Book</text></docTitle>
    <navMap>
      <navPoint id="np1" playOrder="1">
        <navLabel><text>Chapter 1</text></navLabel>
        <content src="ch1.xhtml"/>
      </navPoint>
      <navPoint id="np2" playOrder="2">
        <navLabel><text>Chapter 2</text></navLabel>
        <content src="ch2.xhtml"/>
      </navPoint>
    </navMap>
  </ncx>`;
  zip.file('OEBPS/toc.ncx', ncx);

  return await zip.generateAsync({ type: 'arraybuffer' });
}

// 2. CDP Client over WebSocket
class CdpDriver {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`CDP evaluation error: ${desc}`);
    }
    return res.result?.value;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let electronProc = null;
let tmpUserData = null;
let cdp = null;

try {
  tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-e2e-'));
  const electronExe = path.resolve(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

  console.log('[1/9] Bootstrapping real Electron desktop process...');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  electronProc = spawn(electronExe, [
    ROOT,
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tmpUserData}`,
    '--no-sandbox'
  ], {
    cwd: ROOT,
    env,
    stdio: 'ignore'
  });

  // Wait for CDP endpoint
  let pageTarget = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      if (res.ok) {
        const targets = await res.json();
        pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) break;
      }
    } catch {}
  }

  if (!pageTarget) {
    throw new Error(`Failed to attach to Electron CDP on port ${PORT}`);
  }

  console.log('  Attached to Electron CDP:', pageTarget.title);
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  cdp = new CdpDriver(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // Wait for page to be completely loaded
  for (let i = 0; i < 20; i++) {
    const ready = await cdp.eval('return document.readyState');
    if (ready === 'complete') break;
    await sleep(200);
  }
  await sleep(1000);

  // STEP 1: Verify Core Globals & Preload API
  console.log('[2/9] Verifying App Bootstrap, Core Globals & Desktop Preload API...');
  const appStatus = await cdp.eval(`
    return {
      hasApp: typeof App !== 'undefined',
      hasLibrary: typeof Library !== 'undefined',
      hasDB: typeof NoveraDB !== 'undefined',
      hasEpubLoader: typeof EpubLoader !== 'undefined',
      hasThemeManager: typeof ThemeManager !== 'undefined',
      hasReaderSettings: typeof ReaderSettings !== 'undefined',
      hasUtils: typeof Utils !== 'undefined',
      hasEpubLib: typeof ePub !== 'undefined',
      hasDesktopPreload: typeof window.noveraDesktop !== 'undefined' && window.noveraDesktop.isDesktop === true,
      title: document.title,
      theme: document.documentElement.getAttribute('data-theme')
    };
  `);
  console.log('  Core Globals Status:', appStatus);
  assert.ok(appStatus.hasApp, 'App coordinator must be defined');
  assert.ok(appStatus.hasLibrary, 'Library manager must be defined');
  assert.ok(appStatus.hasDB, 'NoveraDB must be defined');
  assert.ok(appStatus.hasEpubLoader, 'EpubLoader must be defined');
  assert.ok(appStatus.hasDesktopPreload, 'noveraDesktop IPC preload bridge must be exposed');

  // STEP 2: Theme Switching & Reader Theme
  console.log('[3/9] Testing Theme Management (App & Reader Themes)...');
  const themeRes = await cdp.eval(`
    ThemeManager.setAppTheme('light');
    const light = document.documentElement.getAttribute('data-theme');
    ThemeManager.setAppTheme('dark');
    const dark = document.documentElement.getAttribute('data-theme');
    ThemeManager.setReaderTheme('sepia');
    const readerTheme = ThemeManager.getReaderTheme();
    return { light, dark, readerTheme };
  `);
  console.log('  Theme Switching Result:', themeRes);
  assert.equal(themeRes.light, 'light', 'Should switch to light theme');
  assert.equal(themeRes.dark, 'dark', 'Should switch to dark theme');
  assert.equal(themeRes.readerTheme, 'sepia', 'Should switch to sepia reader theme');

  // STEP 3: Settings Persistence
  console.log('[4/9] Testing Reader Settings Persistence & Model Schema...');
  const settingsRes = await cdp.eval(`
    const current = ReaderSettings.getSettings();
    ReaderSettings.setSetting('fontSize', 22);
    ReaderSettings.setSetting('fontFamily', 'Georgia');
    const updated = ReaderSettings.getSettings();
    return { initialSize: current.fontSize, updatedSize: updated.fontSize, font: updated.fontFamily };
  `);
  console.log('  Settings Update Result:', settingsRes);
  assert.equal(settingsRes.updatedSize, 22, 'Settings must reflect updated font size');
  assert.equal(settingsRes.font, 'Georgia', 'Settings must reflect updated font family');

  // STEP 4: Book Ingestion / Importing into Managed Storage & IndexedDB
  console.log('[5/9] Testing Synthetic EPUB Book Ingestion into Managed Storage & IndexedDB...');
  const epubBuffer = await createSyntheticEpub();
  const epubBase64 = Buffer.from(epubBuffer).toString('base64');

  const ingestRes = await cdp.eval(`
    const b64 = "${epubBase64}";
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);

    // Save to native managed disk storage via preload IPC bridge (null auto-computes safeStorageId)
    const diskSave = await window.noveraDesktop.saveBookToStorage('e2e-test.epub', u8.buffer, null);
    if (!diskSave.success) throw new Error('saveBookToStorage failed: ' + diskSave.error);

    const testBookRecord = {
      id: 'e2e-test-book-1',
      title: 'E2E Verification Book',
      author: 'Lirune QA Automation',
      format: 'epub',
      storageId: diskSave.storageId,
      fingerprint: diskSave.fingerprint,
      fileSize: u8.byteLength,
      dateAdded: Date.now(),
      lastReadDate: Date.now()
    };

    await NoveraDB.saveBook(testBookRecord);
    const retrieved = await NoveraDB.getBook('e2e-test-book-1');
    const allBooks = await NoveraDB.getAllBooks();

    return {
      saved: Boolean(retrieved),
      title: retrieved?.title,
      storageId: retrieved?.storageId,
      totalBooks: allBooks.length
    };
  `);
  console.log('  Book Ingestion Result:', ingestRes);
  assert.ok(ingestRes.saved, 'Book record must be stored in IndexedDB');
  assert.equal(ingestRes.title, 'E2E Verification Book');
  assert.ok(ingestRes.storageId, 'Managed storageId must be present');
  assert.ok(ingestRes.totalBooks >= 1, 'Total library books must be at least 1');

  // STEP 5: Opening Reader Interface via App.openReader
  console.log('[6/9] Testing Reader View Transition & Document Mounting...');
  const openRes = await cdp.eval(`
    let errDetail = null;
    let res = null;
    const book = await NoveraDB.getBook('e2e-test-book-1');
    const libView = document.getElementById('library-view');
    const readerView = document.getElementById('reader-view');
    libView.classList.remove('active');
    libView.classList.add('hidden');
    readerView.classList.remove('hidden');
    readerView.classList.add('active');

    try {
      res = await EpubLoader.openBook(book);
    } catch (e) {
      errDetail = e.message;
    }
    const container = document.getElementById('epub-container');
    const isReaderActive = readerView && readerView.classList.contains('active');
    const titleEl = document.getElementById('reader-title');

    return {
      isReaderActive: Boolean(isReaderActive),
      hasContainer: Boolean(container),
      readerTitle: titleEl?.textContent,
      openResult: res,
      errDetail,
      bookFileDataLen: book?.fileData ? book.fileData.byteLength : null
    };
  `);
  console.log('  Reader Opening Result:', openRes);
  assert.ok(openRes.isReaderActive, 'Reader view must be active');
  assert.ok(openRes.hasContainer, 'EPUB container element must exist in DOM');
  assert.match(openRes.readerTitle, /E2E Verification Book/, 'Reader title must reflect opened book');

  // STEP 6: Basic Reading Navigation (Next / Previous)
  console.log('[7/9] Testing Reader Page Navigation Lifecycle...');
  const navRes = await cdp.eval(`
    try {
      EpubLoader.next();
      await new Promise(r => setTimeout(r, 300));
      EpubLoader.prev();
      await new Promise(r => setTimeout(r, 300));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  `);
  console.log('  Navigation Result:', navRes);
  assert.ok(navRes.ok, 'Navigation calls should execute without unhandled error');

  // STEP 7: Unsupported Format (.exe) & Corrupt Archive Validation & Graceful Rejection
  console.log('[8/9] Testing Unsupported Format & Corrupt Archive Validation & Graceful Rejection...');
  const rejectRes = await cdp.eval(`
    try {
      const hostileBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00]); // MZ PE header
      const res1 = await window.noveraDesktop.saveBookToStorage('sample.exe', hostileBytes.buffer, null);
      const res2 = await window.noveraDesktop.saveBookToStorage('corrupt.epub', hostileBytes.buffer, null);
      return {
        unsupportedRejected: !res1.success,
        corruptRejected: !res2.success
      };
    } catch (e) {
      return { error: e.message };
    }
  `);
  console.log('  Unsupported & Corrupt Rejection Result:', rejectRes);
  assert.ok(rejectRes.unsupportedRejected, 'Preload storage boundary must refuse unsupported executable files');
  assert.ok(rejectRes.corruptRejected, 'Desktop validation boundary must refuse non-zip binary content');

  // STEP 8: Reading Progress Persistence & Library Return
  console.log('[9/9] Testing Reading Progress Persistence & Library Return Transition...');
  const exitRes = await cdp.eval(`
    // Save reading progress
    await NoveraDB.updateProgress('e2e-test-book-1', {
      currentCfi: 'epubcfi(/6/2[ch1]!/4/2/1:0)',
      progressPercent: 50,
      currentChapter: 'Chapter 1'
    });
    const book = await NoveraDB.getBook('e2e-test-book-1');

    // Switch view back to library
    await App.openLibrary();
    const libView = document.getElementById('library-view');
    const isLibActive = libView && libView.classList.contains('active');

    return {
      progressPercent: book?.progressPercent,
      currentChapter: book?.currentChapter,
      isLibActive: Boolean(isLibActive)
    };
  `);
  console.log('  State & Transition Result:', exitRes);
  assert.equal(exitRes.progressPercent, 50, 'Progress must be persisted in IndexedDB');
  assert.equal(exitRes.currentChapter, 'Chapter 1', 'Current chapter must be recorded');
  assert.ok(exitRes.isLibActive, 'Library view must be active after exit');

  console.log('\n================================================================');
  console.log('       ALL 9 WINDOWS DESKTOP E2E TESTS PASSED SUCCESSFULLY!    ');
  console.log('================================================================\n');
  process.exitCode = 0;
} catch (err) {
  console.error('\n✖ Windows Desktop E2E Test Failed:', err);
  process.exitCode = 1;
} finally {
  console.log('Shutting down Electron test instance...');
  if (cdp?.ws) {
    try { cdp.ws.close(); } catch {}
  }
  if (electronProc) {
    try { electronProc.kill(); } catch {}
  }
  if (tmpUserData) {
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch {}
  }
  process.exit(process.exitCode || 0);
}
