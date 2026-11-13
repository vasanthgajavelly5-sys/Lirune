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
      this.flow = 'scrolled';
      this.pagesMap = new Map();
      this._pageRenderTasks = new Map();
      this._intersectionObserver = null;
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
      this.pageNumber = this._savedPage();
      this._mount();
      this._attachResize();
      await this.goTo(this.pageNumber);
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
      this._pageRenderTasks.forEach(task => {
        try { task.cancel(); } catch {}
      });
      this._pageRenderTasks.clear();
      this._intersectionObserver?.disconnect();
      this._resizeObserver?.disconnect();
      window.removeEventListener('resize', this._onWindowResize);
      try { this.pdf?.destroy?.(); } catch { /* already gone */ }
      this.pdf = null;
      if (this.host) this.host.innerHTML = '';
      this.pagesMap.clear();
      this.viewportEl = null;
    }

    _mount() {
      this.host.innerHTML = '';
      this.host.classList.remove('hidden');
      this.host.classList.add('pdf-host');

      this.viewportEl = document.createElement('div');
      this.viewportEl.className = 'pdf-viewport' + (this.flow === 'paginated' ? ' is-paginated' : '');
      this.viewportEl.setAttribute('role', 'document');
      this.viewportEl.tabIndex = 0;
      this.viewportEl.setAttribute('aria-label', 'PDF pages');

      this.pagesMap = new Map();
      for (let i = 1; i <= this.pageCount; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'pdf-page' + (this.flow === 'paginated' ? (i === this.pageNumber ? ' is-active' : '') : ' is-active');
        wrap.dataset.page = String(i);
        wrap.id = `pdf-page-${i}`;
        wrap.setAttribute('aria-label', `Page ${i} of ${this.pageCount}`);

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';
        wrap.appendChild(canvas);
        this.viewportEl.appendChild(wrap);

        this.pagesMap.set(i, { wrap, canvas, rendered: false });
      }

      this.host.appendChild(this.viewportEl);

      this._setupObserver();
      this._onWindowResize = () => this._rerenderAllVisible();
      window.addEventListener('resize', this._onWindowResize);
    }

    _setupObserver() {
      this._intersectionObserver?.disconnect();
      if (typeof IntersectionObserver === 'undefined' || !this.viewportEl) return;

      this._intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.dataset.page);
          if (entry.isIntersecting && pageNum) {
            this._renderPageCanvas(pageNum).catch(err => {
              if (err?.name !== 'RenderingCancelledException') console.warn('PDF render warning:', err);
            });
          }
        }
      }, {
        root: this.viewportEl,
        rootMargin: '300px 0px 300px 0px',
        threshold: 0.01
      });

      this.pagesMap.forEach(p => {
        this._intersectionObserver.observe(p.wrap);
      });

      this.viewportEl.addEventListener('scroll', () => {
        if (this.flow !== 'scrolled') return;
        const vRect = this.viewportEl.getBoundingClientRect();
        const vMid = vRect.top + vRect.height * 0.35;
        let bestPage = this.pageNumber;
        let minDiff = Infinity;
        for (const [num, p] of this.pagesMap.entries()) {
          const pRect = p.wrap.getBoundingClientRect();
          if (pRect.bottom >= vRect.top && pRect.top <= vRect.bottom) {
            const diff = Math.abs(pRect.top - vMid);
            if (diff < minDiff) {
              minDiff = diff;
              bestPage = num;
            }
          }
        }
        if (bestPage !== this.pageNumber) {
          this.pageNumber = bestPage;
          this.hooks.onPageChange?.(this.pageNumber, this.pageCount);
          this.hooks.onLocationChange?.();
        }
      }, { passive: true });
    }

    _attachResize() {
      if (typeof ResizeObserver === 'undefined' || !this.viewportEl) return;
      this._resizeObserver = new ResizeObserver(() => {
        clearTimeout(this._pending);
        this._pending = setTimeout(() => this._rerenderAllVisible(), 120);
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
      const page = Math.min(this.pageCount, Math.max(1, Number(target) || 1));
      this.pageNumber = page;
      if (this.flow === 'scrolled') {
        const wrap = this.pagesMap.get(page)?.wrap;
        wrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        await this._renderPageCanvas(page);
      } else {
        this.pagesMap.forEach((p, num) => {
          p.wrap.classList.toggle('is-active', num === page);
        });
        await this._renderPageCanvas(page);
      }
      this.hooks.onPageChange?.(this.pageNumber, this.pageCount);
      this.hooks.onLocationChange?.();
      return true;
    }

    async next() {
      if (this.pageNumber < this.pageCount) {
        return this.goTo(this.pageNumber + 1);
      }
      return false;
    }

    async prev() {
      if (this.pageNumber > 1) {
        return this.goTo(this.pageNumber - 1);
      }
      return false;
    }

    async scroll(delta) {
      if (!this.viewportEl) return false;
      this.viewportEl.scrollBy({ top: delta, behavior: 'auto' });
      return true;
    }

    async renderPage(number) {
      return this.goTo(number);
    }

    async _renderPageCanvas(target) {
      if (!this.pdf || this.destroyed) return false;
      const pageInfo = this.pagesMap.get(target);
      if (!pageInfo) return false;

      const existingTask = this._pageRenderTasks.get(target);
      if (existingTask) {
        try { existingTask.cancel(); } catch {}
        this._pageRenderTasks.delete(target);
      }

      const page = await this.pdf.getPage(target);
      if (this.destroyed) return false;

      const base = page.getViewport({ scale: 1 });
      const available = this._availableSize();
      let scale = (this.zoom / 100) * this.cssPixelsPerUnit();
      if (this.fitMode === 'width') scale = this.zoom / 100 * (available.width / base.width);
      if (this.fitMode === 'page') {
        scale = this.zoom / 100 * Math.min(available.width / base.width, available.height / base.height);
      }

      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = pageInfo.canvas;
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      pageInfo.wrap.style.width = `${Math.floor(viewport.width)}px`;
      pageInfo.wrap.style.minHeight = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      const task = page.render({ canvasContext: ctx, viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
      this._pageRenderTasks.set(target, task);
      try {
        await task.promise;
        pageInfo.rendered = true;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') throw err;
      } finally {
        if (this._pageRenderTasks.get(target) === task) {
          this._pageRenderTasks.delete(target);
        }
      }
      return true;
    }

    /** Repaints visible pages when layout changes. */
    async _rerenderAllVisible() {
      if (!this.viewportEl || this.destroyed) return;
      const vRect = this.viewportEl.getBoundingClientRect();
      for (const [num, p] of this.pagesMap.entries()) {
        if (this.flow === 'paginated') {
          if (num === this.pageNumber) this._renderPageCanvas(num).catch(() => {});
        } else {
          const pRect = p.wrap.getBoundingClientRect();
          if (pRect.bottom >= vRect.top - 200 && pRect.top <= vRect.bottom + 200) {
            this._renderPageCanvas(num).catch(() => {});
          }
        }
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
      this._rerenderAllVisible();
      return true;
    }

    getZoom() {
      return this.zoom;
    }

    setFit(mode) {
      if (!FIT_MODES.includes(mode) || mode === 'custom') mode = 'width';
      this.fitMode = mode;
      this._rerenderAllVisible();
      return true;
    }

    getFit() {
      return this.fitMode;
    }

    applySettings(settings) {
      if (settings?.flow && settings.flow !== this.flow) {
        this.flow = settings.flow;
        if (this.flow === 'paginated') {
          this.viewportEl?.classList.add('is-paginated');
          this.pagesMap.forEach((p, num) => {
            p.wrap.classList.toggle('is-active', num === this.pageNumber);
          });
          this._renderPageCanvas(this.pageNumber);
        } else {
          this.viewportEl?.classList.remove('is-paginated');
          this.pagesMap.forEach(p => {
            p.wrap.classList.add('is-active');
          });
          this._renderPageCanvas(this.pageNumber);
          this.pagesMap.get(this.pageNumber)?.wrap?.scrollIntoView({ block: 'start' });
        }
      } else {
        this._rerenderAllVisible();
      }
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
