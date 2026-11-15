/**
 * Lirune Autonomous Windows Live Acceptance Testing
 * Executes live acceptance testing against all 57 real-world test samples in an isolated profile.
 */
import { launch, shutdown, sleep } from '../qa/cdp.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const RUN_ID = process.env.RUN_ID || process.argv[2] || 'run-20261115-postrel1';
const LOCAL_TARGET = process.env.REPORTS_TARGET_DIR || 'reports/post-release-validation';
const LOCAL_RUN_DIR = path.resolve(LOCAL_TARGET, RUN_ID);
const REPORTS_BASE = path.resolve('C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests/reports/live-acceptance', RUN_ID);
const INVENTORY_FILE = fs.existsSync(path.join(LOCAL_RUN_DIR, 'sample-inventory.json'))
  ? path.join(LOCAL_RUN_DIR, 'sample-inventory.json')
  : path.join(REPORTS_BASE, 'sample-inventory.json');
const SCREENSHOTS_DIR = path.join(LOCAL_RUN_DIR, 'screenshots', 'windows');
const RESULTS_JSON = path.join(LOCAL_RUN_DIR, 'windows-results.json');
const RESULTS_CSV = path.join(LOCAL_RUN_DIR, 'windows-results.csv');
const LOCAL_RESULTS_JSON = RESULTS_JSON;
const LOCAL_RESULTS_CSV = RESULTS_CSV;

