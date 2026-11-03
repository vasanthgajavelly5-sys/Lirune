const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('TOC Bug 1: .toc-entry[hidden] has display: none !important and filter logic hides non-matching chapters', () => {
  const panelsCss = fs.readFileSync(path.resolve(__dirname, '../css/panels.css'), 'utf8');
  assert.ok(
    panelsCss.includes('.toc-entry[hidden]'),
    'panels.css must define .toc-entry[hidden]'
  );
  assert.ok(
    panelsCss.includes('display: none !important'),
    'panels.css must set display: none !important on hidden toc-entry'
  );

  const readerControllerJs = fs.readFileSync(path.resolve(__dirname, '../js/reader/readerController.js'), 'utf8');
  assert.ok(
    readerControllerJs.includes("entry.style.display = match ? '' : 'none'"),
    'readerController.js must toggle entry.style.display in addition to entry.hidden'
  );
  assert.ok(
    readerControllerJs.includes("filterInput.value = ''"),
    'readerController.js must reset filterInput.value when rendering navigation'
  );
  assert.ok(
    readerControllerJs.includes('toc-filter-empty'),
    'readerController.js must support empty search notice'
  );
});

test('TOC Bug 2: TOC panel width increased by 10-15% and configured responsively', () => {
  const tokensCss = fs.readFileSync(path.resolve(__dirname, '../css/tokens.css'), 'utf8');
  const panelsCss = fs.readFileSync(path.resolve(__dirname, '../css/panels.css'), 'utf8');

  // Original width was 310px. 355px is a 14.5% increase.
  const sidebarMatch = tokensCss.match(/--sidebar-w:\s*(\d+)px/);
  assert.ok(sidebarMatch, '--sidebar-w must be defined in tokens.css');
  const widthPx = parseInt(sidebarMatch[1], 10);
  assert.ok(
    widthPx >= 341 && widthPx <= 360,
    `--sidebar-w (${widthPx}px) must be between 10% (341px) and 15% (356px) wider than original 310px`
  );

  assert.ok(
    panelsCss.includes('#toc-panel'),
    '#toc-panel must be defined in panels.css'
  );
  assert.ok(
    panelsCss.includes('min(var(--sidebar-w), 90vw)') || panelsCss.includes('var(--sidebar-w)'),
    '#toc-panel must reference --sidebar-w'
  );
});

test('TOC Bug 3: epubLoader and documentAdapter navigate to chapter start (first of chapter body)', () => {
  const epubLoaderJs = fs.readFileSync(path.resolve(__dirname, '../js/epubLoader.js'), 'utf8');
  const docAdapterJs = fs.readFileSync(path.resolve(__dirname, '../js/reader/documentAdapter.js'), 'utf8');

  // epubLoader has resetToChapterStart
  assert.ok(
    epubLoaderJs.includes('resetToChapterStart'),
    'epubLoader.js must define resetToChapterStart'
  );
  assert.ok(
    epubLoaderJs.includes('view.scrollLeft = 0') || epubLoaderJs.includes('view.scrollLeft = targetPage'),
    'epubLoader.js must reset view.scrollLeft or calculate targetPage for paginated navigation'
  );

  // readingAxis correctly returns 'y' in scrolled mode and 'x' in paginated mode
  assert.ok(
    epubLoaderJs.includes("flow === 'scrolled'") || epubLoaderJs.includes('ReaderSettings'),
    'readingAxis must query ReaderSettings flow for accurate axis detection'
  );

  // documentAdapter clamps paginated and scrolled navigation to beginning of section
  assert.ok(
    docAdapterJs.includes('Math.floor(leftWithinDoc / step)') || docAdapterJs.includes('node.offsetTop'),
    'documentAdapter.js must position at beginning of section'
  );
});


test('TOC Bug 4: Close TOC button has valid cross icon and clickable non-drag styles', () => {
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const componentsCss = fs.readFileSync(path.resolve(__dirname, '../css/components.css'), 'utf8');
  const appJs = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');

  // Verify SVG has no typo and draws proper 'X'
  assert.ok(!indexHtml.includes('x18="6"'), 'index.html must not contain typo x18="6"');
  assert.ok(
    indexHtml.includes('id="close-toc-btn"'),
    'index.html must define close-toc-btn'
  );
  assert.ok(
    indexHtml.includes('<line x1="18" y1="6" x2="6" y2="18"/>'),
    'index.html close-toc-btn must contain first stroke of X'
  );
  assert.ok(
    indexHtml.includes('<line x1="6" y1="6" x2="18" y2="18"/>'),
    'index.html close-toc-btn must contain second stroke of X'
  );
  assert.ok(
    indexHtml.includes('title="Close"'),
    'index.html close-toc-btn must include title="Close"'
  );

  // CSS must ensure non-drag and clickable
  assert.ok(
    componentsCss.includes('-webkit-app-region: no-drag'),
    'components.css must specify -webkit-app-region: no-drag for panels/headers'
  );

  // JS event handling
  assert.ok(
    appJs.includes('closeTocBtn.addEventListener'),
    'app.js must bind click listener to closeTocBtn'
  );
  assert.ok(
    appJs.includes('closeDrawer(tocPanel)'),
    'app.js closeTocBtn must close tocPanel'
  );
});

test('TOC Bug 5: Scroll mode TOC navigation bypasses paginated resets to avoid blank screen crash', () => {
  const epubLoaderJs = fs.readFileSync(path.resolve(__dirname, '../js/epubLoader.js'), 'utf8');

  // Verify scroll mode check in goTo
  assert.ok(
    epubLoaderJs.includes("settings?.flow === 'scrolled'") || epubLoaderJs.includes("flow === 'scrolled'"),
    'goTo must check for scrolled flow'
  );
  assert.ok(
    epubLoaderJs.includes('await rendition.display(text)'),
    'goTo must call rendition.display directly in scrolled mode'
  );
});
