/**
 * Lirune Reader — Flowing Document Reader Adapter
 *
 * Shared engine for the reflowable, text-like formats (TXT, HTML, FB2). It
 * renders one continuous document into a host element, supports scrolled and
 * column-paginated reading, typography + zoom, in-document search, and a
 * navigation tree derived from the document's own section structure.
 *
 * Sub-classes only have to produce `sections`: an array of
 * { id, label, html } in reading order.
 */

const DocumentAdapter = (() => {
  const SECTION_SCROLL_GAP = 24;

  class Adapter {
    constructor(host, record) {
      this.host = host;
      this.record = record || {};
      this.format = 'document';
      this.capabilities = {
        typography: true,
        search: true,
        toc: true,
        annotations: false,
        zoom: true,
        paginate: true
      };
      this.element = null;
      this.viewport = null;
      this.sections = [];
      this.sectionOffsets = [];
      this.currentSectionId = null;
      this.zoom = 100;
      this.settings = null;
      this.query = '';
      this.matches = [];
      this.activeMatch = -1;
      this._staleMatches = false;
      this.flow = 'paginated';
      this._pageIndex = 0;
      this.destroyed = false;
      this._onScroll = this._onScroll.bind(this);
    }

    // ---- lifecycle -------------------------------------------------
    async open(hooks) {
      this.hooks = hooks || {};
      this.sections = await this.buildSections();
      if (!this.sections.length) throw new Error('This document has no readable content.');
      this._mount();
      this._measureSections();
      this._restoreLocation();
      this._observe();
      return true;
    }

    /**
     * Returns the reader to where they stopped.
     *
     * The saved location is a `page:n` or `scroll:n` string written by
     * getLocation(). Section ids are re-resolved on every mount because
     * pagination changes with the window size, so only the page index or scroll
     * offset is trusted, and it is clamped to what the document can actually
     * show right now. Restoring before the ResizeObserver settles would be
     * measured against stale geometry, so the first pass is retried once the
     * layout has been measured.
     */
    _restoreLocation() {
      const saved = String(this.record.currentCfi || '');
      if (!saved) return;

      const apply = () => {
        if (this.destroyed || !this.viewport) return;
        const page = /^page:(\d+)/.exec(saved);
        if (page && this.flow === 'paginated' && this.capabilities.paginate) {
          this._gotoPage(Number(page[1]));
          return;
        }
        const scroll = /^scroll:(\d+)/.exec(saved);
        if (scroll) {
          const target = Math.max(0, Number(scroll[1]));
          this.viewport.scrollTop = Math.min(target, Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight));
          this._syncActiveSection();
        }
      };

      apply();
      this._restoreRetry = setTimeout(apply, 250);
    }

    destroy() {
      this.destroyed = true;
      clearTimeout(this._restoreRetry);
      this._restoreRetry = null;
      // The observer keeps firing after teardown unless it is explicitly
      // disconnected, and its callback measures a viewport that no longer
      // exists. That is the source of a null clientWidth on close.
      this._resizeObserver?.disconnect();
      this._resizeObserver = null;
      if (this.viewport) this.viewport.removeEventListener('scroll', this._onScroll);
      if (this.element) this.element.remove();
      this.element = null;
      this.viewport = null;
      this.sections = [];
      this.sectionOffsets = [];
      this.matches = [];
      this._staleMatches = false;
    }

    // ---- rendering -------------------------------------------------
    _mount() {
      this.host.innerHTML = '';
      this.host.classList.remove('hidden');
      this.host.classList.add('doc-host');

      this.viewport = document.createElement('div');
      this.viewport.className = 'doc-viewport';
      this.viewport.setAttribute('role', 'document');
      this.viewport.tabIndex = 0;
      this.viewport.setAttribute('aria-label', 'Document content');

      this.element = document.createElement('article');
      this.element.className = 'doc-body';
      this.element.innerHTML = this.sections
        .map(section => `<section class="doc-section" data-section-id="${escapeAttr(section.id)}">${section.html}</section>`)
        .join('');

      this.viewport.appendChild(this.element);
      this.host.appendChild(this.viewport);
      this._applyLayout();
    }

    _applyLayout() {
      if (!this.element) return;
      const paginated = this.flow === 'paginated' && this.capabilities.paginate;
      this.viewport.classList.toggle('is-paginated', paginated);
      this.element.classList.toggle('is-paginated', paginated);
      this._applyTypography();
    }

    _applyTypography() {
      if (!this.element) return;
      const s = this.settings || {};
      const scale = this.zoom / 100;
      const baseSize = Number(s.fontSize) || 18;
      const fontFamily = !s.fontFamily || s.fontFamily === 'Original'
        ? 'inherit'
        : `'${s.fontFamily}', Georgia, serif`;
      const lineHeight = Number(s.lineHeight) || 1.6;
      const marginPercent = Number.isFinite(Number(s.margin)) ? Number(s.margin) : 10;
      const alignment = s.alignment || 'left';
      const pageGap = 48 * scale;

      this.element.style.setProperty('--doc-font-size', `${(baseSize * scale).toFixed(2)}px`);
      this.element.style.setProperty('--doc-font-family', fontFamily);
      this.element.style.setProperty('--doc-line-height', String(lineHeight));
      this.element.style.setProperty('--doc-align', alignment);
      this.element.style.setProperty('--doc-margin', `${marginPercent}%`);
      this.element.style.setProperty('--doc-page-gap', `${pageGap}px`);

      if (this.flow === 'paginated' && this.capabilities.paginate) {
        const width = this.viewport.clientWidth || 800;
        const usable = Math.max(240, width - (width * marginPercent * 2) / 100);
        this.element.style.setProperty('--doc-page-width', `${usable}px`);
      }
    }

    // ---- geometry --------------------------------------------------
    _measureSections() {
      if (!this.element) return;
      this.sectionOffsets = [...this.element.querySelectorAll('.doc-section')].map(node => {
        if (this.flow === 'paginated') {
          return { id: node.dataset.sectionId, top: node.offsetTop, left: node.offsetLeft };
        }
        return { id: node.dataset.sectionId, top: node.offsetTop, left: 0 };
      });
    }

    _measureNow() {
      if (this.destroyed || !this.element || !this.viewport) return;
      this._measureSections();
      // Re-clamping keeps the reader on a real page when the window changes
      // size or the typography makes the document longer or shorter.
      if (this.flow === 'paginated' && this.capabilities.paginate) {
        this._pageIndex = Math.min(this._maxPage(), this._pageIndex || 0);
      }
      this._applyPageOffset();
      this._syncActiveSection();
    }

    _pageMetrics() {
      if (!this.element || !this.viewport) return { width: 0, gap: 48, step: 48 };
      const width = this.viewport.clientWidth || 1;
      const gap = parseFloat(getComputedStyle(this.element).getPropertyValue('--doc-page-gap')) || 48;
      return { width, gap, step: width + gap };
    }

    _contentSize() {
      return this.flow === 'paginated'
        ? { width: this.element.scrollWidth, height: this.element.scrollHeight }
        : { width: this.viewport.scrollWidth, height: this.viewport.scrollHeight };
    }

    _maxPage() {
      if (this.flow !== 'paginated' || !this.capabilities.paginate) return 0;
      // Derived from the real scroll range so a short document never reports
      // pages it cannot actually show.
      return Math.max(0, Math.round((this._scrollRange() + 1) / this._pageMetrics().step));
    }

    _scrollRange() {
      if (!this.viewport) return 0;
      return Math.max(0, this.element.scrollWidth - this.viewport.clientWidth);
    }

    // ---- navigation ------------------------------------------------
    async next() {
      this._syncActiveSection();
      if (this.flow === 'paginated' && this.capabilities.paginate) {
        const target = this._maxPage();
        if (this._currentPage() < target) return this._gotoPage(this._currentPage() + 1);
        // On the last page. A short document can be one page yet still hold
        // several sections, so turning forward has to continue into the next
        // section or the rest of the book is unreachable by page turning.
        return this._stepSection(1);
      }
      const size = this._contentSize();
      const step = Math.max(80, (this.viewport.clientHeight || 400) * 0.9);
      if (this.viewport.scrollTop >= size.height - this.viewport.clientHeight - 2) {
        // Past the end: jump to the start of the following section.
        return this._stepSection(1);
      }
      this.viewport.scrollBy({ top: step, behavior: 'auto' });
      this._afterMove();
      return true;
    }

    async prev() {
      if (this.flow === 'paginated' && this.capabilities.paginate) {
        if (this._currentPage() > 0) return this._gotoPage(this._currentPage() - 1);
        // On the first page, step back into the previous section.
        return this._stepSection(-1);
      }
      if (this.viewport.scrollTop <= 2) return this._stepSection(-1);
      const step = Math.max(80, (this.viewport.clientHeight || 400) * 0.9);
      this.viewport.scrollBy({ top: -step, behavior: 'auto' });
      this._afterMove();
      return true;
    }

    _currentPage() {
      return this._pageIndex || 0;
    }

    /**
     * Moves the paginated document to a page.
     *
     * The paginated layout is one very wide multicolumn body inside a clipped
     * viewport. A whole book can lay out hundreds of thousands of pixels to
     * the right, and scrolling that viewport would force the engine to
     * re-lay-out the entire document on every page turn. The body is therefore
     * moved with a compositor transform, which only repaints the visible page.
     */
    _gotoPage(index) {
      const target = Math.min(this._maxPage(), Math.max(0, Math.round(index)));
      this._pageIndex = target;
      this._applyPageOffset();
      this._afterMove();
      return true;
    }

    _applyPageOffset() {
      if (!this.element) return;
      const paginated = this.flow === 'paginated' && this.capabilities.paginate;
      if (!paginated) {
        this.element.style.transform = '';
        return;
      }
      const offset = Math.min(this._scrollRange(), this._pageIndex * this._pageMetrics().step);
      this.element.style.transform = `translate3d(${-Math.round(offset)}px, 0, 0)`;
    }

    _scrollRange() {
      if (!this.viewport) return 0;
      return Math.max(0, this.element.scrollWidth - this.viewport.clientWidth);
    }

    _stepSection(direction) {
      const sections = this.sectionOffsets;
      if (!sections.length) return false;
      const currentTop = this.flow === 'paginated' ? 0 : this.viewport.scrollTop;
      let index = sections.findIndex(s => s.id === this.currentSectionId);
      if (index < 0) {
        index = sections.findIndex(s => currentTop + SECTION_SCROLL_GAP >= s.top);
        if (index < 0) index = direction > 0 ? sections.length - 1 : 0;
      }
      const nextIndex = Math.min(sections.length - 1, Math.max(0, index + direction));
      if (nextIndex === index) return false;
      this.goTo(sections[nextIndex].id);
      return true;
    }

    goTo(target) {
      const section = this.sectionOffsets.find(s => s.id === String(target)) || this.sectionOffsets[0];
      if (!section) return false;
      if (this.flow === 'paginated' && this.capabilities.paginate) {
        const { step } = this._pageMetrics();
        this._pageIndex = Math.max(0, Math.round(section.left / step));
        this._applyPageOffset();
      } else {
        this.viewport.scrollTo({ top: Math.max(0, section.top - SECTION_SCROLL_GAP), behavior: 'auto' });
      }
      this.currentSectionId = section.id;
      this._afterMove();
      return true;
    }

    _afterMove() {
      this._syncActiveSection();
      this.hooks.onLocationChange?.();
    }

    _syncActiveSection() {
      if (!this.element) return;
      let current = this.sectionOffsets[0];
      if (this.flow === 'paginated' && this.capabilities.paginate) {
        const { step } = this._pageMetrics();
        const x = this._pageIndex * step + 4;
        let best = this.sectionOffsets[0];
        for (const section of this.sectionOffsets) {
          if (section.left <= x) best = section; else break;
        }
        current = best;
      } else {
        const y = this.viewport.scrollTop + SECTION_SCROLL_GAP * 2;
        for (const section of this.sectionOffsets) {
          if (section.top <= y) current = section; else break;
        }
      }
      if (current && current.id !== this.currentSectionId) {
        const previous = this.currentSectionId;
        this.currentSectionId = current.id;
        this.hooks.onSectionChange?.(current.id, previous);
      }
    }

    _observe() {
      this._resizeObserver?.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => this._measureNow());
        this._resizeObserver.observe(this.viewport);
      }
      this.viewport.addEventListener('scroll', this._onScroll, { passive: true });
    }

    _onScroll() {
      this._syncActiveSection();
      this.hooks.onLocationChange?.();
    }

    // ---- reader settings -------------------------------------------
    applySettings(settings) {
      this.settings = { ...(this.settings || {}), ...(settings || {}) };
      const nextFlow = settings?.flow || this.flow;
      const flowChanged = nextFlow !== this.flow;
      this.flow = nextFlow;
      if (flowChanged) this._applyLayout();
      else this._applyTypography();
      if (flowChanged) this._measureNow();
      return true;
    }

    setZoom(zoom) {
      const next = Math.min(200, Math.max(50, Number(zoom) || 100));
      if (next === this.zoom) return false;
      this.zoom = next;
      this._applyTypography();
      this._measureNow();
      return true;
    }

    getZoom() {
      return this.zoom;
    }

    // ---- status -----------------------------------------------------
    getLocation() {
      if (this.flow === 'paginated' && this.capabilities.paginate) {
        return `page:${this._currentPage()}:${this.currentSectionId || ''}`;
      }
      return `scroll:${Math.round(this.viewport?.scrollTop || 0)}:${this.currentSectionId || ''}`;
    }

    getProgress() {
      const sections = this.sectionOffsets;
      const index = Math.max(0, sections.findIndex(s => s.id === this.currentSectionId));
      const current = sections[index] || null;
      const paginated = this.flow === 'paginated' && this.capabilities.paginate;
      const pageWidth = Math.max(1, this.viewport?.clientWidth || 1);
      const totalWidth = Math.max(pageWidth, this.element?.scrollWidth || pageWidth);
      const page = paginated ? this._currentPage() + 1 : null;
      const pageCount = paginated ? this._maxPage() + 1 : null;

      let percent;
      if (paginated) {
        // Page-accurate: how far the right edge of the visible slice has moved
        // through the document's column track.
        const read = (this._currentPage() + 1) * pageWidth;
        percent = Math.min(100, Math.max(0, Math.round((read / totalWidth) * 100)));
      } else {
        const totalHeight = Math.max(1, this.element?.scrollHeight || 1);
        const viewportHeight = this.viewport?.clientHeight || 0;
        const maxScroll = Math.max(1, totalHeight - viewportHeight);
        const currentScroll = Math.max(0, this.viewport?.scrollTop || 0);
        percent = Math.min(100, Math.max(0, Math.round((currentScroll / maxScroll) * 100)));
      }

      return {
        percent: Number.isFinite(percent) ? percent : 0,
        chapter: current ? (this.sections.find(s => s.id === current.id)?.label || '') : '',
        page,
        pageCount,
        locationLabel: paginated && pageCount ? `Page ${page} of ${pageCount}` : ''
      };
    }

    getNavigation() {
      return this.sections.map(section => ({
        id: section.id,
        label: section.label,
        target: section.id,
        depth: section.depth || 0
      }));
    }

    getActiveNavId() {
      return this.currentSectionId;
    }

    // ---- search ------------------------------------------------------
    async search(query) {
      const text = (query || '').trim();
      this.query = text;
      this.clearHighlight();
      if (text.length < 2) {
        this.matches = [];
        this.activeMatch = -1;
        this._staleMatches = false;
        return [];
      }
      const needle = text.toLowerCase();
      this.matches = this._collectMatches(needle);
      this.activeMatch = this.matches.length ? 0 : -1;
      this._staleMatches = false;
      if (this.matches.length) this._revealMatch(0);
      return this.matches;
    }

    /**
     * Walks the document once and records every occurrence.
     *
     * The recorded offsets are only valid against the exact text nodes that
     * were walked, which is why the result is treated as something that can go
     * stale rather than as a durable answer.
     */
    _collectMatches(needle) {
      const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT, null);
      const found = [];
      let node = walker.nextNode();
      while (node) {
        const value = node.nodeValue || '';
        const lower = value.toLowerCase();
        let index = lower.indexOf(needle);
        while (index !== -1) {
          found.push({ node, start: index, length: needle.length, text: value.slice(Math.max(0, index - 45), index + needle.length + 45) });
          index = lower.indexOf(needle, index + needle.length);
          if (found.length > 2000) break;
        }
        if (found.length > 2000) break;
        node = walker.nextNode();
      }
      return found;
    }

    /**
     * Highlighting a match rewrites the surrounding text, which invalidates the
     * recorded node references and offsets for every other match. Re-collecting
     * before revealing is what stops a stale offset from throwing or highlighting
     * the wrong place.
     */
    _ensureFreshMatches() {
      if (!this._staleMatches || !this.query) return;
      this.matches = this._collectMatches(this.query.toLowerCase());
      this.activeMatch = this.matches.length ? 0 : -1;
      this._staleMatches = false;
    }

    _revealMatch(index) {
      this._ensureFreshMatches();
      this.clearHighlight();
      this.activeMatch = index;
      const match = this.matches[index];
      if (!match?.node) return;
      const mark = document.createElement('mark');
      mark.className = 'doc-search-hit is-active';
      try {
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.start + match.length);
        range.surroundContents(mark);
        match.element = mark;
      } catch {
        // The text shifted under us. Drop the stale list so the next step
        // re-collects instead of repeatedly failing on the same offsets.
        this._staleMatches = true;
        return;
      }
      // Splitting the matched text node changes the length of the node the
      // other matches refer to, so the remaining offsets need rebuilding.
      this._staleMatches = true;
      this._scrollToElement(mark);
      this.hooks.onSearchActive?.(index, this.matches.length);
    }

    _scrollToElement(node) {
      if (!node || !this.viewport) return;
      const parentRect = this.viewport.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      if (this.flow === 'paginated' && this.capabilities.paginate) {
        const { step } = this._pageMetrics();
        this.viewport.scrollLeft = -Math.max(0, Math.floor(rect.left / step) * step);
      } else {
        this.viewport.scrollBy({ top: (rect.top - parentRect.top) - parentRect.height * 0.3, behavior: 'auto' });
      }
      this._syncActiveSection();
    }

    clearHighlight() {
      this.matches.forEach(match => {
        const el = match.element;
        if (el && el.parentNode) el.replaceWith(document.createTextNode(el.textContent));
        match.element = null;
      });
      this.element?.normalize?.();
      // Every recorded offset now refers to a tree that no longer exists, so the
      // match list has to be rebuilt before it can be used again.
      this._staleMatches = this.matches.length > 0;
    }

    /**
     * Reveals a stored match by index and brings it into view.
     *
     * The reader calls this by name after a search, so the flow formats need
     * the same entry point epub.js provides natively. Without it a search that
     * finds matches throws instead of moving to the first one.
     */
    goToSearchResult(index) {
      if (!this.matches.length) return null;
      const target = Math.min(Math.max(0, Number(index) || 0), this.matches.length - 1);
      this._revealMatch(target);
      return { index: this.activeMatch, total: this.matches.length };
    }

    nextSearchResult() {
      if (!this.matches.length) return null;
      this._revealMatch((this.activeMatch + 1) % this.matches.length);
      return { index: this.activeMatch, total: this.matches.length };
    }

    prevSearchResult() {
      if (!this.matches.length) return null;
      this._revealMatch((this.activeMatch - 1 + this.matches.length) % this.matches.length);
      return { index: this.activeMatch, total: this.matches.length };
    }

    getSearchResultCount() {
      return this.matches.length;
    }

    // ---- subclasses ---------------------------------------------------
    async buildSections() {
      return [];
    }
  }

  function escapeAttr(value) {
    return String(value ?? '').replace(/[&"'<>\s]/g, ch => ({
      '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;', ' ': '-'
    }[ch]));
  }

  return { Adapter, escapeAttr };
})();