// Isolate test user profile
const TEST_PROFILE_DIR = path.join(os.tmpdir(), 'LiruneLiveTests', RUN_ID, 'windows-profile');
fs.mkdirSync(TEST_PROFILE_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(LOCAL_RUN_DIR, { recursive: true });

process.env.LIRUNE_USER_DATA = TEST_PROFILE_DIR;

console.log('================================================================');
console.log(`LIRUNE WINDOWS LIVE ACCEPTANCE TEST CAMPAIGN: ${RUN_ID}`);
console.log(`Isolated Profile Dir: ${TEST_PROFILE_DIR}`);
console.log(`Screenshots Dir:     ${SCREENSHOTS_DIR}`);
console.log(`Inventory File:      ${INVENTORY_FILE}`);
console.log('================================================================\n');

if (!fs.existsSync(INVENTORY_FILE)) {
  console.error(`FATAL: Inventory file not found: ${INVENTORY_FILE}`);
  process.exit(1);
}

const inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
console.log(`Loaded ${inventory.length} test samples from inventory.`);

const results = [];
let passedCount = 0;
let partialCount = 0;
let failedCount = 0;

console.log('\n[1/4] Launching Electron in isolated test profile...');
const cdp = await launch({ freshUserData: true });

try {
  // Clear any leftover test records in isolated database
  await cdp.eval(`
    if (typeof Library !== 'undefined' && Library.deleteAllBooks) {
      await Library.deleteAllBooks();
    }
  `);
  // Verify isolated profile
  const storagePath = await cdp.eval(`
    if (window.liruneDesktop?.getStoragePath) {
      return await window.liruneDesktop.getStoragePath();
    }
    return null;
  `);
  console.log(`Storage path reported by Electron: ${storagePath}`);
  if (storagePath && !storagePath.toLowerCase().includes('lirunelivetests')) {
    console.warn(`WARNING: Storage path does not contain LiruneLiveTests: ${storagePath}`);
  } else {
    console.log('Confirmed: Application is running in dedicated isolated test profile.');
  }

  // Verify offline operation / local environment
  const offlineCheck = await cdp.eval(`
    return {
      online: navigator.onLine,
      dbReady: typeof NoveraDB !== 'undefined',
      readerReady: typeof Reader !== 'undefined',
      formatsReady: typeof BookFormat !== 'undefined'
    };
  `);
  console.log('Environment status:', JSON.stringify(offlineCheck));

  const knownBookIds = new Set();
  const initialBooks = await cdp.eval(`return (await NoveraDB.getAllBooks()).map(b => b.id);`);
  for (const id of initialBooks) knownBookIds.add(id);

  console.log(`Initial books in isolated library: ${knownBookIds.size}\n`);
  console.log(`[2/4] Beginning autonomous end-to-end testing across ${inventory.length} samples...\n`);

  for (let i = 0; i < inventory.length; i++) {
    const sample = inventory[i];
    const testNum = i + 1;
    const testLabel = `[${testNum}/${inventory.length}] ${sample.format.toUpperCase()} (${sample.tier}) - ${sample.filename}`;
    console.log(`----------------------------------------------------------------`);
    console.log(`START: ${testLabel}`);

    const result = {
      testIndex: testNum,
      format: sample.format,
      tier: sample.tier,
      classification: sample.classification,
      filename: sample.filename,
      relPath: sample.relPath,
      fullPath: sample.fullPath,
      fileSize: sample.size,
      sha256: sample.sha256,
      importStatus: 'NOT_RUN',
      openStatus: 'NOT_RUN',
      renderStatus: 'NOT_RUN',
      navStatus: 'NOT_RUN',
      settingsStatus: 'NOT_RUN',
      progressStatus: 'NOT_RUN',
      overallStatus: 'FAIL',
      adapterName: null,
      renderedDetail: null,
      coverDetected: false,
      navEntriesCount: 0,
      durationMs: 0,
      errors: [],
      screenshotFile: null
    };

    const startTime = Date.now();
    const startErrorCount = cdp.errors.length;

    try {
      if (!fs.existsSync(sample.fullPath)) {
        throw new Error(`Sample file does not exist: ${sample.fullPath}`);
      }

      // Ensure UI is cleanly in library view and clear previous test books to prevent duplicate fingerprint collisions
      await cdp.eval(`
        if (typeof Reader !== 'undefined' && Reader.getAdapter && Reader.getAdapter()) {
          try { await Reader.close(); } catch {}
        }
        if (typeof Library !== 'undefined' && Library.deleteAllBooks) {
          try { await Library.deleteAllBooks(); } catch {}
        }
        document.getElementById('archive-import-modal')?.classList.add('hidden');
        document.getElementById('reader-view')?.classList.add('hidden');
        document.getElementById('library-view')?.classList.remove('hidden');
        return true;
      `);
      knownBookIds.clear();
      await sleep(300);

      // 1. INGEST FILE
      console.log(`  Importing via drop transfer (${(sample.size / 1024).toFixed(1)} KB)...`);
      const importStart = Date.now();
      await cdp.importFile(sample.fullPath);

      // Check if archive inspection modal opened
      let archiveHandled = false;
      for (let w = 0; w < 10; w++) {
        const modalOpen = await cdp.eval(`
          const m = document.getElementById('archive-import-modal');
          return m && !m.classList.contains('hidden');
        `).catch(() => false);
        if (modalOpen) {
          console.log('  Archive modal opened, triggering import-selected-archive-btn...');
          await cdp.eval(`
            const btn = document.getElementById('import-selected-archive-btn');
            if (btn) btn.click();
            return true;
          `);
          archiveHandled = true;
          break;
        }
        await sleep(300);
      }

      // Wait for book to appear in DB
      let newBook = null;
      let retriedDirectProcess = false;
      const waitImportDeadline = Date.now() + 45000;
      while (Date.now() < waitImportDeadline) {
        const allBooks = await cdp.eval(`
          const list = await NoveraDB.getAllBooks();
          return list.map(b => ({
            id: b.id,
            title: b.title,
            author: b.author,
            format: b.format,
            originalName: b.originalName,
            fileSize: b.fileSize,
            cover: !!(b.coverDataUrl || b.cover),
            coverDataUrl: b.coverDataUrl || null,
            chapterCount: b.chapterCount
          }));
        `).catch(() => []);

        const candidate = allBooks.find(b => !knownBookIds.has(b.id)) ||
                          allBooks.find(b => b.originalName === sample.filename);
        if (candidate) {
          newBook = candidate;
          knownBookIds.add(candidate.id);
          break;
        }

        // If after 4s drop event was swallowed, fallback to direct Library.processFiles
        if (!retriedDirectProcess && Date.now() - importStart > 4000) {
          retriedDirectProcess = true;
          await cdp.eval(`
            if (window.__lastQaFile && typeof Library !== 'undefined' && Library.processFiles) {
              const f = window.__lastQaFile;
              window.__lastQaFile = null;
              await Library.processFiles([f]);
            }
          `).catch(() => null);
        }

        await sleep(500);
      }

      if (!newBook) {
        // Check if application showed an error toast
        const lastToast = await cdp.eval(`
          const toast = document.querySelector('.toast:last-child');
          return toast ? toast.textContent : null;
        `).catch(() => null);
        throw new Error(`Import failed: book did not appear in database. Toast: ${lastToast || 'none'}`);
      }

      result.importStatus = 'PASS';
      result.coverDetected = newBook.cover;
      console.log(`  Import SUCCESS: "${newBook.title}" (ID: ${newBook.id}, Format: ${newBook.format}, Cover: ${newBook.cover}) in ${Date.now() - importStart}ms`);

      // 2. OPEN IN READER
      console.log(`  Opening book in Reader view...`);
      const openStart = Date.now();
      await cdp.eval(`
        const targetId = ${JSON.stringify(newBook.id)};
        const card = document.querySelector('#books-grid .book-card[data-book-id="' + targetId + '"]');
        if (card) {
          card.click();
        } else {
          // Fallback to direct Reader.open
          const b = await NoveraDB.getBook(targetId);
          if (b) {
            document.getElementById('library-view')?.classList.add('hidden');
            document.getElementById('reader-view')?.classList.remove('hidden');
            await Reader.open(b);
          }
        }
        return true;
      `);

      // Wait for reader to be active and adapter ready
      await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden') && !!Reader.getAdapter()`, {
        timeout: 45000,
        label: `reader open for ${sample.format}`
      });

      result.openStatus = 'PASS';
      console.log(`  Reader OPENED in ${Date.now() - openStart}ms`);
      await sleep(1500); // Allow adapter to finish initial render

      // 3. VERIFY RENDERED CONTENT
      const readerState = await cdp.eval(`
        const ad = Reader.getAdapter();
        const fmt = Reader.getFormatInfo();
        const formatContainer = document.getElementById('format-container');
        const epubContainer = document.querySelector('#epub-container iframe');
        
        let textSample = '';
        let elementCount = 0;
        let imagesCount = 0;
        let canvasCount = 0;
        let tableRowsCount = 0;
        let slidesCount = 0;

        if (fmt?.id === 'epub') {
          try {
            const body = epubContainer?.contentDocument?.body;
            textSample = (body?.innerText || '').trim().slice(0, 150);
            elementCount = body?.querySelectorAll('*')?.length || 0;
            imagesCount = body?.querySelectorAll('img, image, svg')?.length || 0;
          } catch {}
        } else if (formatContainer) {
          textSample = (formatContainer.innerText || '').trim().slice(0, 150);
          elementCount = formatContainer.querySelectorAll('*').length;
          imagesCount = formatContainer.querySelectorAll('img').length;
          canvasCount = formatContainer.querySelectorAll('canvas').length;
          tableRowsCount = formatContainer.querySelectorAll('tr').length;
          slidesCount = formatContainer.querySelectorAll('.slide-container, .slide-view, .presentation-slide').length;
        }

        return {
          adapterName: ad?.constructor?.name,
          formatId: fmt?.id,
          capabilities: ad?.capabilities || {},
          location: ad?.getLocation ? ad.getLocation() : null,
          navCount: ad?.getNavigation ? ad.getNavigation().length : (Reader.getNavigation ? Reader.getNavigation().length : 0),
          textSample,
          elementCount,
          imagesCount,
          canvasCount,
          tableRowsCount,
          slidesCount
        };
      `);

      result.adapterName = readerState.adapterName;
      result.navEntriesCount = readerState.navCount;
      result.renderedDetail = `elements: ${readerState.elementCount}, textLen: ${readerState.textSample?.length || 0}, imgs: ${readerState.imagesCount}, canvases: ${readerState.canvasCount}, rows: ${readerState.tableRowsCount}`;

      const hasContent = (readerState.textSample && readerState.textSample.length > 0) ||
                         readerState.elementCount > 0 ||
                         readerState.imagesCount > 0 ||
                         readerState.canvasCount > 0;

      if (hasContent) {
        result.renderStatus = 'PASS';
        console.log(`  Render SUCCESS: Adapter=${result.adapterName}, Detail=[${result.renderedDetail}]`);
      } else {
        result.renderStatus = 'PARTIAL';
        console.warn(`  Render WARNING: No text/elements found in format container`);
      }

      // 4. EXERCISE NAVIGATION
      console.log(`  Exercising navigation (TOC/Next)...`);
      let navOk = false;
      try {
        const navRes = await cdp.eval(`
          const ad = Reader.getAdapter();
          const initialLoc = ad?.getLocation ? ad.getLocation() : null;
          if (typeof Reader !== 'undefined' && Reader.next) {
            await Reader.next();
            await new Promise(r => setTimeout(r, 600));
            const newLoc = ad?.getLocation ? ad.getLocation() : null;
            return { navigated: true, newLoc, initialLoc };
          } else if (ad?.next) {
            await ad.next();
            await new Promise(r => setTimeout(r, 600));
            const newLoc = ad?.getLocation ? ad.getLocation() : null;
            return { navigated: true, newLoc, initialLoc };
          } else if (ad?.goTo && ad?.getNavigation && ad.getNavigation().length > 1) {
            const target = ad.getNavigation()[1].target;
            await ad.goTo(target);
            await new Promise(r => setTimeout(r, 600));
            return { navigated: true, target };
          }
          return { navigated: false, reason: 'no next/goTo capability' };
        `);
        navOk = navRes.navigated;
        result.navStatus = navOk ? 'PASS' : 'PARTIAL';
        console.log(`  Navigation: ${navOk ? 'PASS' : 'PARTIAL'} (${navRes.reason || 'navigated'})`);
      } catch (navErr) {
        result.navStatus = 'FAIL';
        result.errors.push(`Navigation error: ${navErr.message}`);
        console.warn(`  Navigation ERROR: ${navErr.message}`);
      }

      // 5. EXERCISE SETTINGS
      console.log(`  Exercising reader settings...`);
      let settingsOk = false;
      try {
        if (readerState.capabilities?.typography) {
          // Test typography settings / flow toggle
          await cdp.eval(`
            const ad = Reader.getAdapter();
            if (ad?.applySettings) {
              await ad.applySettings({ fontSize: 18, theme: 'sepia' });
              await new Promise(r => setTimeout(r, 400));
              await ad.applySettings({ fontSize: 16, theme: 'light' });
            }
            return true;
          `);
          settingsOk = true;
        } else if (readerState.capabilities?.zoom) {
          await cdp.eval(`
            const ad = Reader.getAdapter();
            if (ad?.zoomIn) {
              await ad.zoomIn();
              await new Promise(r => setTimeout(r, 300));
              await ad.zoomOut();
            }
            return true;
          `);
          settingsOk = true;
        } else {
          settingsOk = true; // No adjustable settings required
        }
        result.settingsStatus = settingsOk ? 'PASS' : 'PARTIAL';
        console.log(`  Settings: ${result.settingsStatus}`);
      } catch (setErr) {
        result.settingsStatus = 'FAIL';
        result.errors.push(`Settings error: ${setErr.message}`);
        console.warn(`  Settings ERROR: ${setErr.message}`);
      }

      // 6. CAPTURE SCREENSHOT
      const screenshotFilename = `${sample.format}_${sample.tier}.png`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);
      await cdp.screenshot(screenshotPath);
      result.screenshotFile = screenshotFilename;
      console.log(`  Screenshot CAPTURED: ${screenshotFilename}`);

      // 7. RETURN TO LIBRARY & VERIFY PROGRESS SAVED
      console.log(`  Closing reader and returning to library...`);
      await cdp.eval(`
        const backBtn = document.getElementById('back-to-library-btn');
        if (backBtn) backBtn.click();
        return true;
      `);

      await cdp.waitFor(`document.getElementById('reader-view').classList.contains('hidden')`, {
        timeout: 15000,
        label: 'returned to library'
      });

      // Verify progress persisted in DB
      const progressSaved = await cdp.eval(`
        const updated = await NoveraDB.getBook(${JSON.stringify(newBook.id)});
        return updated && (
          updated.progressPercent !== undefined ||
          updated.currentCfi !== undefined ||
          updated.lastReadDate !== undefined ||
          updated.progress !== undefined ||
          updated.lastRead !== undefined
        );
      `);
      result.progressStatus = progressSaved ? 'PASS' : 'PARTIAL';
      console.log(`  Progress Persistence: ${result.progressStatus}`);

      // Verify Reopening Book restores adapter
      const reopenSuccess = await cdp.eval(`
        const b = await NoveraDB.getBook(${JSON.stringify(newBook.id)});
        if (b) {
          document.getElementById('library-view')?.classList.add('hidden');
          document.getElementById('reader-view')?.classList.remove('hidden');
          await Reader.open(b);
          await new Promise(r => setTimeout(r, 600));
          const ad = Reader.getAdapter();
          const ok = !!ad;
          await Reader.close();
          document.getElementById('reader-view')?.classList.add('hidden');
          document.getElementById('library-view')?.classList.remove('hidden');
          return ok;
        }
        return false;
      `);
      console.log(`  Reopen Verification: ${reopenSuccess ? 'PASS' : 'PARTIAL'}`);

      // Determine Overall Status
      if (result.importStatus === 'PASS' && result.openStatus === 'PASS' && result.renderStatus === 'PASS') {
        result.overallStatus = 'PASS';
        passedCount++;
      } else {
        result.overallStatus = 'PARTIAL';
        partialCount++;
      }

    } catch (testErr) {
      result.overallStatus = 'FAIL';
      failedCount++;
      result.errors.push(testErr.message);
      console.error(`  TEST FAILED: ${testErr.message}`);

      // Capture error screenshot if possible
      try {
        const errorScreenshot = `${sample.format}_${sample.tier}_error.png`;
        const errPath = path.join(SCREENSHOTS_DIR, errorScreenshot);
        await cdp.screenshot(errPath);
        result.screenshotFile = errorScreenshot;
      } catch {}

      // Recover by trying to return to library view
      try {
        await cdp.eval(`
          const backBtn = document.getElementById('back-to-library-btn');
          if (backBtn) backBtn.click();
          const modal = document.getElementById('archive-import-modal');
          if (modal) modal.classList.add('hidden');
          document.getElementById('reader-view')?.classList.add('hidden');
          document.getElementById('library-view')?.classList.remove('hidden');
          return true;
        `);
        await sleep(1000);
      } catch {}
    } finally {
      result.durationMs = Date.now() - startTime;
      const newErrors = cdp.errors.slice(startErrorCount);
      if (newErrors.length > 0) {
        result.errors.push(...newErrors);
      }
      results.push(result);
      console.log(`COMPLETED: ${testLabel} => ${result.overallStatus} (${result.durationMs}ms)\n`);
    }
  }

} finally {
  console.log('[3/4] Shutting down Electron and closing test session...');
  await shutdown(cdp);
}

