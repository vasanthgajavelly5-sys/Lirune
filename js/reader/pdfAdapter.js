/**
 * Lirune Reader — PDF Reader Adapter (Apache-2.0 pdf.js)
 *
 * PDF is a fixed-layout format, so this adapter deliberately exposes only what
 * a page-oriented reader can honour: page navigation, page count, fit modes and
 * zoom. EPUB-style typography settings (font family, paragraph margin, line
 * height) are reported as unsupported and are ignored by the reader UI.
 */

const PdfAdapter = (() => {
  let libraryPromise = null;

  /**
   * pdf.js ships as an ES module, so it is loaded by the dedicated module
   * script (js/reader/pdfjs-loader.js) which publishes `window.pdfjsLib`.
   * This adapter only waits for that global to appear.
   */
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('The PDF engine did not start.'));
      }, 15000);
      const onReady = () => {
        cleanup();
        resolve(window.pdfjsLib);
      };
      const onError = () => {
        cleanup();
        reject(new Error('The PDF engine could not be loaded.'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('lirune:pdfjs-ready', onReady);
        window.removeEventListener('lirune:pdfjs-error', onError);
      };
      window.addEventListener('lirune:pdfjs-ready', onReady);
      window.addEventListener('lirune:pdfjs-error', onError);
    }).catch(error => {
      libraryPromise = null;
      throw error;
    });
    return libraryPromise;
  }

  const FIT_MODES = ['width', 'page', 'custom'];

  class Adapter {
    constructor(host, record) {
      this.host = host;
      this.record = record || {};
      this.format = 'pdf';
      this.formatLabel = 'PDF';
      this.capabilities = {
        typography: false,
        search: true,
        toc: true,
        annotations: false,
        zoom: true,
        paginate: true
      };
      this.viewportEl = null;
      this.canvasWrap = null;
      this.canvas = null;
      this.context = null;
      this.pdf = null;
      this.pageNumber = 1;
      this.pageCount = 0;
      this.zoom = 100;
      this.fitMode = 'width';
      this.destroyed = false;
      this.outline = [];
      this.searchIndex = [];
      this.activeSearch = -1;
      this._renderToken = 0;
      this._renderTask = null;
      this._pending = null;
    }

    async open(hooks) {
      this.hooks = hooks || {};
      const pdfjs = await loadPdfJs();
      const bytes = await this.loadBytes();
      // pdf.js takes ownership of the transferred buffer, so hand it a copy.
      this.pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
      this.pageCount = this.pdf.numPages;
      await this._readOutline();
      this._mount();
      this._attachResize();
      await this.renderPage(this._savedPage());
      return true;
    }

    /**
     * The page the reader last stopped on, clamped to this document's real
     * page count so a stale or hand-edited value cannot open past the end.
     */
    _savedPage() {
      const match = /^page:(\d+)/.exec(String(this.record.currentCfi || ''));
      if (!match) return 1;
      const page = Number(match[1]);
      if (!Number.isFinite(page) || page < 1) return 1;
      return Math.min(this.pageCount || 1, Math.round(page));
    }

    destroy() {
      this.destroyed = true;
      this._settleRender();
      this._resizeObserver?.disconnect();
      window.removeEventListener('resize', this._onWindowResize);
      try { this.pdf?.destroy?.(); } catch { /* already gone */ }
      this.pdf = null;
      if (this.host) this.host.innerHTML = '';
      this.canvasWrap = null;
      this.canvas = null;
      this.viewportEl = null;
    }

    _mount() {
      this.host.innerHTML = '';
      this.host.classList.remove('hidden');
      this.host.classList.add('pdf-host');

      this.viewportEl = document.createElement('div');
      this.viewportEl.className = 'pdf-viewport';
      this.viewportEl.setAttribute('role', 'document');
      this.viewportEl.tabIndex = 0;
      this.viewportEl.setAttribute('aria-label', 'PDF pages');

      this.canvasWrap = document.createElement('div');
      this.canvasWrap.className = 'pdf-page';

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'pdf-canvas';
      this.canvasWrap.appendChild(this.canvas);
      this.viewportEl.appendChild(this.canvasWrap);
      this.host.appendChild(this.viewportEl);
      this.context = this.canvas.getContext('2d', { alpha: false });
      this._onWindowResize = () => this._renderInBackground(this.pageNumber);
      window.addEventListener('resize', this._onWindowResize);
    }

    _attachResize() {
      if (typeof ResizeObserver === 'undefined' || !this.viewportEl) return;
      this._resizeObserver = new ResizeObserver(() => {
        clearTimeout(this._pending);
        this._pending = setTimeout(() => this._renderInBackground(this.pageNumber), 120);
      });
      this._resizeObserver.observe(this.viewportEl);
    }

    async _readOutline() {
      this.outline = [];
      try {
        const raw = await this.pdf.getOutline();
        if (!raw?.length) return;
        // An outline destination is an array whose first entry is the page
        // reference; pdf.js resolves that reference to a page index.
        const pageFor = async dest => {
          const ref = Array.isArray(dest) ? dest[0] : dest;
          if (!ref) return null;
          const index = await this.pdf.getPageIndex(ref);
          return typeof index === 'number' ? index + 1 : null;
        };
        const walk = async (items, depth) => {
          for (const item of items) {
            let page = null;
            try {
              page = await pageFor(item.dest);
            } catch { /* unresolved destination */ }
            this.outline.push({
              label: item.title || 'Untitled section',
              depth: Math.min(2, depth),
              page
            });
            if (item.items?.length) await walk(item.items, depth + 1);
          }
        };
        await walk(raw, 0);
      } catch { /* outline is optional */ }
    }

    getNavigation() {
      if (this.outline.length) {
        return this.outline.map((item, index) => ({
          id: `pdf-outline-${index}`,
          label: item.label,
          target: item.page ? String(item.page) : null,
          depth: item.depth
        }));
      }
      // No embedded outline: expose the document's real page list.
      return Array.from({ length: this.pageCount }, (_, index) => ({
        id: `pdf-page-${index + 1}`,
        label: `Page ${index + 1}`,
        target: String(index + 1),
        depth: 0
      }));
    }

    /**
     * The entry that owns the current page. With an embedded outline that is
     * the last section starting at or before the current page; without one the
     * page list itself is the navigation, so the current page is the entry.
     */
    getActiveNavId() {
      if (!this.outline.length) return `pdf-page-${this.pageNumber}`;
      let active = null;
      for (let index = 0; index < this.outline.length; index += 1) {
        const page = this.outline[index].page;
        if (!Number.isFinite(page) || page > this.pageNumber) break;
        active = `pdf-outline-${index}`;
      }
      return active;
    }

    async goTo(target) {
      const page = Number(target);
      if (!Number.isFinite(page)) return false;
      return this.renderPage(Math.min(this.pageCount, Math.max(1, Math.round(page))));
    }

    async next() {
      return this.renderPage(this.pageNumber + 1);
    }

    async prev() {
      return this.renderPage(this.pageNumber - 1);
    }

    async scroll(delta) {
      if (!this.viewportEl) return false;
      this.viewportEl.scrollBy({ top: delta, behavior: 'auto' });
      return true;
    }

    async renderPage(number) {
      if (!this.pdf || this.destroyed) return false;
      const target = Math.min(this.pageCount, Math.max(1, Number(number) || 1));

      // A resize, a zoom or a quick page turn can start a new render before
      // the previous one finishes. pdf.js refuses to share a canvas between
      // concurrent renders, so the in-flight task is cancelled and awaited
      // before the next one starts.
      await this._settleRender();

      const page = await this.pdf.getPage(target);
      if (this.destroyed) return false;

      const token = ++this._renderToken;
      const base = page.getViewport({ scale: 1 });
      const available = this._availableSize();
      let scale = (this.zoom / 100) * this.cssPixelsPerUnit();
      if (this.fitMode === 'width') scale = this.zoom / 100 * (available.width / base.width);
      if (this.fitMode === 'page') {
        scale = this.zoom / 100 * Math.min(available.width / base.width, available.height / base.height);
      }

      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = this.canvas;
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      this.canvasWrap.setAttribute('aria-label', `Page ${target} of ${this.pageCount}`);

      const task = page.render({ canvasContext: this.context, viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
      this._renderTask = task;
      try {
        await task.promise;
      } catch (error) {
        // A cancelled render is the expected outcome of a superseded one.
        if (error?.name !== 'RenderingCancelledException') throw error;
        return false;
      } finally {
        if (this._renderTask === task) this._renderTask = null;
      }
      if (token !== this._renderToken || this.destroyed) return false;

      this.pageNumber = target;
      this.hooks.onPageChange?.(target, this.pageCount);
      this.hooks.onLocationChange?.();
      return true;
    }

    /** Repaints the current page without making the caller wait for it. */
    _renderInBackground(number) {
      this.renderPage(number).catch(error => {
        console.warn('PDF page render failed:', error);
      });
    }

    /** Cancels any in-flight render and waits for the canvas to be free. */
    async _settleRender() {
      const task = this._renderTask;
      if (!task) return;
      this._renderTask = null;
      try {
        task.cancel();
        await task.promise;
      } catch {
        // Cancellation is the point; a rejected render settles the same way.
      }
    }

    _availableSize() {
      const rect = this.viewportEl?.getBoundingClientRect();
      return {
        width: Math.max(120, (rect?.width || 800) - 48),
        height: Math.max(120, (rect?.height || 600) - 48)
      };
    }

    cssPixelsPerUnit() {
      return 1;
    }

    setZoom(zoom) {
      const next = Math.min(200, Math.max(50, Number(zoom) || 100));
      if (next === this.zoom) return false;
      this.zoom = next;
      this._renderInBackground(this.pageNumber);
      return true;
    }

    getZoom() {
      return this.zoom;
    }

    setFit(mode) {
      if (!FIT_MODES.includes(mode) || mode === 'custom') mode = 'width';
      this.fitMode = mode;
      this._renderInBackground(this.pageNumber);
      return true;
    }

    getFit() {
      return this.fitMode;
    }

    applySettings() {
      // Fixed-layout documents ignore typography settings by design.
      this._renderInBackground(this.pageNumber);
      return true;
    }

    getLocation() {
      return `page:${this.pageNumber}`;
    }

    getProgress() {
      const percent = this.pageCount > 1
        ? Math.round(((this.pageNumber - 1) / (this.pageCount - 1)) * 100)
        : (this.pageCount === 1 ? 100 : 0);
      return {
        percent: Math.min(100, Math.max(0, percent)),
        chapter: `Page ${this.pageNumber} of ${this.pageCount}`,
        page: this.pageNumber,
        pageCount: this.pageCount,
        locationLabel: `Page ${this.pageNumber} / ${this.pageCount}`
      };
    }

    // ---- text search over the document's own text layer ---------------
    async search(query) {
      const text = (query || '').trim();
      this.query = text;
      this.searchIndex = [];
      this.activeSearch = -1;
      if (text.length < 2) return [];

      for (let pageNumber = 1; pageNumber <= this.pageCount; pageNumber++) {
        if (this.destroyed) break;
        const page = await this.pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        let line = '';
        let linePage = pageNumber;
        for (const item of content.items) {
          if (item.str) {
            if (!line) linePage = pageNumber;
            line += item.str + (item.hasEOL ? '\n' : ' ');
          } else if (item.hasEOL) {
            line += '\n';
          }
        }
        const haystack = line.toLowerCase();
        const needle = text.toLowerCase();
        let index = haystack.indexOf(needle);
        while (index !== -1) {
          this.searchIndex.push({
            page: pageNumber,
            excerpt: line.slice(Math.max(0, index - 45), index + needle.length + 45).replace(/\s+/g, ' ').trim()
          });
          if (this.searchIndex.length > 500) return this.searchIndex;
          index = haystack.indexOf(needle, index + needle.length);
        }
      }
      if (this.searchIndex.length) this.activeSearch = 0;
      return this.searchIndex;
    }

    async goToSearchResult(index) {
      if (!this.searchIndex.length) return null;
      this.activeSearch = ((index % this.searchIndex.length) + this.searchIndex.length) % this.searchIndex.length;
      const hit = this.searchIndex[this.activeSearch];
      await this.renderPage(hit.page);
      return { index: this.activeSearch, total: this.searchIndex.length };
    }

    nextSearchResult() {
      return this.goToSearchResult(this.activeSearch + 1);
    }

    prevSearchResult() {
      return this.goToSearchResult(this.activeSearch - 1);
    }

    getSearchResultCount() {
      return this.searchIndex.length;
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      if (this.record.storageId && window.noveraDesktop?.readManagedBook) {
        const buffer = await window.noveraDesktop.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error('This PDF is unavailable.');
    }
  }

  return { Adapter, loadPdfJs, FIT_MODES };
})();
