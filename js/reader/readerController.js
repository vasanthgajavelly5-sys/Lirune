/**
 * Lirune Reader — Unified Reader Controller
 *
 * Format-agnostic front end for every reader engine.
 *
 *   File -> BookFormat.detect() -> ReaderAdapter -> Reader -> Reader UI
 *
 * The controller owns the shared reader surface: progress reporting, the
 * navigation (TOC) panel, in-document search, zoom dispatch and the reader
 * status bar. Adapters own the format specifics. No format-specific parsing
 * lives in the UI, and there is exactly one implementation of each control.
 */

const Reader = (() => {
  const ADAPTERS = {
    epub: () => EpubReaderAdapter,
    pdf: () => PdfAdapter,
    txt: () => TextAdapter,
    html: () => HtmlAdapter,
    fb2: () => Fb2Adapter,
    cbz: () => CbzAdapter,
    docx: () => DocxAdapter,
    odt: () => OdtAdapter,
    rtf: () => RtfAdapter
  };

  let adapter = null;
  let currentRecord = null;
  let currentFormat = null;
  let zoomControl = null;
  let searchResults = [];
  let searchIndex = -1;
  let searchGeneration = 0;
  let progressTimer = null;
  let currentSessionToken = 0;

  // ---------------------------------------------------------------- hosts
  function epubHost() { return document.getElementById('epub-container'); }
  function documentHost() { return document.getElementById('format-container'); }

  function showOnly(host) {
    [epubHost(), documentHost()].forEach(node => {
      if (!node) return;
      node.classList.toggle('hidden', node !== host);
    });
  }

  // ---------------------------------------------------------------- init
  function init() {
    zoomControl = ZoomControl.create('reader-zoom-control', {
      min: 50,
      max: 200,
      step: 10,
      label: 'Reader zoom',
      onChange: (value, meta) => {
        if (meta?.changed) applyZoomToAdapter(value);
        const display = document.getElementById('zoom-display');
        if (display) display.textContent = `${value}%`;
      }
    });
  }

  // ---------------------------------------------------------------- open
  async function open(bookRecord) {
    await close();

    const sessionToken = ++currentSessionToken;
    currentRecord = bookRecord || null;
    if (!currentRecord) return false;

    const bytes = await readRecordBytes(bookRecord);
    if (sessionToken !== currentSessionToken) return false;
    if (bytes) bookRecord.fileData = bytes;

    const format = await BookFormat.detect(bookRecord.originalName || bookRecord.title || '', bytes);
    if (sessionToken !== currentSessionToken) return false;

    if (!format.supported) {
      showLoading(false);
      Utils.toast(`${format.label} files are not supported: ${format.reason || 'unsupported format'}`, 'error');
      return false;
    }
    if (!ADAPTERS[format.id]) {
      showLoading(false);
      Utils.toast(`${format.label} files are not supported in this build.`, 'error');
      return false;
    }

    currentFormat = format;
    showLoading(true, `Opening ${format.label.toLowerCase()} file...`);

    const host = format.id === 'epub' ? epubHost() : documentHost();
    if (!host) {
      showLoading(false);
      return false;
    }
    showOnly(host);

    const settings = ReaderSettings.getSettings();
    const AdapterClass = ADAPTERS[format.id]().Adapter;
    const instance = new AdapterClass(host, bookRecord);

    try {
      const hooks = {
        onLocationChange: () => { if (sessionToken === currentSessionToken) scheduleProgress(); },
        onSectionChange: () => { if (sessionToken === currentSessionToken) refreshNavigationPanel(); },
        onPageChange: () => { if (sessionToken === currentSessionToken) scheduleProgress(); }
      };
      if (typeof instance.open === 'function') await instance.open(hooks);
      if (sessionToken !== currentSessionToken) {
        try { await instance.destroy?.(); } catch {}
        return false;
      }

      adapter = instance;
      applyAdapterSettings(settings);
      applyZoomToAdapter(zoomControl ? zoomControl.get() : 100);
      renderNavigation();
      updateProgressUI();
      updateFormatUI(format);
      showLoading(false);
      startProgressLoop();
      return true;
    } catch (error) {
      console.error(`Could not open ${format.id}: ${error?.name || 'Error'}: ${error?.message || error}`);
      console.error(error);
      adapter = null;
      currentFormat = null;
      showLoading(false);
      Utils.toast(`Could not open this ${format.label} file: ${error.message || 'unreadable'}`, 'error');
      return false;
    }
  }

  async function readRecordBytes(record) {
    try {
      if (record.fileData) return record.fileData;
      if (record.storageId && window.noveraDesktop?.readManagedBook) {
        return await window.noveraDesktop.readManagedBook(record.storageId, record.fingerprint, record.fileSize);
      }
    } catch (error) {
      console.warn('Could not read book bytes:', error);
    }
    return null;
  }

  async function close() {
    currentSessionToken++;
    stopProgressLoop();
    searchGeneration++;
    searchResults = [];
    searchIndex = -1;
    if (adapter) {
      try { await adapter.destroy?.(); } catch (error) { console.warn('Adapter cleanup warning:', error); }
    }
    adapter = null;
    currentFormat = null;
    currentRecord = null;
    clearSearchUi();
  }

  // ---------------------------------------------------------------- guards
  function requireAdapter() {
    if (!adapter) {
      Utils.toast('No document is open.', 'info');
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- navigation
  async function next() { if (requireAdapter()) await adapter.next?.(); }
  async function prev() { if (requireAdapter()) await adapter.prev?.(); }
  async function goTo(target) { if (requireAdapter()) await adapter.goTo?.(target); }

  async function scrollBy(dx, dy) {
    if (!requireAdapter()) return;
    if (adapter.scroll) return adapter.scroll(dy);
    if (adapter.scrollBy) return adapter.scrollBy(dx, dy);
  }

  function scrollMode() {
    return ReaderSettings.getSettings().flow === 'scrolled';
  }

  // ---------------------------------------------------------------- settings / zoom
  function applyAdapterSettings(settings) {
    if (!adapter) return;
    adapter.applySettings?.(settings);
  }

  function applyZoomToAdapter(value) {
    adapter?.setZoom?.(value);
  }

  function applySettings(settings) {
    if (!adapter) return;
    if (adapter.capabilities?.typography !== false) {
      adapter.applySettings?.(settings);
    } else {
      // Fixed-layout and image formats ignore typography but still need a
      // repaint when flow/fit-related settings change.
      adapter.applySettings?.(settings);
    }
  }

  function getZoom() { return zoomControl ? zoomControl.get() : 100; }
  function adjustZoom(delta) { zoomControl?.adjust(delta); }
  function setZoom(value) { zoomControl?.set(value); }
  function showZoomControl() { zoomControl?.show(); }

  // ---------------------------------------------------------------- progress
  function getProgress() {
    return adapter?.getProgress?.() || { percent: 0, chapter: '', page: null, pageCount: null, locationLabel: '' };
  }

  function getLocation() {
    return adapter?.getLocation?.() || '';
  }

  function getFormatInfo() {
    return currentFormat;
  }

  function getAdapter() {
    return adapter;
  }

  function startProgressLoop() {
    stopProgressLoop();
    progressTimer = setInterval(() => {
      if (document.getElementById('reader-view')?.classList.contains('hidden')) return stopProgressLoop();
      persistProgress();
    }, 3000);
  }

  function stopProgressLoop() {
    clearInterval(progressTimer);
    progressTimer = null;
  }

  function scheduleProgress() {
    updateProgressUI();
    persistProgress();
  }

  function updateProgressUI() {
    const progress = getProgress();
    const percent = Number.isFinite(progress.percent) ? progress.percent : 0;
    const chapter = progress.chapter || '';
    const locationLabel = progress.locationLabel || '';

    const chapterEl = document.getElementById('progress-chapter');
    const pageInfoEl = document.getElementById('page-info');
    const fillEl = document.getElementById('reading-stripe-fill');
    const stripe = document.getElementById('reading-stripe');
    const statusChapter = document.getElementById('status-chapter-name');
    const statusPct = document.getElementById('status-progress-pct');
    const statusPage = document.getElementById('status-page');

    if (chapterEl) chapterEl.textContent = chapter || 'Reading';
    if (pageInfoEl) pageInfoEl.textContent = locationLabel ? `${locationLabel} · ${percent}%` : `${percent}%`;
    if (fillEl) fillEl.style.width = `${percent}%`;
    if (stripe) stripe.setAttribute('aria-valuenow', String(percent));
    if (statusChapter) statusChapter.textContent = chapter || 'Reading';
    if (statusPct) statusPct.textContent = `${percent}% read`;
    if (statusPage) statusPage.textContent = locationLabel;
  }

  function persistProgress() {
    if (!currentRecord?.id || !adapter) return;
    const progress = getProgress();
    const location = getLocation();
    NoveraDB.updateProgress(currentRecord.id, {
      currentCfi: location || '',
      progressPercent: Number.isFinite(progress.percent) ? progress.percent : 0,
      currentChapter: progress.chapter || 'Reading'
    }).catch(error => console.warn('Progress save failed:', error));
  }

  function updateFormatUI(format) {
    const title = document.getElementById('reader-title');
    const author = document.getElementById('reader-author');
    if (title) title.textContent = currentRecord?.title || 'Untitled';
    if (author) author.textContent = currentRecord?.author ? `by ${currentRecord.author}` : format.label;

    const capabilities = adapter?.capabilities || {};
    document.getElementById('settings-panel')?.toggleAttribute('data-unsupported', capabilities.typography === false);
    document.getElementById('annotations-toggle-btn')?.toggleAttribute('disabled', capabilities.annotations === false);
    document.getElementById('search-toggle-btn')?.toggleAttribute('disabled', capabilities.search === false);
    document.getElementById('toc-toggle-btn')?.toggleAttribute('disabled', capabilities.toc === false);

    const note = document.getElementById('format-note');
    if (note) {
      note.textContent = capabilities.typography === false
        ? `${format.label} is a fixed-layout format. Typography settings do not apply.`
        : '';
      note.classList.toggle('hidden', !note.textContent);
    }

    // Layout controls are format-specific: flowing text has flow/spread,
    // fixed-layout and image formats have fit mode instead.
    const flowing = capabilities.typography === true;
    const flowRow = document.getElementById('flow-control-row');
    const spreadRow = document.getElementById('spread-control-row');
    const spreadHeading = document.getElementById('spread-subheading');
    const fitRow = document.getElementById('fit-control-row');
    const fitHeading = document.getElementById('fit-subheading');
    flowRow?.classList.toggle('hidden', !flowing);
    spreadRow?.classList.toggle('hidden', !flowing || currentFormat.id !== 'epub');
    spreadHeading?.classList.toggle('hidden', !flowing || currentFormat.id !== 'epub');
    fitRow?.classList.toggle('hidden', flowing);
    fitHeading?.classList.toggle('hidden', flowing);

    document.querySelectorAll('[data-fit]').forEach(button => {
      button.classList.toggle('active', button.dataset.fit === (adapter?.getFit?.() || 'width'));
    });
    document.querySelectorAll('[data-font], [data-alignment], #spacing-slider, #margin-slider')
      .forEach(control => { control.disabled = capabilities.typography === false; });
  }

  // ---------------------------------------------------------------- navigation panel
  function getNavigation() {
    return adapter?.getNavigation?.() || [];
  }

  /**
   * Adapters own the notion of "where am I" in their own navigation list, so
   * the panel can highlight the right row for every format without the UI
   * knowing how a chapter, page or section is identified.
   */
  function getActiveNavId() {
    const reported = adapter?.getActiveNavId?.();
    return reported == null ? null : String(reported);
  }

  function renderNavigation() {
    const listEl = document.getElementById('toc-list');
    const filterInput = document.getElementById('toc-filter-input');
    const titleEl = document.getElementById('toc-panel-title');
    if (!listEl) return;

    const items = getNavigation();
    if (titleEl) {
      const layout = currentFormat?.layout;
      titleEl.textContent = layout === 'image' ? 'Pages' : (layout === 'fixed' ? 'Document outline' : 'Contents');
    }

    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<p class="toc-empty">This document has no navigation entries.</p>';
      filterInput?.setAttribute('disabled', 'true');
      return;
    }
    filterInput?.removeAttribute('disabled');

    const activeId = getActiveNavId();
    const fragment = document.createDocumentFragment();
    items.slice(0, 5000).forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `toc-entry depth-${Math.min(2, item.depth || 0)}`;
      button.dataset.navId = item.id;
      button.dataset.navTarget = item.target ?? '';
      const isActive = String(item.id) === String(activeId);
      button.classList.toggle('active', isActive);
      if (isActive) button.setAttribute('aria-current', 'true');
      button.innerHTML = `<span class="toc-progress-dot" aria-hidden="true"></span><span class="toc-text">${Utils.escapeHTML(item.label)}</span>`;
      button.addEventListener('click', async () => {
        if (item.target == null) return;
        await goTo(item.target);
        App.closeDrawer('toc-panel');
      });
      fragment.appendChild(button);
    });
    listEl.appendChild(fragment);

    if (filterInput) {
      filterInput.oninput = event => {
        const query = event.target.value.toLowerCase().trim();
        listEl.querySelectorAll('.toc-entry').forEach(entry => {
          entry.hidden = !(entry.textContent || '').toLowerCase().includes(query);
        });
      };
    }
  }

  function refreshNavigationPanel() {
    const listEl = document.getElementById('toc-list');
    if (!listEl || !listEl.querySelector('.toc-entry')) return;
    const activeId = String(getActiveNavId() ?? '');
    let best = null;
    listEl.querySelectorAll('.toc-entry').forEach(entry => {
      const isActive = activeId && String(entry.dataset.navId) === activeId;
      entry.classList.toggle('active', isActive);
      if (isActive) {
        entry.setAttribute('aria-current', 'true');
        best = entry;
      } else {
        entry.removeAttribute('aria-current');
      }
    });
    if (best && document.getElementById('toc-panel')?.classList.contains('open')) {
      best.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---------------------------------------------------------------- search
  async function search(query) {
    if (!adapter) return;
    const capabilities = adapter.capabilities || {};
    const countEl = document.getElementById('search-count');
    const resultsEl = document.getElementById('search-results');
    const generation = ++searchGeneration;
    const text = (query || '').trim();

    if (capabilities.search === false) {
      if (countEl) countEl.textContent = 'Not available';
      if (resultsEl) resultsEl.innerHTML = '<div class="search-empty">This format has no searchable text layer.</div>';
      return [];
    }
    if (text.length < 2) {
      searchResults = [];
      searchIndex = -1;
      if (countEl) countEl.textContent = '0 results';
      if (resultsEl) resultsEl.innerHTML = '';
      return [];
    }

    if (countEl) countEl.textContent = 'Searching...';
    if (resultsEl) resultsEl.innerHTML = '<div class="search-empty">Searching document...</div>';

    const found = await adapter.search(text);
    if (generation !== searchGeneration) return [];

    searchResults = Array.isArray(found) ? found : [];
    searchIndex = searchResults.length ? 0 : -1;

    if (countEl) countEl.textContent = `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`;
    renderSearchResults(text);
    if (searchResults.length) await adapter.goToSearchResult(0);
    return searchResults;
  }

  function renderSearchResults(query) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = '';
    if (!searchResults.length) {
      resultsEl.innerHTML = '<div class="search-empty">No occurrences found.</div>';
      return;
    }
    const needle = query.toLowerCase();
    const fragment = document.createDocumentFragment();
    searchResults.slice(0, 200).forEach((hit, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-result';
      const excerpt = Utils.escapeHTML(hit.excerpt || '');
      row.innerHTML = `<div class="search-result-excerpt">${excerpt.replace(new RegExp(`(${escapeRegExp(Utils.escapeHTML(needle))})`, 'gi'), '<mark>$1</mark>')}</div>`;
      row.addEventListener('click', async () => {
        searchIndex = index;
        await adapter.goToSearchResult(index);
        highlightSearchResult(index);
      });
      fragment.appendChild(row);
    });
    resultsEl.appendChild(fragment);
    highlightSearchResult(0);
  }

  function highlightSearchResult(index) {
    const rows = document.querySelectorAll('.search-result');
    rows.forEach((row, i) => row.classList.toggle('active', i === index));
  }

  async function nextSearchResult() {
    if (!searchResults.length) return;
    searchIndex = (searchIndex + 1) % searchResults.length;
    await adapter.goToSearchResult(searchIndex);
    highlightSearchResult(searchIndex);
  }

  async function prevSearchResult() {
    if (!searchResults.length) return;
    searchIndex = (searchIndex - 1 + searchResults.length) % searchResults.length;
    await adapter.goToSearchResult(searchIndex);
    highlightSearchResult(searchIndex);
  }

  function clearSearchUi() {
    const countEl = document.getElementById('search-count');
    const resultsEl = document.getElementById('search-results');
    if (countEl) countEl.textContent = '0 results';
    if (resultsEl) resultsEl.innerHTML = '';
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------------------------------------------------------------- loading
  function showLoading(show, text) {
    const loader = document.getElementById('reader-loading');
    const label = document.getElementById('reader-loading-text');
    if (loader) loader.classList.toggle('hidden', !show);
    if (label && text) label.textContent = text;
  }

  // ---------------------------------------------------------------- fit modes
  function setFit(mode) {
    adapter?.setFit?.(mode);
  }

  function getFit() {
    return adapter?.getFit?.() || 'width';
  }

  /**
   * Re-mount the open document with the current settings, preserving the
   * reading position. Only formats that need to rebuild their layout use it.
   */
  async function reRender() {
    if (!adapter || !currentRecord) return false;
    if (currentFormat?.id === 'epub') {
      return EpubLoader.reRender();
    }
    const record = currentRecord;
    const position = getLocation();
    const progress = getProgress();
    const success = await open(record);
    if (success && position) {
      if (progress.page && (currentFormat?.layout === 'image' || currentFormat?.layout === 'fixed')) {
        await goTo(String(progress.page));
      } else if (currentFormat?.layout === 'reflowable') {
        const target = tocItemsTargetFor(progress.chapter);
        if (target) await goTo(target);
      }
    }
    return success;
  }

  function tocItemsTargetFor(chapterLabel) {
    if (!chapterLabel) return null;
    const entry = getNavigation().find(item => item.label === chapterLabel && item.target != null);
    return entry ? entry.target : null;
  }

  return {
    init,
    open,
    close,
    reRender,
    next,
    prev,
    goTo,
    scrollBy,
    scrollMode,
    applySettings,
    getZoom,
    setZoom,
    adjustZoom,
    showZoomControl,
    getProgress,
    getLocation,
    getNavigation,
    getActiveNavId,
    renderNavigation,
    refreshNavigationPanel,
    getFormatInfo,
    getAdapter,
    search,
    nextSearchResult,
    prevSearchResult,
    updateProgressUI,
    setFit,
    getFit
  };
})();
