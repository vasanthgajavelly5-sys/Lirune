/**
 * Lirune Reader — CBZ Comic Archive Reader Adapter
 *
 * A CBZ is a ZIP of images. It has no chapter structure, so navigation is a
 * page list derived from the archive itself, sorted naturally so `page2` comes
 * before `page10`. Only images are read out of the archive; nothing else in the
 * ZIP is executed or interpreted.
 */

const CbzAdapter = (() => {
  class Adapter {
    constructor(host, record) {
      this.host = host;
      this.record = record || {};
      this.format = 'cbz';
      this.formatLabel = 'Comic archive';
      this.capabilities = {
        typography: false,
        search: false,
        toc: true,
        annotations: false,
        zoom: true,
        paginate: true
      };
      this.viewportEl = null;
      this.stage = null;
      this.image = null;
      this.pages = [];
      this.pageIndex = 0;
      this.zoom = 100;
      this.fitMode = 'width';
      this.destroyed = false;
      this._pending = null;
    }

    async open(hooks) {
      this.hooks = hooks || {};
      if (typeof JSZip === 'undefined') throw new Error('Archive support is unavailable.');
      const bytes = await this.loadBytes();
      const zip = await JSZip.loadAsync(bytes);
      this.pages = Object.values(zip.files)
        .filter(entry => !entry.dir && BookFormat.IMAGE_EXT.includes(BookFormat.extensionOf(entry.name)))
        .sort((a, b) => naturalCompare(a.name, b.name))
        .map(entry => ({ name: entry.name, entry }));
      if (!this.pages.length) throw new Error('This comic archive contains no readable images.');
      this._mount();
      this._attachResize();
      await this.renderPage(this._savedPage());
      return true;
    }

    /**
     * The page the reader last stopped on, clamped to the real page count.
     *
     * A comic's page list comes from the archive itself, so unlike a paginated
     * text document the page index is stable across reopens as long as the
     * archive is the same one.
     */
    _savedPage() {
      const match = /^page:(\d+)/.exec(String(this.record.currentCfi || ''));
      if (!match) return 0;
      const index = Number(match[1]) - 1;
      if (!Number.isFinite(index) || index < 0) return 0;
      return Math.min(this.pages.length - 1, index);
    }

    destroy() {
      this.destroyed = true;
      this._resizeObserver?.disconnect();
      if (this.host) this.host.innerHTML = '';
      this.pages = [];
      this.image = null;
      this.stage = null;
      this.viewportEl = null;
      this.zip = null;
    }

    _mount() {
      this.host.innerHTML = '';
      this.host.classList.remove('hidden');
      this.host.classList.add('cbz-host');

      this.viewportEl = document.createElement('div');
      this.viewportEl.className = 'cbz-viewport';
      this.viewportEl.setAttribute('role', 'document');
      this.viewportEl.tabIndex = 0;

      this.stage = document.createElement('div');
      this.stage.className = 'cbz-stage';

      this.image = document.createElement('img');
      this.image.className = 'cbz-page';
      this.image.alt = 'Comic page';
      this.image.decoding = 'async';

      this.stage.appendChild(this.image);
      this.viewportEl.appendChild(this.stage);
      this.host.appendChild(this.viewportEl);
    }

    _attachResize() {
      if (typeof ResizeObserver === 'undefined' || !this.viewportEl) return;
      this._resizeObserver = new ResizeObserver(() => {
        clearTimeout(this._pending);
        this._pending = setTimeout(() => this.applyFit(), 120);
      });
      this._resizeObserver.observe(this.viewportEl);
    }

    async renderPage(index) {
      if (!this.pages.length || this.destroyed) return false;
      const target = Math.min(this.pages.length - 1, Math.max(0, Number(index) || 0));
      const page = this.pages[target];
      const blob = await page.entry.async('blob');
      if (this.destroyed) return false;
      const url = URL.createObjectURL(blob);
      const previous = this.image.dataset.objectUrl;
      this.image.dataset.objectUrl = url;
      this.image.src = url;
      if (previous) URL.revokeObjectURL(previous);
      this.image.alt = `Page ${target + 1}: ${page.name}`;
      await this.image.decode?.().catch(() => {});
      this.pageIndex = target;
      this.applyFit();
      this.hooks.onPageChange?.(target + 1, this.pages.length);
      this.hooks.onLocationChange?.();
      return true;
    }

    applyFit() {
      if (!this.image || !this.stage) return;
      const rect = this.viewportEl.getBoundingClientRect();
      const naturalWidth = this.image.naturalWidth || rect.width || 1;
      const naturalHeight = this.image.naturalHeight || rect.height || 1;
      const available = { width: Math.max(80, rect.width - 48), height: Math.max(80, rect.height - 48) };
      const scale = this.zoom / 100;
      let width;
      if (this.fitMode === 'page') {
        width = Math.min(available.width, (available.height * naturalWidth) / naturalHeight) * scale;
      } else {
        width = available.width * scale;
      }
      this.image.style.width = `${Math.max(1, Math.floor(width))}px`;
      this.image.style.height = 'auto';
      this.stage.style.width = `${Math.max(1, Math.floor(width))}px`;
    }

    async next() {
      return this.renderPage(this.pageIndex + 1);
    }

    async prev() {
      return this.renderPage(this.pageIndex - 1);
    }

    getActiveNavId() {
      return `cbz-${this.pageIndex + 1}`;
    }

    async goTo(target) {
      const index = Number(target);
      if (!Number.isFinite(index)) return false;
      return this.renderPage(index - 1);
    }

    async scroll(delta) {
      if (!this.viewportEl) return false;
      this.viewportEl.scrollBy({ top: delta, behavior: 'auto' });
      return true;
    }

    setZoom(zoom) {
      const next = Math.min(200, Math.max(50, Number(zoom) || 100));
      if (next === this.zoom) return false;
      this.zoom = next;
      this.applyFit();
      return true;
    }

    getZoom() {
      return this.zoom;
    }

    setFit(mode) {
      this.fitMode = mode === 'page' ? 'page' : 'width';
      this.applyFit();
      return true;
    }

    getFit() {
      return this.fitMode;
    }

    applySettings() {
      this.applyFit();
      return true;
    }

    getLocation() {
      return `page:${this.pageIndex + 1}`;
    }

    getProgress() {
      const total = this.pages.length;
      const percent = total > 1 ? Math.round((this.pageIndex / (total - 1)) * 100) : (total === 1 ? 100 : 0);
      return {
        percent: Math.min(100, Math.max(0, percent)),
        chapter: `Page ${this.pageIndex + 1} of ${total}`,
        page: this.pageIndex + 1,
        pageCount: total,
        locationLabel: `Page ${this.pageIndex + 1} / ${total}`
      };
    }

    getNavigation() {
      return this.pages.map((page, index) => ({
        id: `cbz-${index + 1}`,
        label: page.name,
        target: String(index + 1),
        depth: 0
      }));
    }

    async search() {
      // Comic pages are raster images: there is no text layer to search.
      return [];
    }

    nextSearchResult() { return null; }
    prevSearchResult() { return null; }
    getSearchResultCount() { return 0; }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      if (this.record.storageId && window.noveraDesktop?.readManagedBook) {
        const buffer = await window.noveraDesktop.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error('This comic archive is unavailable.');
    }
  }

  function naturalCompare(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  return { Adapter };
})();
