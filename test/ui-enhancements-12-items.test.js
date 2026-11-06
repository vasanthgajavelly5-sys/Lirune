const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Item 1: Button Theme Consistency (.quick-expand-btn matches purple/indigo theme)', () => {
  const panelsCss = fs.readFileSync(path.join(root, 'css/panels.css'), 'utf8');
  assert.ok(panelsCss.includes('#6D54B5'), 'Light theme quick expand btn must use #6D54B5');
  assert.ok(panelsCss.includes('#8B72DB'), 'Dark theme quick expand btn must use #8B72DB');
});

test('Item 2: Dropdown Text Alignment (.custom-dropdown-item and label centered)', () => {
  const compCss = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
  assert.ok(compCss.includes('.custom-dropdown-item {') && compCss.includes('justify-content: center;'), 'custom-dropdown-item must justify-content: center');
  assert.ok(compCss.includes('.custom-dropdown-label {') && compCss.includes('text-align: center;'), 'custom-dropdown-label must text-align: center');
});

test('Item 3: Reset Library View button in Quick Library Settings', () => {
  const settingsUiJs = fs.readFileSync(path.join(root, 'js/settingsUI.js'), 'utf8');
  assert.ok(settingsUiUiHasResetBtn(settingsUiJs), 'Quick settings must contain #qs-reset-library-btn above expandButton');
  assert.ok(settingsUiJs.includes('#qs-reset-library-btn') && settingsUiJs.includes('Library.resetView()'), 'qs-reset-library-btn must call Library.resetView()');

  function settingsUiUiHasResetBtn(src) {
    const idxBtn = src.indexOf('id="qs-reset-library-btn"');
    const idxExp = src.indexOf('${expandButton()}');
    return idxBtn > -1 && idxExp > -1 && idxBtn < idxExp;
  }
});

test('Item 4: Progress calculation spine fallback in epubLoader.js', () => {
  const epubLoaderJs = fs.readFileSync(path.join(root, 'js/epubLoader.js'), 'utf8');
  assert.ok(epubLoaderJs.includes('totalSpine') && epubLoaderJs.includes('intraChapterFraction'), 'epubLoader must have spine and intraChapterFraction fallback');
});

test('Item 5: Reader actions capsule theme adaptation', () => {
  const readerCss = fs.readFileSync(path.join(root, 'css/reader.css'), 'utf8');
  assert.ok(readerCss.includes('--reader-theme-surface'), '.toolbar-actions must use --reader-theme-surface');
  assert.ok(readerCss.includes('--reader-theme-border'), '.toolbar-actions must use --reader-theme-border');
});

test('Item 6: Floating zoom pill theming and scroll fix', () => {
  const compCss = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
  assert.ok(compCss.includes('#reader-zoom-control') && compCss.includes('--reader-theme-surface'), '#reader-zoom-control must adapt to reader theme');

  const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.ok(!appJs.includes('Reader.showZoomControl?.()'), 'app.js must not show zoom control on every window scroll');
  assert.ok(appJs.includes('Reader.clampZoomControl?.()'), 'app.js must clamp zoom control on scroll instead of showing it');
});

test('Item 7: Paragraph spacing support across settings and readers', () => {
  const settingsJs = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');
  assert.ok(settingsJs.includes('paragraphSpacing'), 'ReaderSettings must support paragraphSpacing');

  const settingsUiJs = fs.readFileSync(path.join(root, 'js/settingsUI.js'), 'utf8');
  assert.ok(settingsUiJs.includes('qs-para-spacing'), 'Quick settings must contain qs-para-spacing slider');

  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('para-spacing-slider'), 'Full settings must contain para-spacing-slider');

  const epubLoaderJs = fs.readFileSync(path.join(root, 'js/epubLoader.js'), 'utf8');
  assert.ok(epubLoaderJs.includes('margin-bottom: ${paraSpacing}em !important'), 'epubLoader must inject paragraph spacing style');

  const docAdapterJs = fs.readFileSync(path.join(root, 'js/reader/documentAdapter.js'), 'utf8');
  assert.ok(docAdapterJs.includes('--doc-para-spacing'), 'documentAdapter must set --doc-para-spacing');
});

test('Item 8: Theme dropdown sync with swatches', () => {
  const themesJs = fs.readFileSync(path.join(root, 'js/themes.js'), 'utf8');
  assert.ok(themesJs.includes('qsThemeSelect._customDropdownSync?.()'), 'setReaderTheme must call _customDropdownSync on qsThemeSelect');

  const settingsUiJs = fs.readFileSync(path.join(root, 'js/settingsUI.js'), 'utf8');
  assert.ok(settingsUiJs.includes('novera:readerThemeChange'), 'settingsUI must listen to novera:readerThemeChange to sync dropdown');
});

test('Item 9: Dedicated storage open loading screen ("Open With...")', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="storage-open-overlay"'), 'index.html must contain #storage-open-overlay');
  assert.ok(indexHtml.includes('storage-open-progress-bar'), 'index.html must contain storage-open-progress-bar');

  const libraryJs = fs.readFileSync(path.join(root, 'js/library.js'), 'utf8');
  assert.ok(libraryJs.includes('showStorageOpenOverlay'), 'library.js must show storage open overlay during file opening');
});

