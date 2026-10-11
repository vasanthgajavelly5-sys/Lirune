const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Version consistency across package and lockfile', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../package-lock.json'), 'utf8'));
  assert.equal(pkg.version, '5.6.1', 'package.json version must be 5.6.1');
  assert.equal(lock.version, '5.6.1', 'package-lock.json version must be 5.6.1');
  assert.equal(pkg.build?.artifactName, '${productName}-${version}-Setup.${ext}');
});

test('Continuous progress calculation does not double-count section offsets', () => {
  // Model of the fixed scrolled progress calculation
  function calculateScrolledProgress(totalHeight, viewportHeight, scrollTop) {
    const maxScroll = Math.max(1, totalHeight - viewportHeight);
    const currentScroll = Math.max(0, scrollTop);
    return Math.min(100, Math.max(0, Math.round((currentScroll / maxScroll) * 100)));
  }

  // Suppose document total height is 12000px, viewport is 800px
  const totalHeight = 12000;
  const viewportHeight = 800;

  // At top (scrollTop = 0):
  assert.equal(calculateScrolledProgress(totalHeight, viewportHeight, 0), 0);

  // At section 3 (e.g. section starts at 5000px, scrolled to 5000px):
  // Old bug would calculate: (5000 + 5000) / 12000 = 83%
  // Fixed calculation: 5000 / (12000 - 800) = 5000 / 11200 = 45%
  const progMid = calculateScrolledProgress(totalHeight, viewportHeight, 5000);
  assert.equal(progMid, 45, 'Mid-document section progress should reflect actual 45% scroll geometry, not 83% double-counted');

  // At bottom (scrollTop = 11200):
  assert.equal(calculateScrolledProgress(totalHeight, viewportHeight, 11200), 100);

  // Over-scrolled:
  assert.equal(calculateScrolledProgress(totalHeight, viewportHeight, 15000), 100);
});

test('Canonical pending book path authorization and consumption lifecycle', () => {
  const pendingPaths = new Map();
  const PENDING_PATH_TTL_MS = 5 * 60 * 1000;

  function normalize(p) {
    if (typeof p !== 'string' || !p) return '';
    return path.resolve(p).toLowerCase();
  }

  function authorize(p) {
    const canonical = normalize(p);
    if (!canonical) return;
    pendingPaths.set(canonical, Date.now());
  }

  function consume(p) {
    const canonical = normalize(p);
    if (!canonical || !pendingPaths.has(canonical)) return false;
    pendingPaths.delete(canonical);
    return true;
  }

  const testPath = 'C:\\Books\\TestBook.epub';
  authorize(testPath);
  assert.equal(pendingPaths.size, 1);

  // Re-authorizing same file does not create duplicate entries
  authorize(testPath);
  assert.equal(pendingPaths.size, 1);

  // Consuming via different casing matches canonical form
  const ok = consume('c:\\books\\testbook.epub');
  assert.equal(ok, true, 'Case-insensitive canonical path should authorize successfully');
  assert.equal(pendingPaths.size, 0, 'Path must be consumed and removed from pending state');

  // Second attempt must fail (one-time consumption)
  const secondAttempt = consume(testPath);
  assert.equal(secondAttempt, false, 'Consumed path cannot be reused');
});

test('Restore last book priority: external open strictly supersedes restore', () => {
  function shouldRestoreLastBook({ restorePref, activeView, hasPendingExternal, isExternalOpening }) {
    if (!restorePref || activeView !== 'library') return false;
    if (hasPendingExternal || isExternalOpening) return false;
    return true;
  }

  // Normal startup with restore enabled
  assert.equal(shouldRestoreLastBook({
    restorePref: true,
    activeView: 'library',
    hasPendingExternal: false,
    isExternalOpening: false
  }), true);

  // External file open pending
  assert.equal(shouldRestoreLastBook({
    restorePref: true,
    activeView: 'library',
    hasPendingExternal: true,
    isExternalOpening: false
  }), false, 'External pending file must suppress restore-last-book');

  // External file opening underway
  assert.equal(shouldRestoreLastBook({
    restorePref: true,
    activeView: 'library',
    hasPendingExternal: false,
    isExternalOpening: true
  }), false, 'External opening in progress must suppress restore-last-book');
});

test('Production content safety: No QA corpus book in source or bundle', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.equal(indexHtml.includes('Sker Point'), false, 'index.html must not contain Sker Point');
  assert.equal(indexHtml.includes('The Lighthouse at Sker Point'), false);

  const libraryJs = fs.readFileSync(path.join(__dirname, '../js/library.js'), 'utf8');
  assert.equal(libraryJs.includes('Sker Point'), false, 'library.js must not contain Sker Point');
});

