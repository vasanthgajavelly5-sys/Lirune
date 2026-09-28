/**
 * Lirune Reader — EPUB Engine (epub.js wrapper)
 * Renders EPUB books, manages TOC, navigation, annotations, and in-book search.
 */

const EpubLoader = (() => {
  let currentBook = null;
  let rendition = null;
  let currentBookData = null;
  let tocItems = [];
  let isBookLoaded = false;
  let searchResults = [];
  let currentSearchIdx = -1;
  let searchGeneration = 0;
  let activeSelection = null; // { cfiRange, text, chapter }
  let annotationCache = [];
  let lastNavigationAt = 0;
  let currentProgress = { percent: 0, chapter: 'Reading', page: null, pageCount: null, locationLabel: '' };
  let currentLocationLabel = '';
  let currentNavigation = [];
  let lastRenderedSections = [];
  let currentZoom = 100;
  let currentActiveHref = '';
  let locationsPromise = null;

  const HIGHLIGHT_COLORS = {
    yellow: '#FBBF24',
    blue: '#60A5FA',
    green: '#34D399',
    pink: '#F472B6',
    purple: '#A78BFA',
    orange: '#FB923C'
  };

  function getCapabilities() {
    return {
      typography: true,
      search: true,
      toc: true,
      annotations: true,
      zoom: true,
      paginate: true
    };
  }

  function getFormat() {
    return 'epub';
  }

  function getProgress() {
    return { ...currentProgress };
  }

  function getLocation() {
    if (!rendition) return '';
    const location = rendition.currentLocation();
    if (!location?.start) return currentBookData?.currentCfi || '';
    return location.start.cfi;
  }

  function getNavigation() {
    return currentNavigation.map(item => ({ ...item }));
  }

  /**
  /**
   * The navigation entry that owns the reader's current location.
   *
   * Matching on spine index alone is enough when every chapter is its own
   * file, but plenty of books pack several chapters into one document. In
   * that case the entries are ordered by their position in the rendered
   * document and the active one is the last entry at or before the visible
   * area, which works in both paginated and scrolled mode.
   */
  function findActiveEntry() {
    if (!currentNavigation.length) return null;
    const index = getCurrentSpineIndex();
    if (index === null) {
      return currentActiveHref ? resolveChapter(currentActiveHref) : null;
    }

    const candidates = currentNavigation.filter(item => item.spineIndex === index);
    if (candidates.length <= 1) {
      return candidates[0] || (currentActiveHref ? resolveChapter(currentActiveHref) : null);
    }

    const doc = getCurrentDocument();
    const axis = readingAxis(doc);
    const limit = readingLimit(doc, axis);
    if (axis === null || limit === null) return candidates[0];

    let active = candidates[0];
    for (const item of candidates) {
      const start = elementStart(item.href, doc, axis);
      if (start !== null && start >= limit) break;
      active = item;
    }
    return active;
  }

  /**
   * Which way the document advances. epub.js paginates by laying content out
   * in columns, in which case a later entry starts further to the right;
   * reflowed documents simply get taller.
   */
  function readingAxis(doc) {
    if (!doc) return null;
    const container = doc.querySelector('.epub-container') || doc.body;
    if (!container) return null;
    const columns = getComputedStyle(container).columnWidth;
    return columns && columns !== 'auto' ? 'x' : 'y';
  }

  /**
   * The element epub.js paginates by scrolling. It lives in the reader shell,
   * not in the ebook document, because epub.js renders the whole spine as one
   * very wide view and slides that view horizontally.
   */
  function getViewContainer() {
    const frame = getCurrentDocument()?.defaultView?.frameElement;
    return frame?.closest?.('.epub-container') || null;
  }

  /**
   * The edge of the rendered viewport along the reading axis.
   *
   * A paginated document is one wide view scrolled by its view container, so
   * an element's own offset is already an absolute document position and the
   * visible page is the container's scroll position plus its width. A
   * reflowed document scrolls itself, so its viewport is its own scroll
   * position plus the window height.
   */
  function readingLimit(doc, axis) {
    if (!doc || !axis) return null;
    if (axis === 'x') {
      const view = getViewContainer();
      if (!view) return null;
      const value = view.scrollLeft + view.clientWidth;
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    const scroller = doc.scrollingElement || doc.documentElement;
    const value = (scroller?.scrollTop || 0) + (doc.defaultView?.innerHeight || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function elementStart(href, doc, axis) {
    const fragment = fragmentOf(href);
    if (!fragment || !doc) return null;
    const element = doc.getElementById(fragment)
      || doc.querySelector(`[name="${CSS.escape(fragment)}"]`);
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    const rect = element.getBoundingClientRect();
    return axis === 'x' ? rect.left : rect.top;
  }

  function fragmentOf(href) {
    const text = String(href || '');
    const at = text.indexOf('#');
    return at < 0 ? '' : text.slice(at + 1);
  }

  /** The navigation entry that owns the reader's current location. */
  function getActiveNavId() {
    const match = findActiveEntry();
    return match ? match.id : null;
  }

  function setZoom(zoom) {
    const next = Math.min(200, Math.max(50, Number(zoom) || 100));
    if (next === currentZoom) return false;
    currentZoom = next;
    applyStylesToAllContents();
    return true;
  }

  function getZoom() {
    return currentZoom;
  }

  /** Resolves once epub.js has produced its real location list. */
  function waitForLocations(timeout = 20000) {
    if (!currentBook) return Promise.reject(new Error('No book is open'));
    if (currentBook.locations && currentBook.locations.total > 0) return Promise.resolve(currentBook.locations);
    if (!locationsPromise) return Promise.reject(new Error('Location generation was not started'));
    return Promise.race([
      locationsPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Location generation timed out')), timeout))
    ]);
  }

  /** The real EPUB CFI for a percentage of the way through the book. */
  function cfiFromPercentage(percent) {
    if (!currentBook?.locations || !currentBook.locations.total) return null;
    const value = Math.min(0.999, Math.max(0, Number(percent) / 100));
    try {
      return currentBook.locations.cfiFromPercentage(value);
    } catch (error) {
      console.warn('Could not build a CFI from a percentage:', error);
      return null;
    }
  }

  async function destroy() {
    try { rendition?.destroy(); } catch { /* already gone */ }
    try { currentBook?.destroy(); } catch { /* already gone */ }
    rendition = null;
    currentBook = null;
    currentBookData = null;
    tocItems = [];
    currentNavigation = [];
    lastRenderedSections = [];
    currentProgress = { percent: 0, chapter: 'Reading', page: null, pageCount: null, locationLabel: '' };
    currentLocationLabel = '';
    currentActiveHref = '';
    isBookLoaded = false;
    const container = document.getElementById('epub-container');
    if (container) container.innerHTML = '';
  }

  function getLastLocation() {
    return currentProgress;
  }

  async function openBook(bookRecord, targetCfi = null) {
    if (!bookRecord) {
      Utils.toast('Book record is missing or corrupted', 'error');
      return false;
    }

    currentBookData = bookRecord;
    annotationCache = [];
    searchGeneration++;
    searchResults = [];
    currentSearchIdx = -1;
    showLoading(true, 'Opening book...');

    // Clean up previous book & rendition to prevent memory leaks
    try {
      if (rendition) {
        rendition.destroy();
        rendition = null;
      }
      if (currentBook) {
        currentBook.destroy();
        currentBook = null;
      }
    } catch (cleanErr) {
      console.warn('Previous book cleanup warning:', cleanErr);
    }

    // Clear previous rendition DOM container
    const container = document.getElementById('epub-container');
    if (container) container.innerHTML = '';

    try {
      let epubData = bookRecord.fileData;
      if (!epubData && bookRecord.storageId && window.noveraDesktop?.readManagedBook) {
        epubData = await window.noveraDesktop.readManagedBook(bookRecord.storageId, bookRecord.fingerprint, bookRecord.fileSize);
      }
      if (!epubData) throw new Error('Book file is unavailable');

      // Initialize ePub instance from the selected book only.
      currentBook = ePub(epubData);

      const settings = ReaderSettings.getSettings();

      // Keep the reader viewport aware of the active epub.js flow. This lets
      // keyboard scrolling target the EPUB document rather than the outer app.
      if (container) {
        container.classList.toggle('flow-scrolled', settings.flow === 'scrolled');
      }

      // Render book into container
      rendition = currentBook.renderTo('epub-container', {
        width: '100%',
        height: '100%',
        flow: settings.flow || 'paginated',
        spread: settings.spread || 'auto',
        allowScriptedContent: false
      });

      // Register a default theme with body colors BEFORE display() so the
      // iframe is painted with Lirune's theme immediately instead of flashing
      // epub.js's default white background / black text.
      registerDefaultTheme();

      // Bind rendition lifecycle events
      bindRenditionEvents();

      // Update toolbar metadata
      document.getElementById('reader-title').textContent = bookRecord.title || 'Untitled';
      document.getElementById('reader-author').textContent = bookRecord.author ? `by ${bookRecord.author}` : '';

      // Display initial location (saved CFI or target or beginning)
      const startCfi = targetCfi || bookRecord.currentCfi || undefined;
      await rendition.display(startCfi);

      // Extract TOC navigation
      loadTableOfContents();

      // Apply active theme/settings in one pass after the first rendition
      // has been displayed.
      applySettings(settings);

      // Load and render existing annotations
      loadAnnotations(bookRecord.id);

      // Generate locations in background for accurate page & progress calculation
      locationsPromise = currentBook.ready
        .then(() => currentBook.locations.generate(1000))
        .then(() => {
          updateProgress();
          return currentBook.locations;
        })
        .catch(err => {
          console.warn('Location generation warning:', err);
          return null;
        });

      isBookLoaded = true;
      showLoading(false);
      return true;

    } catch (err) {
      console.error('Error rendering book:', err);
      if (bookRecord.storageId && /unavailable|corrupt/i.test(err.message || '')) {
        await NoveraDB.updateAvailability?.(bookRecord.id, 'unavailable');
      }
      showLoading(false);
      Utils.toast('Failed to load EPUB: ' + (err.message || 'Invalid format'), 'error');
      return false;
    }
  }

  function bindRenditionEvents() {
    if (!rendition) return;

    // Relocated event: triggers on page turns
    rendition.on('relocated', (location) => {
      updateProgress(location);

      // Hide selection toolbar on page turn
      hideSelectionToolbar();
    });

    // Content rendered in iframe: hook fonts, styles & keyboard events
    rendition.on('rendered', (section, view) => {
      injectIframeStyles(view.document);
      bindIframeKeyboard(view.document);
      bindIframeWheel(view.document);
      bindIframeNavigation(view.document);
    });

    // Text selection inside the EPUB iframe
    rendition.on('selected', (cfiRange, contents) => {
      const selection = contents.window.getSelection();
      const text = selection ? selection.toString().trim() : '';

      if (!text || text.length === 0) {
        hideSelectionToolbar();
        return;
      }

      // Determine current chapter title
      const chapter = document.getElementById('progress-chapter').textContent || '';
      activeSelection = { cfiRange, text, chapter };

      // Position selection toolbar near mouse / range
      positionSelectionToolbar(contents.window, selection);
    });

    // Tap or click outside selection
    rendition.on('click', () => {
      hideSelectionToolbar();
    });
  }

  function injectIframeStyles(doc) {
    if (!doc || !doc.head) return;

    // Add base reset and smoothing inside iframe
    if (!doc.getElementById('novera-iframe-base')) {
      const style = doc.createElement('style');
      style.id = 'novera-iframe-base';
      style.textContent = `
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        body { margin: 0 !important; }
        img, svg, video { max-width: 100% !important; height: auto !important; }
        p { margin-bottom: 1.15em !important; }
      `;
      doc.head.appendChild(style);
    }

    // Inject live custom typography & theme overrides
    injectPageStyles(doc);
  }

  function injectPageStyles(doc) {
    if (!doc || !doc.head) return;

    const themeName = ThemeManager.getReaderTheme();
    const colors = ThemeManager.getThemeColors(themeName);
    const settings = ReaderSettings.getSettings();

    const fontFam = settings.fontFamily === 'Original' ? 'inherit' : `'${settings.fontFamily}', Georgia, serif`;
    const headingFam = settings.fontFamily === 'Playfair Display' ? "'Playfair Display', Georgia, serif" : fontFam;
    const fontSize = Math.round((settings.fontSize || 18) * currentZoom / 100);
    const alignment = settings.alignment || 'left';
    const lineHeight = settings.lineHeight || 1.6;
    const margin = settings.margin ? `${settings.margin * 3}px` : '30px';

    let styleEl = doc.getElementById('novera-page-custom-style');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'novera-page-custom-style';
      doc.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      html, body {
        background-color: ${colors.bg} !important;
        color: ${colors.text} !important;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      body {
        font-family: ${fontFam} !important;
        font-size: ${fontSize}px !important;
        line-height: ${lineHeight} !important;
        padding-left: ${margin} !important;
        padding-right: ${margin} !important;
      }
      p, div, li, blockquote, dd, dt, span {
        font-family: ${fontFam} !important;
        color: ${colors.text} !important;
        line-height: ${lineHeight} !important;
        text-align: ${alignment} !important;
      }
      small, figcaption, cite, .muted, .secondary, [class*="muted"], [class*="secondary"] {
        color: ${colors.muted} !important;
      }
      p, li, blockquote {
        font-size: ${fontSize}px !important;
      }
      h1, h2, h3, h4, h5, h6 {
        color: ${colors.text} !important;
        font-family: ${headingFam} !important;
      }
      a, a:link, a:visited {
        color: ${colors.link} !important;
      }
      ::selection {
        background: ${colors.selection} !important;
        color: ${colors.selectionText} !important;
      }
    `;
  }

  function bindIframeKeyboard(doc) {
    if (!doc) return;
    doc.addEventListener('keydown', (e) => {
      // Forward keydown event to main window handler
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        bubbles: true
      }));
    });
  }

  function bindIframeWheel(doc) {
    if (!doc || doc.documentElement.dataset.noveraWheelBound === 'true') return;
    doc.documentElement.dataset.noveraWheelBound = 'true';

    let gestureLocked = false;
    doc.addEventListener('wheel', (event) => {
      const settings = ReaderSettings.getSettings();
      if (settings.flow === 'scrolled' || Math.abs(event.deltaY) < 8 || gestureLocked) return;

      event.preventDefault();
      gestureLocked = true;
      if (event.deltaY > 0) {
        next();
      } else {
        prev();
      }
      setTimeout(() => { gestureLocked = false; }, 280);
    }, { passive: false });
  }

  function bindIframeNavigation(doc) {
    if (!doc || doc.documentElement.dataset.noveraNavigationBound === 'true') return;
    doc.documentElement.dataset.noveraNavigationBound = 'true';
    let pointerStart = null;
    const interactive = 'a, button, input, select, textarea, [contenteditable], audio, video, iframe';

    doc.addEventListener('pointerdown', (event) => {
      pointerStart = { x: event.clientX, y: event.clientY, target: event.target };
    });
    doc.addEventListener('pointermove', () => { pointerStart = null; });
    doc.addEventListener('pointerup', (event) => {
      const settings = ReaderSettings.getSettings();
      const start = pointerStart;
      pointerStart = null;
      if (settings.mouseNavigation === false || !start || event.button !== 0 ||
          event.target.closest(interactive) || start.target.closest(interactive) ||
          doc.defaultView.getSelection()?.toString().trim()) return;
      if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) return;
      const zone = Number(settings.navigationZone || 25) / 100;
      const width = doc.documentElement.clientWidth || doc.defaultView.innerWidth;
      if (event.clientX <= width * zone) navigate('previous');
      else if (event.clientX >= width * (1 - zone)) navigate('next');
    });
    doc.addEventListener('pointermove', (event) => {
      const settings = ReaderSettings.getSettings();
      if (settings.mouseNavigation === false || settings.navigationHints === false || event.target.closest(interactive)) return;
      const zone = Number(settings.navigationZone || 25) / 100;
      const width = doc.documentElement.clientWidth || doc.defaultView.innerWidth;
      doc.body.style.cursor = event.clientX <= width * zone ? 'w-resize' : event.clientX >= width * (1 - zone) ? 'e-resize' : '';
    });
  }

  function positionSelectionToolbar(iframeWindow, selection) {
    const toolbar = document.getElementById('selection-toolbar');
    if (!toolbar) return;

    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const iframeRect = document.querySelector('#epub-container iframe')?.getBoundingClientRect() || { top: 0, left: 0 };

      const top = iframeRect.top + rect.top - 48;
      const left = iframeRect.left + rect.left + (rect.width / 2);

      toolbar.style.top = `${Math.max(60, top)}px`;
      toolbar.style.left = `${Math.min(window.innerWidth - 180, Math.max(160, left))}px`;
      toolbar.style.transform = 'translateX(-50%)';
      toolbar.classList.add('visible');
    } catch (e) {
      console.warn('Could not position selection toolbar:', e);
    }
  }

  function hideSelectionToolbar() {
    const toolbar = document.getElementById('selection-toolbar');
    if (toolbar) toolbar.classList.remove('visible');
    activeSelection = null;
  }

  function normalizeHref(href) {
    if (!href) return '';
    return String(href).split('#')[0].replace(/^\.\//, '');
  }

  /** Resolve the TOC entry that owns the current spine location. */
  function resolveChapter(href) {
    if (!href || tocItems.length === 0) return null;
    const current = normalizeHref(href);
    if (!current) return null;
    let match = null;
    let bestLength = -1;
    for (const item of tocItems) {
      const itemHref = normalizeHref(item.href);
      if (!itemHref) continue;
      const match2 = current === itemHref || current.endsWith(itemHref) || itemHref.endsWith(current);
      if (match2 && itemHref.length > bestLength) {
        match = item;
        bestLength = itemHref.length;
      }
    }
    return match;
  }

  function updateProgress(location) {
    if (!location && rendition) {
      location = rendition.currentLocation();
    }
    if (!location || !location.start) return;

    const currentCfi = location.start.cfi;
    const href = location.start.href || '';
    let percent = 0;

    if (currentBook && currentBook.locations && currentBook.locations.total > 0) {
      percent = Math.round(currentBook.locations.percentageFromCfi(currentCfi) * 100);
      if (isNaN(percent)) percent = 0;
    }

    const match = findActiveEntry();
    const currentChapter = match ? match.label : (currentBookData?.currentChapter || 'Reading');
    currentActiveHref = href;
    Reader?.refreshNavigationPanel?.();

    // epub.js reports a page index inside the current spine item; combine it
    // with the real generated locations for an honest "page n of m" reading.
    const pageInSection = location.start.displayed?.page;
    const totalPages = location.start.displayed?.total;
    const pageLabel = totalPages ? `Page ${pageInSection} of ${totalPages}` : (pageInSection ? `Page ${pageInSection}` : '');

    currentProgress = {
      percent,
      chapter: currentChapter,
      page: Number.isFinite(Number(pageInSection)) ? Number(pageInSection) : null,
      pageCount: Number.isFinite(Number(totalPages)) ? Number(totalPages) : null,
      locationLabel: pageLabel
    };
    currentLocationLabel = pageLabel;

    // Update UI elements
    const chapterEl = document.getElementById('progress-chapter');
    const pageInfoEl = document.getElementById('page-info');
    const fillEl = document.getElementById('reading-stripe-fill');
    const statusChapter = document.getElementById('status-chapter-name');
    const statusPct = document.getElementById('status-progress-pct');
    const statusPage = document.getElementById('status-page');

    if (chapterEl) chapterEl.textContent = currentChapter;
    if (pageInfoEl) pageInfoEl.textContent = pageLabel ? `${pageLabel} · ${percent}%` : `${percent}%`;
    if (fillEl) fillEl.style.width = `${percent}%`;
    document.getElementById('reading-stripe')?.setAttribute('aria-valuenow', String(percent));
    if (statusChapter) statusChapter.textContent = currentChapter;
    if (statusPct) statusPct.textContent = `${percent}% read`;
    if (statusPage) statusPage.textContent = pageLabel;

    // Check if current location is bookmarked
    checkBookmarkStatus(currentCfi);

    // Persist reading progress to NoveraDB
    if (currentBookData && currentBookData.id) {
      NoveraDB.updateProgress(currentBookData.id, {
        currentCfi,
        progressPercent: percent,
        currentChapter
      });
    }
  }

  async function checkBookmarkStatus(cfi) {
    if (!currentBookData) return;
    const annotations = await NoveraDB.getAnnotations(currentBookData.id);
    const isBookmarked = annotations.some(a => a.type === 'bookmark' && a.cfiRange === cfi);
    const bmBtn = document.getElementById('bookmark-btn');
    if (bmBtn) {
      bmBtn.classList.toggle('active', isBookmarked);
      bmBtn.style.color = isBookmarked ? 'var(--accent-text)' : '';
    }
  }

  async function loadTableOfContents() {
    if (!currentBook) return;

    currentNavigation = [];
    lastRenderedSections = [];
    tocItems = [];

    try {
      const navigation = await currentBook.loaded.navigation;
      const entries = [];

      function flattenToc(items, depth = 0) {
        (items || []).forEach(item => {
          const label = (item.label || '').trim() || 'Untitled';
          entries.push({
            id: `toc-${entries.length + 1}`,
            label,
            href: item.href,
            target: item.href,
            depth,
            spineIndex: spineIndexFor(item.href)
          });
          if (item.subitems && item.subitems.length > 0) {
            flattenToc(item.subitems, depth + 1);
          }
        });
      }

      flattenToc(navigation.toc);

      if (entries.length === 0) {
        // A book without an NCX/nav document still has a real spine; expose it
        // rather than showing an empty panel.
        const spine = currentBook.spine?.spineItems || [];
        spine.forEach((item, index) => {
          const href = item.href || '';
          if (!href) return;
          entries.push({
            id: `toc-${entries.length + 1}`,
            label: `Section ${index + 1}`,
            href,
            target: href,
            depth: 0,
            spineIndex: index
          });
        });
      }

      tocItems = entries;
      currentNavigation = entries;
      Reader.renderNavigation();
    } catch (err) {
      console.warn('Could not load TOC:', err);
      Reader.renderNavigation();
    }
  }

  /**
   * epub.js reports the reader's position as a spine index, while navigation
   * documents reference documents by href. Resolving each navigation href to
   * its real spine index is what lets "current chapter" be answered for every
   * book, including ones whose chapter files share a single document.
   */
  function spineIndexFor(href) {
    if (!href || !currentBook?.spine) return null;
    try {
      const item = currentBook.spine.get(href);
      return Number.isFinite(item?.index) ? item.index : null;
    } catch (error) {
      return null;
    }
  }

  /** The index of that document in the spine. */
  function getCurrentSpineIndex() {
    if (!rendition) return null;
    const location = rendition.currentLocation();
    const index = location?.start?.index;
    return Number.isFinite(index) ? index : null;
  }

  function applyStylesToAllContents() {
    if (!rendition) return;

    try {
      // 1. Update all contents tracked by epub.js
      const contents = rendition.getContents();
      if (contents && contents.length) {
        contents.forEach(content => {
          if (content && content.document) {
            injectPageStyles(content.document);
          }
        });
      }

      // 2. Also check any visible iframe elements in epub-container
      const iframes = document.querySelectorAll('#epub-container iframe');
      iframes.forEach(iframe => {
        try {
          if (iframe.contentDocument) {
            injectPageStyles(iframe.contentDocument);
          }
        } catch (e) {}
      });
    } catch (e) {
      console.warn('Could not inject styles to all contents:', e);
    }
  }

  function scheduleLiveStyleRefresh() {
    // Theme/settings changes must be applied once. Rewriting every EPUB
    // iframe on multiple animation/timer passes causes the visible
    // top-to-bottom repaint/wipe effect.
    applyStylesToAllContents();
  }

   function registerDefaultTheme() {
    if (!rendition) return;

    const themeName = ThemeManager.getReaderTheme();
    const colors = ThemeManager.getThemeColors(themeName);
    const settings = ReaderSettings.getSettings();

    const fontFam = settings.fontFamily === 'Original'
      ? 'inherit'
      : `'${settings.fontFamily}', "Georgia", serif`;

    rendition.themes.default({
      body: {
        backgroundColor: colors.bg,
        color: colors.text,
        fontFamily: fontFam,
        fontSize: `${settings.fontSize || 18}px`,
        lineHeight: settings.lineHeight || 1.6
      }
    });
  }

  function applyTheme(themeName) {
    if (!rendition) return;

    // Force style injection directly to live iframe DOM
    scheduleLiveStyleRefresh();
  }

  function applySettings(settings) {
    if (!rendition) return;

    if (settings.fontSize) {
      const effectiveFontSize = Math.round(settings.fontSize * currentZoom / 100);
      rendition.themes.fontSize(`${effectiveFontSize}px`);
    }

    if (settings.fontFamily) {
      const font = settings.fontFamily === 'Original' ? 'inherit' : `'${settings.fontFamily}', serif`;
      rendition.themes.font(font);
    }

    // Force style injection directly to live iframe DOM
    scheduleLiveStyleRefresh();
  }

  function reRender() {
    if (!currentBookData) return;
    const currentLocation = rendition ? rendition.currentLocation() : null;
    const cfi = currentLocation ? currentLocation.start.cfi : currentBookData.currentCfi;
    openBook(currentBookData, cfi);
  }

  // Navigation
  function navigate(direction) {
    if (!rendition || Date.now() - lastNavigationAt < 120) return;
    lastNavigationAt = Date.now();
    rendition[direction === 'next' ? 'next' : 'prev']();
  }

  function next() {
    navigate('next');
  }

  function prev() {
    navigate('previous');
  }

  /**
   * Navigation documents point at a document plus a fragment
   * ("chapter3.xhtml#section-4"). epub.js only honours the document part, so
   * displaying the raw string lands on the top of the file. The fragment is
   * therefore scrolled to directly, on the axis epub.js paginates on, which
   * is what makes a table of contents land on the exact chapter rather than
   * the one that happens to share its file.
   */
  function goTo(target) {
    if (!rendition || !target) return;
    const text = String(target);
    const at = text.indexOf('#');
    if (at < 0) {
      rendition.display(text);
      return;
    }

    const file = text.slice(0, at);
    const fragment = text.slice(at + 1);
    if (!fragment) {
      rendition.display(file);
      return;
    }

    if (scrollToFragment(fragment)) return;

    // epub.js finishes positioning a freshly displayed document after it
    // announces the render, so the scroll is applied again once the engine
    // has settled on the new section.
    const onRendered = () => {
      rendition.off('rendered', onRendered);
      if (!scrollToFragment(fragment)) return;
      requestAnimationFrame(() => scrollToFragment(fragment));
      setTimeout(() => scrollToFragment(fragment), 300);
    };
    rendition.on('rendered', onRendered);
    rendition.display(file);
  }

  function getCurrentDocument() {
    const contents = rendition?.getContents?.();
    const first = contents?.[0];
    return first?.document || null;
  }

  function findFragmentElement(doc, fragment) {
    if (!doc || !fragment) return null;
    return doc.getElementById(fragment)
      || doc.querySelector(`[name="${CSS.escape(fragment)}"]`);
  }

  function scrollToFragment(fragment) {
    const doc = getCurrentDocument();
    const element = findFragmentElement(doc, fragment);
    if (!element) return false;

    if (readingAxis(doc) === 'x') {
      // A paginated document is one wide view scrolled by its container, so an
      // element's own offset is exactly the scroll position that shows it.
      const view = getViewContainer();
      if (!view) return false;
      view.scrollLeft = Math.max(0, Math.round(element.getBoundingClientRect().left));
    } else {
      const win = doc.defaultView;
      if (!win) return false;
      win.scrollTo({ top: Math.max(0, Math.round(element.getBoundingClientRect().top)), left: 0 });
    }
    return true;
  }

  function scrollBy(dx, dy) {
    if (!rendition) return;

    const settings = ReaderSettings.getSettings();
    if (settings.flow !== 'scrolled') {
      // Paginated mode has no vertical document scroll position; use the
      // existing page navigation semantics.
      if (dy < 0) prev();
      else if (dy > 0) next();
      return;
    }

    const iframe = document.querySelector('#epub-container iframe');
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!iframe || !doc || !win) return;

    // epub.js owns the EPUB document inside the iframe. Scroll that document
    // directly instead of scrolling the Electron reader shell.
    const scrollingElement = doc.scrollingElement || doc.documentElement || doc.body;
    if (scrollingElement) {
      const before = scrollingElement.scrollTop;
      scrollingElement.scrollTop = before + dy;
      if (scrollingElement.scrollTop !== before) return;
    }

    // Some EPUBs expose the scroll position through the iframe window.
    const beforeY = win.scrollY;
    win.scrollBy({ left: dx, top: dy, behavior: 'auto' });
    if (win.scrollY !== beforeY) return;

    // Final fallback for EPUB documents whose body owns the scroll box.
    if (doc.body) {
      doc.body.scrollTop = Math.max(0, doc.body.scrollTop + dy);
    }
  }

  // Annotations & Highlights
  async function addHighlight(color = 'yellow', note = '') {
    if (!activeSelection || !currentBookData) return;

    const { cfiRange, text, chapter } = activeSelection;
    const annotation = {
      id: Utils.generateId(),
      bookId: currentBookData.id,
      type: note ? 'note' : 'highlight',
      cfiRange,
      text,
      note,
      color,
      chapter,
      dateAdded: Date.now()
    };

    await NoveraDB.saveAnnotation(annotation);
    annotationCache.push(annotation);
    renderHighlightOnPage(annotation);
    hideSelectionToolbar();
    refreshAnnotationsPanel();
    Utils.toast('Highlight saved', 'success');
  }

  function renderHighlightOnPage(ann) {
    if (!rendition || !ann.cfiRange) return;
    const hex = HIGHLIGHT_COLORS[ann.color] || HIGHLIGHT_COLORS.yellow;

    try {
      rendition.annotations.highlight(
        ann.cfiRange,
        {},
        () => {
          // Click highlight opens annotations drawer
          document.getElementById('annotations-toggle-btn')?.click();
        },
        'hl-' + ann.id,
        {
          fill: hex,
          'fill-opacity': '0.38'
        }
      );
    } catch (e) {
      console.warn('Highlight render exception:', e);
    }
  }

  async function loadAnnotations(bookId) {
    annotationCache = await NoveraDB.getAnnotations(bookId);
    annotationCache.forEach(ann => {
      if (ann.type === 'highlight' || ann.type === 'note') {
        renderHighlightOnPage(ann);
      }
    });
  }

  async function toggleBookmark() {
    if (!rendition || !currentBookData) return;
    const loc = rendition.currentLocation();
    if (!loc || !loc.start) return;

    const cfi = loc.start.cfi;
    const existing = annotationCache.find(a => a.type === 'bookmark' && a.cfiRange === cfi);

    if (existing) {
      await NoveraDB.deleteAnnotation(existing.id);
      annotationCache = annotationCache.filter(annotation => annotation.id !== existing.id);
      Utils.toast('Bookmark removed');
    } else {
      const chapter = document.getElementById('progress-chapter').textContent || 'Bookmark';
      const bm = {
        id: Utils.generateId(),
        bookId: currentBookData.id,
        type: 'bookmark',
        cfiRange: cfi,
        text: `Page bookmark at ${loc.start.displayed?.page || ''}`,
        note: '',
        color: 'purple',
        chapter,
        dateAdded: Date.now()
      };
      await NoveraDB.saveAnnotation(bm);
      annotationCache.push(bm);
      Utils.toast('Page bookmarked', 'success');
    }

    checkBookmarkStatus(cfi);
    refreshAnnotationsPanel();
  }

  async function refreshAnnotationsPanel() {
    if (!currentBookData) return;
    const listEl = document.getElementById('ann-list-content');
    if (!listEl) return;

    const activeTab = document.querySelector('.ann-tab.active')?.dataset.tab || 'highlights';

    let filtered = [];
    if (activeTab === 'highlights') {
      filtered = annotationCache.filter(a => a.type === 'highlight');
    } else if (activeTab === 'notes') {
      filtered = annotationCache.filter(a => a.type === 'note');
    } else if (activeTab === 'bookmarks') {
      filtered = annotationCache.filter(a => a.type === 'bookmark');
    }

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty-state" style="padding:var(--sp-8);">
        <p>No ${activeTab} yet.</p>
      </div>`;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = item.type === 'bookmark' ? 'bookmark-item' : 'ann-item';

      if (item.type === 'bookmark') {
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div class="bookmark-label">🔖 ${Utils.escapeHTML(item.chapter)}</div>
              <div class="bookmark-date">${Utils.formatDate(item.dateAdded)}</div>
            </div>
            <button class="btn btn-ghost icon-btn btn-sm delete-ann-btn" title="Delete bookmark">✕</button>
          </div>
        `;
      } else {
        const hex = HIGHLIGHT_COLORS[item.color] || HIGHLIGHT_COLORS.yellow;
        card.innerHTML = `
          <div class="ann-highlight-bar" style="background:${hex};"></div>
          <p class="ann-text">"${Utils.escapeHTML(item.text)}"</p>
          ${item.note ? `<div class="ann-note-text">Note: ${Utils.escapeHTML(item.note)}</div>` : ''}
          <div class="ann-meta">
            <span class="ann-chapter">${Utils.escapeHTML(item.chapter)} · ${Utils.formatDate(item.dateAdded)}</span>
            <div class="ann-actions">
              <button class="btn btn-ghost icon-btn btn-sm delete-ann-btn" title="Delete">✕</button>
            </div>
          </div>
        `;
      }

      // Jump to annotation on click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-ann-btn')) return;
        goTo(item.cfiRange);
        document.getElementById('annotations-panel')?.classList.remove('open');
        document.getElementById('panel-overlay')?.classList.remove('visible');
      });

      // Delete annotation handler
      const delBtn = card.querySelector('.delete-ann-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await NoveraDB.deleteAnnotation(item.id);
          annotationCache = annotationCache.filter(annotation => annotation.id !== item.id);
          refreshAnnotationsPanel();
          if (currentBookData) {
            checkBookmarkStatus(rendition?.currentLocation()?.start?.cfi);
          }
        });
      }

      listEl.appendChild(card);
    });
  }

  // In-book Search
  async function searchBook(query) {
    const generation = ++searchGeneration;
    if (!currentBook || !query || query.trim().length < 2) {
      searchResults = [];
      currentSearchIdx = -1;
      return;
    }

    const countEl = document.getElementById('search-count');
    const resultsEl = document.getElementById('search-results');
    if (countEl) countEl.textContent = 'Searching...';
    if (resultsEl) resultsEl.innerHTML = '<div class="search-empty">Searching book chapters...</div>';

    searchResults = [];
    currentSearchIdx = -1;

    try {
      // Search through each spine section
      const spine = currentBook.spine?.spineItems || [];
      const concurrency = 3;
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < spine.length && generation === searchGeneration) {
          const item = spine[nextIndex++];
          try {
            await item.load(currentBook.load.bind(currentBook));
            const results = item.find(query.trim());
            if (results?.length) searchResults.push(...results);
          } catch (err) {
            console.warn('Spine item search skipped:', err.message || err);
          } finally {
            try { item.unload(); } catch (_) {}
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, spine.length) }, worker));
      if (generation !== searchGeneration) return;

      if (countEl) countEl.textContent = `${searchResults.length} results`;
      if (resultsEl) resultsEl.innerHTML = '';
      return searchResults;
    } catch (e) {
      console.error('In-book search error:', e);
      if (countEl) countEl.textContent = 'Search failed';
      return [];
    }
  }

  function getSearchResults() {
    return searchResults;
  }

  function goToSearchResult(index) {
    if (searchResults.length === 0) return null;
    const total = searchResults.length;
    currentSearchIdx = ((index % total) + total) % total;
    const hit = searchResults[currentSearchIdx];
    goTo(hit.cfi);
    if (hit.excerpt) {
      // Reveal the match inside the rendered page when the range resolves.
      try {
        const range = rendition.range(hit.cfi);
        if (range) range.start.contents.addClass('search-hit-active');
      } catch { /* off-page ranges are simply skipped */ }
    }
    return { index: currentSearchIdx, total };
  }

  function nextSearchResult() {
    return goToSearchResult(currentSearchIdx + 1);
  }

  function prevSearchResult() {
    return goToSearchResult(currentSearchIdx - 1);
  }

  function showLoading(show, text = 'Loading...') {
    const loader = document.getElementById('reader-loading');
    const label = document.getElementById('reader-loading-text');
    if (loader) loader.classList.toggle('hidden', !show);
    if (label && text) label.textContent = text;
  }

  function isLoaded() {
    return isBookLoaded;
  }

  function getActiveSelection() {
    return activeSelection;
  }

  return {
    openBook,
    applyTheme,
    applySettings,
    reRender,
    navigate,
    next,
    prev,
    goTo,
    scrollBy,
    addHighlight,
    toggleBookmark,
    refreshAnnotationsPanel,
    searchBook,
    nextSearchResult,
    prevSearchResult,
    getSearchResults,
    goToSearchResult,
    isLoaded,
    getActiveSelection,
    getCapabilities,
    getFormat,
    getProgress,
    getLocation,
    getNavigation,
    getActiveNavId,
      getZoom,
    setZoom,
    waitForLocations,
    cfiFromPercentage,
    destroy,
      getSearchResultCount: () => searchResults.length
  };
})();