test('Item 10: Background import queue pill and modal', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="import-queue-pill"'), 'index.html must contain #import-queue-pill');
  assert.ok(indexHtml.includes('id="import-queue-modal"'), 'index.html must contain #import-queue-modal');

  const libraryJs = fs.readFileSync(path.join(root, 'js/library.js'), 'utf8');
  assert.ok(libraryJs.includes('BackgroundQueue'), 'library.js must implement BackgroundQueue manager');
});

test('Item 11: Scroll lag fix (translateZ(0) and no backdrop-filter on badges)', () => {
  const libraryCss = fs.readFileSync(path.join(root, 'css/library.css'), 'utf8');
  assert.ok(libraryCss.includes('.card-cover-wrap {') && libraryCss.includes('transform: translateZ(0);'), 'card-cover-wrap must have transform: translateZ(0)');
  assert.ok(!libraryCss.includes('.card-format-badge {\n  position: absolute;\n  left: var(--sp-2);\n  bottom: var(--sp-2);\n  z-index: 2;\n  padding: 2px 7px;\n  border-radius: var(--r-full);\n  background: var(--bg-glass);\n  backdrop-filter'), 'card-format-badge must not use backdrop-filter');
});

test('Item 12: Wider TOC panel matching settings width', () => {
  const tokensCss = fs.readFileSync(path.join(root, 'css/tokens.css'), 'utf8');
  const sidebarMatch = tokensCss.match(/--sidebar-w:\s*(\d+)px/);
  const panelMatch = tokensCss.match(/--panel-w:\s*(\d+)px/);
  assert.ok(sidebarMatch && panelMatch, 'Both --sidebar-w and --panel-w must be defined');
  assert.equal(sidebarMatch[1], panelMatch[1], '--sidebar-w and --panel-w must be equal');
  assert.equal(sidebarMatch[1], '355', 'Width must be 355px');
});

test('Item 13: Bottom status drawer completely removed from reader view', () => {
  const readerCss = fs.readFileSync(path.join(root, 'css/reader.css'), 'utf8');
  assert.match(readerCss, /#reader-statusbar\s*\{[^}]*display:\s*none\s*!important/i, '#reader-statusbar must have display: none !important');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(indexHtml, /<footer id="reader-statusbar"[^>]*hidden[^>]*display:\s*none\s*!important/i, 'reader-statusbar footer in HTML must be hidden and display: none');
});

test('Item 14: resetView() comprehensively resets filters, search, view prefs and triggers toast', () => {
  const libJs = fs.readFileSync(path.join(root, 'js/library.js'), 'utf8');
  assert.match(libJs, /currentFilter\s*=\s*'all'/, 'resetView must reset currentFilter to all');
  assert.match(libJs, /currentCollection\s*=\s*'all'/, 'resetView must reset currentCollection to all');
  assert.match(libJs, /searchQuery\s*=\s*''/, 'resetView must clear searchQuery');
  assert.match(libJs, /Utils\.toast\('Library view reset to defaults', 'success'\)/, 'resetView must provide success toast confirmation');
});

test('Item 15: Read Aloud TTS module, tray button, controller, and settings section', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(indexHtml, /id="read-aloud-btn"/, 'Toolbar actions must contain #read-aloud-btn');
  assert.match(indexHtml, /id="read-aloud-bar"/, 'Reader view must contain #read-aloud-bar floating controller');
  assert.match(indexHtml, /data-section="tts"/, 'Full settings must contain Read Aloud tts pane');
  assert.match(indexHtml, /src="js\/readAloud\.js"/, 'index.html must load js/readAloud.js');
  const readAloudJs = fs.readFileSync(path.join(root, 'js/readAloud.js'), 'utf8');
  assert.match(readAloudJs, /window\.speechSynthesis/, 'ReadAloud must use window.speechSynthesis');
});

test('Item 16: Centered chapter name, expanded max-width, and removed percentage', () => {
  const readerCss = fs.readFileSync(path.join(root, 'css/reader.css'), 'utf8');
  assert.match(readerCss, /\.toolbar-center\s*\{[^}]*position:\s*absolute/i, '.toolbar-center must be absolutely centered');
  assert.match(readerCss, /#progress-chapter\s*\{[^}]*max-width:\s*min\(520px/i, '#progress-chapter must have expanded max-width');
  const epubLoader = fs.readFileSync(path.join(root, 'js/epubLoader.js'), 'utf8');
  assert.ok(!epubLoader.includes('pageInfoEl.textContent = pageLabel ?'), 'epubLoader must not append percentage to pageInfoEl');
});

test('Item 17: Smooth side pane transitions with cubic-bezier easing and opacity', () => {
  const componentsCss = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
  assert.match(componentsCss, /\.panel\s*\{[^}]*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/i, '.panel must use cubic-bezier easing');
  assert.match(componentsCss, /\.panel\.open\s*\{[^}]*opacity:\s*1/i, '.panel.open must animate opacity');
});



