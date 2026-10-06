/**
 * Lirune Reader — EPUB Reader Adapter
 *
 * Presents the existing epub.js engine (js/epubLoader.js) through the shared
 * reader contract so the reader UI never has to know which engine is mounted.
 * epub.js remains the single source of truth for EPUB navigation: every target
 * handed to `goTo` is a real EPUB CFI produced by the engine.
 */

const EpubReaderAdapter = (() => {
  class Adapter {
    constructor(host, record) {
      this.host = host;
      this.record = record || {};
      this.format = 'epub';
      this.formatLabel = 'EPUB';
      this.capabilities = {
        typography: true,
        search: true,
        toc: true,
        annotations: true,
        zoom: true,
        paginate: true
      };
    }

    async open() {
      const target = this.record.currentCfi || null;
      const ok = await EpubLoader.openBook(this.record, target);
      if (!ok) throw new Error('This EPUB could not be opened.');
      await this._alignWithSavedProgress();
      return true;
    }

  /**
   * epub.js resolves a saved CFI against a freshly paginated rendition, which
   * can land a few pages away from where the reader stopped, and page counts
   * change with the window size. Once the real generated locations are
   * available the stored percentage is used instead, so progress survives a
   * close/reopen cycle exactly and lands in the same place every time.
   */
  async _alignWithSavedProgress() {
    const recordId = this.record.id;
    const savedPercent = Number(this.record.progressPercent);
    if (!Number.isFinite(savedPercent) || savedPercent <= 0 || savedPercent >= 100) return;
    try {
      await EpubLoader.waitForLocations();
      if (this.record.id !== recordId || !EpubLoader.isLoaded()) return;
      const cfi = EpubLoader.cfiFromPercentage(savedPercent);
      if (cfi) {
        EpubLoader.setInitialCfi?.(cfi);
        await EpubLoader.goTo(cfi, true);
      }
    } catch (error) {
      console.warn('Could not realign reading position:', error);
    }
  }


    destroy() {
      EpubLoader.destroy();
    }

    getCapabilities() { return { ...this.capabilities }; }
    getFormat() { return 'epub'; }
    getProgress() { return EpubLoader.getProgress(); }
    getLocation() { return EpubLoader.getLocation(); }
    getNavigation() { return EpubLoader.getNavigation(); }
    getActiveNavId() { return EpubLoader.getActiveNavId(); }
    getZoom() { return EpubLoader.getZoom(); }
    setZoom(zoom) { return EpubLoader.setZoom(zoom); }
    applySettings(settings) { return EpubLoader.applySettings(settings); }
    async next() { EpubLoader.next(); return true; }
    async prev() { EpubLoader.prev(); return true; }
    goTo(target) { EpubLoader.goTo(target); return true; }
    scrollBy(dx, dy) { EpubLoader.scrollBy(dx, dy); return true; }
    async scroll(delta) { EpubLoader.scrollBy(0, delta); return true; }
    async search(query) { return EpubLoader.searchBook(query); }
    async goToSearchResult(index) { return EpubLoader.goToSearchResult(index); }
    getSearchResultCount() { return EpubLoader.getSearchResultCount(); }
    isLoaded() { return EpubLoader.isLoaded(); }
  }

  return { Adapter };
})();
