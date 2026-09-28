/**
 * Contextual settings checks against the real application.
 *
 * Everything here goes through the same path a person uses: click the Settings
 * button, read what the panel shows, change a control, and confirm the library
 * or the reader actually changed. Nothing asserts on internal state alone.
 */
import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function group(name) {
  console.log(`\n== ${name}`);
}

const cdp = await launch({ freshUserData: true });
try {
  group('Sidebar is unchanged');
  const before = await cdp.eval(`
    const panel = document.getElementById('toc-panel');
    const settings = document.getElementById('settings-panel');
    return {
      sidebarWidth: getComputedStyle(panel).width,
      settingsWidth: getComputedStyle(settings).width,
      settingsTransform: getComputedStyle(settings).transform,
      sidebarTransform: getComputedStyle(panel).transform,
      navItems: [...document.querySelectorAll('#toc-panel .panel-header, .app-nav a, .app-nav button')].length
    };
  `);
  check('sidebar keeps its width', before.sidebarWidth === '310px', before.sidebarWidth);
  check('settings panel keeps its width when closed', before.settingsWidth === '350px', before.settingsWidth);
  check('settings panel is still slid off-screen when closed',
    before.settingsTransform.includes('matrix') || before.settingsTransform !== 'none',
    before.settingsTransform);

  group('Context detection');
  // The library quick settings are checked both before and after books exist,
  // because an empty shelf exercises a different render path than a full one.
  const contexts = await cdp.eval(`
    const out = { home: App.getSettingsContext() };
    document.getElementById('library-settings-btn').click();
    await new Promise(r => setTimeout(r, 400));
    out.homePanelOpen = document.getElementById('settings-panel').classList.contains('open');
    out.homePanelContext = document.getElementById('quick-settings').dataset.context;
    out.homeTitle = document.getElementById('settings-panel-title').textContent;
    out.homeRows = [...document.querySelectorAll('#quick-settings .quick-row-label')].map(e => e.textContent.trim());
    out.hasExpand = !!document.getElementById('expand-settings-btn');
    return out;
  `);
  check('home reports the library context', contexts.home === 'library', contexts.home);
  check('settings from home opens the panel', contexts.homePanelOpen === true);
  check('quick settings render the library context', contexts.homePanelContext === 'library', contexts.homePanelContext);
  check('library quick settings show real library controls',
    JSON.stringify(contexts.homeRows) === JSON.stringify(['View', 'Sort by', 'Order', 'Density', 'Show book metadata']),
    contexts.homeRows.join(', '));
  check('library quick settings offer Expand Settings', contexts.hasExpand === true);

  group('Empty shelf still honours the chosen layout');
  const emptyShelf = await cdp.eval(`
    App.closeDrawer('settings-panel');
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('library-settings-btn').click();
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('[data-quick-segment="qs-view"] [data-value="list"]').click();
    await new Promise(r => setTimeout(r, 600));
    return { listClass: document.getElementById('books-grid').classList.contains('list-view') };
  `);
  check('list layout applies with no books on the shelf', emptyShelf.listClass === true);

  // A real shelf with more than one book is needed for the checks that
  // inspect cards and prove that sort order actually reorders them.
  await cdp.importFile(path.join(CORPUS, 'pg1342-ni.epub'));
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length >= 1`, { timeout: 90000 });
  await cdp.importFile(path.join(CORPUS, 'pg1342.txt'));
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length >= 2`, { timeout: 90000 });

  group('Home quick settings change the library');
  const homeSettings = await cdp.eval(`
    App.closeDrawer('settings-panel');
    await new Promise(r => setTimeout(r, 300));
    const grid = document.getElementById('books-grid');
    const result = {};

    document.getElementById('library-settings-btn').click();
    await new Promise(r => setTimeout(r, 400));

    // View: list
    document.querySelector('[data-quick-segment="qs-view"] [data-value="list"]').click();
    await new Promise(r => setTimeout(r, 500));
    result.list = {
      cls: grid.classList.contains('list-view'),
      toggle: document.getElementById('view-toggle-btn').classList.contains('active'),
      state: Library.getViewState().view
    };

    // View: back to grid
    document.querySelector('[data-quick-segment="qs-view"] [data-value="grid"]').click();
    await new Promise(r => setTimeout(r, 500));
    result.grid = { cls: !grid.classList.contains('list-view'), state: Library.getViewState().view };

    // Sort by title ascending
    const sortSelect = document.getElementById('qs-sort-select');
    sortSelect.value = 'title';
    sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    document.querySelector('[data-quick-segment="qs-order"] [data-value="asc"]').click();
    await new Promise(r => setTimeout(r, 500));
    const ascTitles = [...document.querySelectorAll('#books-grid .card-title')].map(e => e.textContent.trim());
    result.asc = { first: ascTitles[0], count: ascTitles.length, sorted: ascTitles.length > 1 && ascTitles.every((t, i) => i === 0 || ascTitles[i - 1].localeCompare(t) <= 0), state: Library.getViewState() };

    // Sort order descending
    document.querySelector('[data-quick-segment="qs-order"] [data-value="desc"]').click();
    await new Promise(r => setTimeout(r, 500));
    const descTitles = [...document.querySelectorAll('#books-grid .card-title')].map(e => e.textContent.trim());
    result.desc = { first: descTitles[0], reversed: descTitles.length > 1 && descTitles.every((t, i) => i === 0 || descTitles[i - 1].localeCompare(t) >= 0) };

    // Toolbar sort select stays in step
    result.toolbarInStep = document.getElementById('sort-select').value === 'title';

    // Density
    const beforeDensity = getComputedStyle(grid).gap;
    document.querySelector('[data-quick-segment="qs-density"] [data-value="compact"]').click();
    await new Promise(r => setTimeout(r, 400));
    result.density = {
      attr: grid.dataset.density,
      gapChanged: getComputedStyle(grid).gap !== beforeDensity,
      state: Library.getViewState().density
    };
    document.querySelector('[data-quick-segment="qs-density"] [data-value="comfortable"]').click();
    await new Promise(r => setTimeout(r, 400));
    result.densityBack = { attr: grid.dataset.density, gap: getComputedStyle(grid).gap === beforeDensity };

    // Metadata visibility
    const author = document.querySelector('#books-grid .card-author');
    const authorVisibleBefore = !!author && getComputedStyle(author).display !== 'none';
    document.getElementById('qs-metadata').click();
    await new Promise(r => setTimeout(r, 400));
    const authorAfter = document.querySelector('#books-grid .card-author');
    result.metadata = {
      before: authorVisibleBefore,
      after: !!authorAfter && getComputedStyle(authorAfter).display === 'none',
      state: Library.getViewState().showMetadata
    };
    document.getElementById('qs-metadata').click();
    await new Promise(r => setTimeout(r, 400));
    result.metadataBack = Library.getViewState().showMetadata === true;

    App.closeDrawer('settings-panel');
    return result;
  `, 120000);
  check('view: list really changes the grid', homeSettings.list.cls && homeSettings.list.toggle && homeSettings.list.state === 'list',
    JSON.stringify(homeSettings.list));
  check('view: grid really changes back', homeSettings.grid.cls && homeSettings.grid.state === 'grid', JSON.stringify(homeSettings.grid));
  check('sort by title ascending orders the shelf',
    homeSettings.asc.sorted && homeSettings.asc.state.sortBy === 'title' && homeSettings.asc.state.sortOrder === 'asc',
    `${homeSettings.asc.count} book(s), first="${homeSettings.asc.first}"`);
  check('sort order descending reverses the shelf', homeSettings.desc.reversed, `first="${homeSettings.desc.first}"`);
  check('library toolbar stays in step with the settings', homeSettings.toolbarInStep === true);
  check('density changes the grid spacing', homeSettings.density.attr === 'compact' && homeSettings.density.gapChanged,
    `gap changed: ${homeSettings.density.gapChanged}`);
  check('density returns to comfortable', homeSettings.densityBack.attr === 'comfortable' && homeSettings.densityBack.gap === true);
  check('hiding metadata removes author from cards', homeSettings.metadata.before && homeSettings.metadata.after,
    JSON.stringify(homeSettings.metadata));
  check('metadata returns', homeSettings.metadataBack === true);

  group('Reader context');
  // Sorting put the plain-text book first, so the EPUB is opened by its own
  // id rather than by clicking whatever happens to be on top.
  const epubCard = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    const epub = books.find(b => b.format === 'epub');
    if (!epub) throw new Error('no epub in the library');
    const card = document.querySelector('#books-grid .book-card[data-book-id="' + epub.id + '"]');
    if (!card) throw new Error('no card for the epub');
    card.click();
    await new Promise(r => setTimeout(r, 8000));
    return {
      id: epub.id,
      readerOpen: !document.getElementById('reader-view').classList.contains('hidden'),
      format: Reader.getAdapter()?.format
    };
  `, 180000);
  check('the reader actually opened', epubCard.readerOpen === true);
  check('the EPUB, not the text book, is open', epubCard.format === 'epub', epubCard.format);

  const readerSettings = await cdp.eval(`
    const out = { appContext: App.getSettingsContext() };
    document.getElementById('settings-btn').click();
    await new Promise(r => setTimeout(r, 500));
    out.panelContext = document.getElementById('quick-settings').dataset.context;
    out.rows = [...document.querySelectorAll('#quick-settings .quick-row-label')].map(e => e.textContent.trim());
    out.zoomShown = document.getElementById('qs-zoom-value')?.textContent;
    out.hasReset = !!document.getElementById('qs-reset-reader');
    return out;
  `, 120000);
  check('app reports the reader context', readerSettings.appContext === 'reader', readerSettings.appContext);
  check('settings from the reader shows reader quick settings', readerSettings.panelContext === 'reader', readerSettings.panelContext);
  check('reader quick settings show real reading controls',
    ['Theme', 'Font', 'Size', 'Line height', 'Margins', 'Alignment', 'Flow', 'Columns'].every(label => readerSettings.rows.includes(label)),
    readerSettings.rows.join(', '));
  check('reader quick settings show runtime zoom', /^\d+%$/.test(readerSettings.zoomShown || ''), readerSettings.zoomShown);
  check('reader quick settings offer a reset', readerSettings.hasReset === true);

  group('Reader quick settings change the reader');
  // A freshly opened EPUB lands on the cover, which is an image with no text at
  // all. Wait for a real section to mount, then turn forward until there is
  // prose on the page, because typography settings are only observable on text.
  await cdp.waitFor(`
    (() => {
      const doc = document.querySelector('#epub-container iframe')?.contentDocument;
      return !!doc?.querySelector('title') && doc.body.innerHTML.length > 100;
    })()
  `, { timeout: 120000, label: 'EPUB section rendered' });

  const turned = await cdp.eval(`
    const text = () => (document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText || '').trim();
    let pages = 0;
    while (pages < 8 && text().length < 40) {
      await Reader.next();
      await new Promise(r => setTimeout(r, 900));
      pages += 1;
    }
    return { pages, length: text().length, sample: text().slice(0, 60) };
  `, 120000);
  check('a text page can be reached in the EPUB', turned.length > 40, `${turned.pages} page turn(s), ${turned.length} chars: "${turned.sample}"`);

  const readerChanges = await cdp.eval(`
    const out = {};
    // Typography is applied to the section body, so sample the first real text
    // element and fall back to the body when the page has no prose. Body copy
    // comes first because headings intentionally keep the publisher's own
    // alignment and centring, so an h1-h3 would be a misleading sample.
    const probe = () => {
      const doc = document.querySelector('#epub-container iframe')?.contentDocument;
      if (!doc?.body) return null;
      const el = doc.querySelector('p, li, blockquote, h1, h2, h3, div[data-id]') || doc.body;
      const cs = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), fontSize: cs.fontSize, fontFamily: cs.fontFamily, lineHeight: cs.lineHeight, textAlign: cs.textAlign };
    };
    // Alignment is only themed onto body copy, never onto headings, so it needs
    // its own probe. The general probe reports whichever element comes first in
    // document order, which on a Gutenberg page is the title heading.
    const probeCopy = () => {
      const doc = document.querySelector('#epub-container iframe')?.contentDocument;
      const el = doc?.querySelector('p, li, blockquote');
      if (!el) return null;
      return { tag: el.tagName.toLowerCase(), textAlign: getComputedStyle(el).textAlign, text: (el.innerText || '').trim().slice(0, 40) };
    };
    const css = probe;

    // Every typography change re-renders the book, which can land back on the
    // cover. Wait for a mounted section and turn forward to prose each time,
    // otherwise a cover page would be sampled instead of real text.
    const waitForText = async () => {
      const mounted = () => {
        const doc = document.querySelector('#epub-container iframe')?.contentDocument;
        return !!doc?.querySelector('title') && doc.body.innerHTML.length > 100;
      };
      for (let i = 0; i < 120 && !mounted(); i++) await new Promise(r => setTimeout(r, 500));
      if (!mounted()) return false;
      const text = () => (document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText || '').trim();
      for (let i = 0; i < 8 && text().length < 40; i++) {
        Reader.nextPage?.();
        await new Promise(r => setTimeout(r, 900));
      }
      return text().length > 40;
    };

    await waitForText();
    out.before = probe();

    // Font size
    const sizeSlider = document.getElementById('qs-font-size-range');
    sizeSlider.value = '28';
    sizeSlider.dispatchEvent(new Event('input', { bubbles: true }));
    out.sizeReady = await waitForText();
    out.afterSize = { css: probe(), setting: ReaderSettings.getSettings().fontSize, readout: document.getElementById('qs-font-size-value').textContent };

    // Font family
    const fontSelect = document.getElementById('qs-font-select');
    fontSelect.value = 'Inter';
    fontSelect.dispatchEvent(new Event('change', { bubbles: true }));
    out.fontReady = await waitForText();
    out.afterFont = { css: probe(), setting: ReaderSettings.getSettings().fontFamily };

    // Line height
    const lh = document.getElementById('qs-line-height-range');
    lh.value = '2.2';
    lh.dispatchEvent(new Event('input', { bubbles: true }));
    out.lhReady = await waitForText();
    out.afterLineHeight = { css: probe(), setting: ReaderSettings.getSettings().lineHeight };

    // Alignment
    out.alignBefore = probeCopy();
    document.querySelector('[data-quick-segment="qs-alignment"] [data-value="justify"]').click();
    out.alignReady = await waitForText();
    out.afterAlign = { css: probeCopy(), setting: ReaderSettings.getSettings().alignment };

    // Margins
    const margin = document.getElementById('qs-margin-range');
    margin.value = '20';
    margin.dispatchEvent(new Event('input', { bubbles: true }));
    out.marginReady = await waitForText();
    out.afterMargin = { setting: ReaderSettings.getSettings().margin, readout: document.getElementById('qs-margin-value').textContent, css: probe() };

    // Reader theme
    const themeSelect = document.getElementById('qs-theme-select');
    themeSelect.value = 'sepia';
    themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    out.themeReady = await waitForText();
    out.afterTheme = { theme: ThemeManager.getReaderTheme(), readerBg: document.getElementById('reader-view').style.backgroundColor };

    // Flow
    document.querySelector('[data-quick-segment="qs-flow"] [data-value="scrolled"]').click();
    out.scrolledReady = await waitForText();
    out.afterFlow = {
      setting: ReaderSettings.getSettings().flow,
      scrolledClass: document.getElementById('epub-container').classList.contains('flow-scrolled'),
      css: probe()
    };

    document.querySelector('[data-quick-segment="qs-flow"] [data-value="paginated"]').click();
    out.paginatedReady = await waitForText();
    out.backToPaginated = {
      setting: ReaderSettings.getSettings().flow,
      scrolledClass: document.getElementById('epub-container').classList.contains('flow-scrolled'),
      css: probe()
    };

    // Zoom is not stored as a setting
    out.zoom = { runtime: Reader.getZoom(), inSettings: 'zoom' in ReaderSettings.getSettings() };

    return out;
  `, 240000);
  check('font size changes rendered text', readerChanges.afterSize.css.fontSize !== readerChanges.before.fontSize,
    `${readerChanges.before.fontSize} -> ${readerChanges.afterSize.css.fontSize}`);
  check('font family changes rendered text', /Inter/.test(readerChanges.afterFont.css.fontFamily),
    readerChanges.afterFont.css.fontFamily.slice(0, 40));
  check('line height changes rendered text', readerChanges.afterLineHeight.css.lineHeight !== readerChanges.before.lineHeight,
    `${readerChanges.before.lineHeight} -> ${readerChanges.afterLineHeight.css.lineHeight}`);
  check('alignment changes rendered text',
    readerChanges.afterAlign.css?.textAlign === 'justify',
    `${readerChanges.alignBefore?.textAlign} -> ${readerChanges.afterAlign.css?.textAlign} on ${readerChanges.afterAlign.css?.tag}: "${readerChanges.afterAlign.css?.text}"`);
  check('margins are stored and shown', readerChanges.afterMargin.setting === 20 && readerChanges.afterMargin.readout === '20%', readerChanges.afterMargin.readout);
  check('reader theme changes the reader', readerChanges.afterTheme.theme === 'sepia' && readerChanges.afterTheme.readerBg,
    `${readerChanges.afterTheme.theme}, bg=${readerChanges.afterTheme.readerBg}`);
  check('flow switches the reader to scrolled', readerChanges.afterFlow.setting === 'scrolled' && readerChanges.afterFlow.scrolledClass && readerChanges.scrolledReady,
    JSON.stringify(readerChanges.afterFlow));
  check('flow switches back to paginated', readerChanges.backToPaginated.setting === 'paginated' && !readerChanges.backToPaginated.scrolledClass && readerChanges.paginatedReady,
    JSON.stringify(readerChanges.backToPaginated));
  check('reader zoom stays runtime-only', readerChanges.zoom.inSettings === false, `runtime zoom ${readerChanges.zoom.runtime}%`);

  group('Reset reading preferences');
  const reset = await cdp.eval(`
    document.getElementById('qs-reset-reader').click();
    await new Promise(r => setTimeout(r, 2000));
    return {
      settings: ReaderSettings.getSettings(),
      quickRows: {
        size: document.getElementById('qs-font-size-value')?.textContent,
        margin: document.getElementById('qs-margin-value')?.textContent
      },
      fullSize: document.getElementById('font-size-display')?.textContent
    };
  `, 120000);
  const defaults = await cdp.eval(`return ReaderSettings.defaults();`);
  check('reset restores every reading setting',
    reset.settings.fontSize === defaults.fontSize
    && reset.settings.fontFamily === defaults.fontFamily
    && reset.settings.alignment === defaults.alignment
    && reset.settings.lineHeight === defaults.lineHeight
    && reset.settings.margin === defaults.margin
    && reset.settings.flow === defaults.flow
    && reset.settings.spread === defaults.spread,
    JSON.stringify(reset.settings));
  check('reset updates the controls immediately',
    reset.quickRows.size === `${defaults.fontSize}px` && reset.quickRows.margin === `${defaults.margin}%`,
    `${reset.quickRows.size} / ${reset.quickRows.margin}`);
  check('reset updates the full settings controls', reset.fullSize === `${defaults.fontSize}px`, reset.fullSize);

  group('Expand to full settings');
  const expanded = await cdp.eval(`
    const out = {};
    document.getElementById('settings-btn').click();
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('expand-settings-btn').click();
    await new Promise(r => setTimeout(r, 500));
    out.wide = getComputedStyle(document.getElementById('settings-panel')).width;
    out.navItems = [...document.querySelectorAll('#full-settings-nav .full-settings-nav-item')].map(e => e.textContent.trim());
    out.quickHidden = document.getElementById('quick-settings').classList.contains('hidden');
    out.fullVisible = !document.getElementById('full-settings').classList.contains('hidden');
    out.backVisible = !document.getElementById('settings-back-btn').classList.contains('hidden');
    out.activeSection = document.querySelector('#full-settings-nav .active')?.dataset.sectionTarget;
    out.visiblePanes = [...document.querySelectorAll('#full-settings-panes > .full-settings-pane')].filter(p => !p.hidden).map(p => p.dataset.section);
    return out;
  `, 120000);
  check('expanded settings widens the panel', expanded.wide !== '350px', expanded.wide);
  check('full settings lists every section',
    JSON.stringify(expanded.navItems) === JSON.stringify(['General', 'Appearance', 'Reading', 'Library', 'Accessibility', 'Shortcuts', 'Storage & Data', 'About']),
    expanded.navItems.join(' / '));
  check('quick settings are replaced by full settings', expanded.quickHidden && expanded.fullVisible);
  check('back control is available', expanded.backVisible === true);
  check('expanding from the reader opens Reading', expanded.activeSection === 'reading', expanded.activeSection);
  check('exactly one section pane is visible', expanded.visiblePanes.length === 1, expanded.visiblePanes.join(','));

  group('Back to quick settings');
  const back = await cdp.eval(`
    document.getElementById('settings-back-btn').click();
    await new Promise(r => setTimeout(r, 400));
    return {
      width: getComputedStyle(document.getElementById('settings-panel')).width,
      quickVisible: !document.getElementById('quick-settings').classList.contains('hidden'),
      fullHidden: document.getElementById('full-settings').classList.contains('hidden'),
      backHidden: document.getElementById('settings-back-btn').classList.contains('hidden')
    };
  `);
  check('back restores the sidebar width', back.width === '350px', back.width);
  check('back returns to contextual quick settings', back.quickVisible && back.fullHidden);
  check('back hides the back control', back.backHidden === true);

  group('Exit settings');
  const exit = await cdp.eval(`
    document.getElementById('expand-settings-btn').click();
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('close-settings-btn').click();
    await new Promise(r => setTimeout(r, 300));
    return {
      closed: !document.getElementById('settings-panel').classList.contains('open'),
      width: getComputedStyle(document.getElementById('settings-panel')).width,
      quickVisible: !document.getElementById('quick-settings').classList.contains('hidden'),
      fullHidden: document.getElementById('full-settings').classList.contains('hidden'),
      readerStillOpen: !document.getElementById('reader-view').classList.contains('hidden')
    };
  `);
  check('closing settings closes the panel', exit.closed === true);
  check('closing settings restores the normal sidebar', exit.width === '350px' && exit.quickVisible && exit.fullHidden,
    `${exit.width}`);
  check('closing settings does not leave the reader', exit.readerStillOpen === true);

  group('Full settings sections');
  const sections = await cdp.eval(`
    const out = {};
    const openSection = async id => {
      document.getElementById('expand-settings-btn').click();
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('#full-settings-nav [data-section-target="' + id + '"]').click();
      await new Promise(r => setTimeout(r, 400));
    };

    // Appearance: the application theme swatches really change the app theme.
    await openSection('appearance');
    out.appThemeBefore = ThemeManager.getAppTheme();
    document.querySelector('#app-theme-grid [data-app-theme="light"]').click();
    await new Promise(r => setTimeout(r, 600));
    out.appThemeAfter = ThemeManager.getAppTheme();
    out.appThemeBg = getComputedStyle(document.body).backgroundColor;
    out.pressed = document.querySelector('#app-theme-grid [data-app-theme="light"]').getAttribute('aria-pressed');
    document.querySelector('#app-theme-grid [data-app-theme="dark"]').click();
    await new Promise(r => setTimeout(r, 600));
    out.appThemeRestored = ThemeManager.getAppTheme();

    // Accessibility: reduced motion is persisted through the preference store.
    await openSection('accessibility');
    const motion = document.getElementById('fs-reduce-motion');
    out.motionBefore = motion.getAttribute('aria-checked');
    motion.click();
    await new Promise(r => setTimeout(r, 900));
    out.motionAfter = motion.getAttribute('aria-checked');
    out.motionAttr = document.documentElement.dataset.reduceMotion;
    out.motionStored = await NoveraDB.getPref('appPrefs');
    out.transitionOff = getComputedStyle(document.querySelector('.app-nav a, .nav-item, button') || document.body).transitionDuration;
    motion.click();
    await new Promise(r => setTimeout(r, 900));
    out.motionRestored = document.getElementById('fs-reduce-motion').getAttribute('aria-checked');
    out.motionAttrRestored = document.documentElement.dataset.reduceMotion;

    // Library: the full controls drive the same stored state as quick settings.
    await openSection('library');
    out.libraryControls = [...document.querySelectorAll('#library-view-controls .quick-row-label')].map(e => e.textContent.trim());
    document.querySelector('[data-quick-segment="fs-view"] [data-value="list"]').click();
    await new Promise(r => setTimeout(r, 600));
    out.fsView = Library.getViewState().view;
    out.fsGrid = document.getElementById('books-grid').classList.contains('list-view');
    document.querySelector('[data-quick-segment="fs-view"] [data-value="grid"]').click();
    await new Promise(r => setTimeout(r, 600));
    out.fsViewBack = Library.getViewState().view;

    // Reset library view really restores the defaults.
    document.querySelector('[data-quick-segment="fs-order"] [data-value="asc"]').click();
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('reset-library-view-btn').click();
    await new Promise(r => setTimeout(r, 800));
    out.afterReset = Library.getViewState();

    // Shortcuts are listed for the view actually being used.
    await openSection('shortcuts');
    out.shortcutRows = document.querySelectorAll('#shortcuts-list .shortcut-row').length;
    out.shortcutKeys = [...document.querySelectorAll('#shortcuts-list kbd')].slice(0, 4).map(e => e.textContent);

    // Storage statistics are real numbers from the library.
    await openSection('storage');
    out.stats = [...document.querySelectorAll('#storage-stats .storage-value')].map(e => e.textContent);
    out.statsLabels = [...document.querySelectorAll('#storage-stats .storage-label')].map(e => e.textContent);
    out.realBooks = (await NoveraDB.getAllBooks()).length;
    out.liveStats = await Library.getBookStats();
    // The location label is outside the stat grid, so it is read directly.
    out.location = document.getElementById('storage-path-text')?.textContent || null;

    // About reports the packaged version.
    await openSection('about');
    await new Promise(r => setTimeout(r, 600));
    out.aboutVersion = document.getElementById('about-version-full')?.textContent;
    out.aboutRows = [...document.querySelectorAll('#about-extra .about-list-row strong')].map(e => e.textContent);

    return out;
  `, 240000);
  check('application theme swatches change the app theme', sections.appThemeBefore === 'dark' && sections.appThemeAfter === 'light' && sections.appThemeBg !== sections.appThemeRestored,
    `${sections.appThemeBefore} -> ${sections.appThemeAfter}, bg ${sections.appThemeBg}`);
  check('the active theme swatch is marked', sections.pressed === 'true');
  check('the app theme can be switched back', sections.appThemeRestored === 'dark');
  check('reduce motion switch flips the setting', sections.motionBefore === 'false' && sections.motionAfter === 'true',
    `${sections.motionBefore} -> ${sections.motionAfter}`);
  check('reduce motion reaches the document', sections.motionAttr === 'on', sections.motionAttr);
  check('reduce motion is persisted, not just applied', sections.motionStored?.reduceMotion === true, JSON.stringify(sections.motionStored));
  check('reduce motion switches off again', sections.motionRestored === 'false' && sections.motionAttrRestored !== 'on',
    `switch ${sections.motionRestored}, attr ${sections.motionAttrRestored}`);
  check('library section shows the same controls', sections.libraryControls.length === 5, sections.libraryControls.join(', '));
  check('full settings library controls work', sections.fsView === 'list' && sections.fsGrid && sections.fsViewBack === 'grid');
  check('reset library view restores defaults',
    sections.afterReset.view === 'grid' && sections.afterReset.sortOrder === 'desc' && sections.afterReset.density === 'comfortable' && sections.afterReset.showMetadata === true,
    JSON.stringify(sections.afterReset));
  check('shortcuts are listed for the current view', sections.shortcutRows > 3 && sections.shortcutKeys.length > 0,
    `${sections.shortcutRows} rows, keys ${sections.shortcutKeys.join(' ')}`);
  // The figures are compared against a fresh measurement rather than hardcoded
  // numbers, so this fails if the panel is showing a cached or invented value.
  const statValue = (label) => sections.stats[sections.statsLabels.indexOf(label)];
  check('storage statistics come from the real library',
    sections.stats.length === sections.statsLabels.length
    && statValue('Books') === String(sections.liveStats.books)
    && statValue('Collections') === String(sections.liveStats.collections)
    && statValue('Highlights & notes') === String(sections.liveStats.annotations)
    && statValue('Files in storage') === String(sections.liveStats.managedFiles),
    `${sections.statsLabels.map((l, i) => `${l}=${sections.stats[i]}`).join(', ')}`);
  check('about shows the application version', /^\d+\.\d+\.\d+/.test(sections.aboutVersion || ''), sections.aboutVersion);
  check('about lists the application details', sections.aboutRows.length === 4, sections.aboutRows.join(', '));

  group('Storage & Data through the panel');
  const storagePanel = await cdp.eval(`
    const out = {};
    const open = async () => {
      document.getElementById('settings-btn').click();
      await new Promise(r => setTimeout(r, 400));
      if (SettingsUI.isExpanded()) { document.getElementById('settings-back-btn').click(); await new Promise(r => setTimeout(r, 300)); }
      document.getElementById('expand-settings-btn').click();
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('#full-settings-nav [data-section-target="storage"]').click();
      await new Promise(r => setTimeout(r, 1500));
    };

    await open();
    out.live = await Library.getBookStats();
    // The stat grid is read separately from the location block below it, so a
    // label outside the grid cannot be mistaken for one of the figures.
    out.grid = [...document.querySelectorAll('#storage-stats .storage-stat')].map(stat => ({
      label: stat.querySelector('.storage-label')?.textContent || '',
      value: stat.querySelector('.storage-value')?.textContent || ''
    }));
    out.location = document.getElementById('storage-path-text')?.textContent || null;
    out.hasCheckButton = !!document.getElementById('integrity-check-btn');
    out.hasBackupButton = !!document.getElementById('backup-library-btn');
    out.hasRestoreInput = !!document.getElementById('restore-library-input');

    // A real check driven from the panel must reach a verdict and fill the
    // results area, without the panel leaving its section.
    document.getElementById('integrity-check-btn').click();
    for (let i = 0; i < 120 && !document.getElementById('integrity-results').textContent.trim(); i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    out.verdict = document.querySelector('#integrity-results .integrity-verdict')?.textContent.trim() || null;
    out.groups = [...document.querySelectorAll('#integrity-results .integrity-group-label')].map(e => e.textContent);
    out.counts = [...document.querySelectorAll('#integrity-results .integrity-group-count')].map(e => e.textContent);
    out.orphansHidden = document.getElementById('storage-orphans')?.hidden;
    out.stillOnStorage = document.querySelector('#full-settings-nav [data-section-target="storage"]').classList.contains('active');
    return out;
  `, 300000);
  const at = (label) => storagePanel.grid.find(entry => entry.label === label)?.value;
  check('the panel shows the real book count', at('Books') === String(storagePanel.live.books), `Books=${at('Books')}`);
  check('the panel shows the real collection count', at('Collections') === String(storagePanel.live.collections), `Collections=${at('Collections')}`);
  check('the panel shows measured disk usage, not the recorded guess',
    at('On disk now') !== 'Unknown' && at('Recorded total') !== 'Unknown', `${at('On disk now')} / ${at('Recorded total')}`);
  check('the panel shows the real file count', at('Files in storage') === String(storagePanel.live.managedFiles), `Files=${at('Files in storage')}`);
  check('the panel shows the real library location',
    storagePanel.location === storagePanel.live.storageLocation && /^[A-Za-z]:[\\/]/.test(String(storagePanel.location || '')), String(storagePanel.location));
  check('the storage actions are present', storagePanel.hasCheckButton && storagePanel.hasBackupButton && storagePanel.hasRestoreInput);
  check('starting a check from the panel reaches a verdict', /Everything checks out|need attention|are readable/.test(storagePanel.verdict || ''), String(storagePanel.verdict));
  check('the check reports every category', storagePanel.groups.length === 6, storagePanel.groups.join(', '));
  check('a clean library reports no problems',
    storagePanel.counts.slice(1).every(c => c === '0'), storagePanel.counts.join(' / '));
  check('no unused files are offered on a clean library', storagePanel.orphansHidden === true);
  check('running a check keeps the user on the storage section', storagePanel.stillOnStorage === true);

  group('Deleting everything asks first');
  const guarded = await cdp.eval(`
    const out = {};
    document.getElementById('expand-settings-btn').click();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('#full-settings-nav [data-section-target="storage"]').click();
    await new Promise(r => setTimeout(r, 300));
    const before = (await NoveraDB.getAllBooks()).length;

    document.getElementById('delete-all-data-btn').click();
    await new Promise(r => setTimeout(r, 500));
    out.modalShown = !document.getElementById('delete-all-modal').classList.contains('hidden');
    out.booksAfterOpen = (await NoveraDB.getAllBooks()).length;

    // Cancelling must leave the library untouched.
    document.getElementById('cancel-delete-all-btn').click();
    await new Promise(r => setTimeout(r, 600));
    out.modalHidden = document.getElementById('delete-all-modal').classList.contains('hidden');
    out.booksAfterCancel = (await NoveraDB.getAllBooks()).length;
    out.before = before;
    return out;
  `, 180000);
  check('delete everything opens a confirmation', guarded.modalShown === true);
  check('opening the confirmation deletes nothing', guarded.booksAfterOpen === guarded.before, `${guarded.booksAfterOpen} books`);
  check('cancelling closes the confirmation', guarded.modalHidden === true);
  check('cancelling leaves every book in place', guarded.booksAfterCancel === guarded.before, `${guarded.booksAfterCancel} books`);
} catch (err) {
  check('settings suite', false, err.message);
  console.error(err);
} finally {
  console.log(`\n${pass}/${pass + fail} passed`);
  if (failures.length) console.log(`FAILURES:\n  ${failures.map(f => `[${f}]`).join('\n  ')}`);
  await shutdown(cdp);
}
process.exit(fail ? 1 : 0);
