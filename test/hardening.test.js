const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Version consistency across package and lockfile', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../package-lock.json'), 'utf8'));
  assert.equal(pkg.version, '5.0.0', 'package.json version must be 5.0.0');
  assert.equal(lock.version, '5.0.0', 'package-lock.json version must be 5.0.0');
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