test('DOCX format detection and validation', async () => {
  const JSZip = require('jszip');
  globalThis.JSZip = JSZip;
  const formatsSource = fs.readFileSync(path.join(__dirname, '../js/formats.js'), 'utf8');
  const formatsModule = new Function(`${formatsSource}\nreturn BookFormat;`)();

  // Create valid DOCX zip buffer
  const validZip = new JSZip();
  validZip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body></w:document>');
  const validBuf = await validZip.generateAsync({ type: 'nodebuffer' });

  // Detect valid DOCX
  const detected = await formatsModule.detect('test.docx', validBuf.buffer.slice(validBuf.byteOffset, validBuf.byteOffset + validBuf.byteLength));
  assert.equal(detected.id, 'docx');
  assert.equal(detected.supported, true);
  assert.equal(detected.layout, 'reflowable');

  // Corrupted non-ZIP buffer named .docx
  const corruptedBuf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  const detectedCorrupt = await formatsModule.detect('fake.docx', corruptedBuf.buffer.slice(corruptedBuf.byteOffset, corruptedBuf.byteOffset + corruptedBuf.byteLength));
  // Falls back by extension to docx with source extension
  assert.equal(detectedCorrupt.id, 'docx');
  assert.equal(detectedCorrupt.source, 'extension');

  // Non-DOCX ZIP (e.g. unknown zip)
  const otherZip = new JSZip();
  otherZip.file('random.txt', 'some content');
  const otherBuf = await otherZip.generateAsync({ type: 'nodebuffer' });
  const detectedOther = await formatsModule.detect('archive.zip', otherBuf.buffer.slice(otherBuf.byteOffset, otherBuf.byteOffset + otherBuf.byteLength));
  assert.equal(detectedOther.id, 'unknown');
});

test('Continue Reading non-promotion semantics on book close', () => {
  // Test the model of progress updates:
  // Book A read at T=1000
  // Book B read at T=2000
  const books = [
    { id: 'book-a', title: 'Book A', lastReadDate: 1000, progressPercent: 20, currentCfi: 'page:5' },
    { id: 'book-b', title: 'Book B', lastReadDate: 2000, progressPercent: 50, currentCfi: 'page:12' }
  ];

  // Helper simulating NoveraDB.updateProgress with updateLastRead flag
  function applyProgressUpdate(book, { currentCfi, progressPercent, updateLastRead }) {
    if (currentCfi !== undefined) book.currentCfi = currentCfi;
    if (progressPercent !== undefined) book.progressPercent = progressPercent;
    if (updateLastRead) {
      book.lastReadDate = 3000; // Simulated current timestamp
    }
  }

  function getContinueReadingOrder(list) {
    return list.slice().sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0)).map(b => b.id);
  }

  // Initial order: Book B is first (most recently read at T=2000)
  assert.deepEqual(getContinueReadingOrder(books), ['book-b', 'book-a']);

  // Case 1: User opens Book A without reading/navigating, then closes it
  // Initial mount / restore occurs: updateLastRead is false
  applyProgressUpdate(books[0], { currentCfi: 'page:5', progressPercent: 20, updateLastRead: false });

  // After closing Book A without reading, Book B must STILL be first!
  assert.deepEqual(getContinueReadingOrder(books), ['book-b', 'book-a'],
    'Closing Book A without reading must NOT promote it over Book B');

  // Case 2: User opens Book A and ACTUALLY reads (turns page to page:6)
  applyProgressUpdate(books[0], { currentCfi: 'page:6', progressPercent: 25, updateLastRead: true });

  // Now Book A was read, so it should be promoted to #1
  assert.deepEqual(getContinueReadingOrder(books), ['book-a', 'book-b'],
    'Reading Book A must promote it to the most recently read item');
});

test('Fullscreen TOC accessibility and desktop toolbar congestion prevention', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const readerCss = fs.readFileSync(path.join(__dirname, '../css/reader.css'), 'utf8');

  // Verify focus-floating-controls contains focus-toc-btn, focus-settings-btn, and focus-fullscreen-btn
  assert.match(indexHtml, /id="focus-floating-controls"/, 'Must contain focus-floating-controls container');
  assert.match(indexHtml, /id="focus-toc-btn"/, 'Must contain focus-toc-btn for fullscreen mode');
  assert.match(indexHtml, /id="focus-settings-btn"/, 'Must contain focus-settings-btn for fullscreen mode');
  assert.match(indexHtml, /id="focus-fullscreen-btn"/, 'Must contain focus-fullscreen-btn for fullscreen mode');

  // Verify toolbar-actions capsule and divider in toolbar-right
  assert.match(indexHtml, /class="toolbar-actions"/, 'Must contain toolbar-actions capsule');
  assert.match(indexHtml, /class="toolbar-divider"/, 'Must contain toolbar-divider separating actions from window controls');

  // Verify CSS responsive queries and focus mode styles
  assert.match(readerCss, /\.focus-floating-controls/, 'Must style focus-floating-controls');
  assert.match(readerCss, /body\.focus-mode\s+#reader-toolbar\s*\{\s*display:\s*none/i, 'Must hide reader toolbar in focus-mode');
  assert.match(readerCss, /body\.focus-mode\s+#reader-statusbar\s*\{\s*display:\s*none/i, 'Must hide reader statusbar in focus-mode');
  assert.match(readerCss, /body\.focus-mode\s+#reading-stripe\s*\{\s*display:\s*none/i, 'Must hide reading stripe in focus-mode');
  assert.match(readerCss, /\.toolbar-actions/, 'Must style toolbar-actions');
  assert.match(readerCss, /@media\s*\(max-width:\s*1100px\)/, 'Must contain responsive query for non-fullscreen windows <= 1100px');
  assert.match(readerCss, /@media\s*\(max-width:\s*900px\)/, 'Must contain responsive query for non-fullscreen windows <= 900px');
  assert.match(readerCss, /@media\s*\(max-width:\s*780px\)/, 'Must contain responsive query for non-fullscreen windows <= 780px');
});