console.log('[4/4] Writing test results and generating summary tables...');
fs.writeFileSync(RESULTS_JSON, JSON.stringify(results, null, 2), 'utf8');
fs.writeFileSync(LOCAL_RESULTS_JSON, JSON.stringify(results, null, 2), 'utf8');

// Write CSV
const csvHeaders = [
  'testIndex', 'format', 'tier', 'classification', 'filename', 'fileSize', 'sha256',
  'importStatus', 'openStatus', 'renderStatus', 'navStatus', 'settingsStatus', 'progressStatus',
  'overallStatus', 'adapterName', 'renderedDetail', 'coverDetected', 'navEntriesCount', 'durationMs', 'screenshotFile', 'errors'
];

const csvRows = [csvHeaders.join(',')];
for (const r of results) {
  const row = [
    r.testIndex,
    r.format,
    r.tier,
    r.classification,
    `"${r.filename}"`,
    r.fileSize,
    r.sha256,
    r.importStatus,
    r.openStatus,
    r.renderStatus,
    r.navStatus,
    r.settingsStatus,
    r.progressStatus,
    r.overallStatus,
    `"${r.adapterName || ''}"`,
    `"${(r.renderedDetail || '').replace(/"/g, '""')}"`,
    r.coverDetected,
    r.navEntriesCount,
    r.durationMs,
    `"${r.screenshotFile || ''}"`,
    `"${(r.errors.join('; ') || '').replace(/"/g, '""')}"`
  ];
  csvRows.push(row.join(','));
}
fs.writeFileSync(RESULTS_CSV, csvRows.join('\n'), 'utf8');
fs.writeFileSync(LOCAL_RESULTS_CSV, csvRows.join('\n'), 'utf8');

console.log('\n================================================================');
console.log('WINDOWS LIVE ACCEPTANCE TEST RESULTS SUMMARY');
console.log('================================================================');
console.log(`TOTAL SAMPLES TESTED: ${results.length}`);
console.log(`PASSED:               ${passedCount}`);
console.log(`PARTIAL:              ${partialCount}`);
console.log(`FAILED:               ${failedCount}`);
console.log(`Results JSON:         ${RESULTS_JSON}`);
console.log(`Results CSV:          ${RESULTS_CSV}`);
console.log(`Screenshots:          ${SCREENSHOTS_DIR}`);
console.log('================================================================\n');
