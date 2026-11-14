/**
 * Lirune Reader - XPS/OpenXPS fixed-page text adapter.
 * Reads FixedPage glyph text from the ZIP package and ignores active content.
 */
const XpsAdapter = (() => {
  const escape = value => Utils.escapeHTML(String(value ?? ''));

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const zip = await JSZip.loadAsync(bytes);
      if (typeof DocumentAdapter !== 'undefined' && DocumentAdapter.validateZipBudget) {
        DocumentAdapter.validateZipBudget(zip);
      }
      const pages = Object.keys(zip.files).filter(name => /\.fpage$/i.test(name)).sort();
      if (!pages.length) throw new Error('Invalid XPS document: no FixedPage entries found.');
      return Promise.all(pages.map(async (name, index) => {
        const file = zip.file(name);
        const xml = file ? await file.async('text') : '';
        const text = [...xml.matchAll(/<Glyphs\b[^>]*\bUnicodeString="([^"]*)"/gi)]
          .map(match => match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join(' ');
        return {
          id: `page-${index + 1}`,
          label: `Page ${index + 1}`,
          depth: 0,
          html: `<article class="xps-page"><h3>Page ${index + 1} of ${pages.length}</h3><p>${escape(text)}</p></article>`
        };
      }));
    }
  }

  return { Adapter };
})();
