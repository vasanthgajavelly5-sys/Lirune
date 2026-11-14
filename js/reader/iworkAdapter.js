/**
 * Lirune Reader - safe Apple iWork package reader.
 * iWork packages expose QuickLook previews rather than a stable public
 * document model; show that embedded preview and never execute package data.
 */
const IWorkAdapter = (() => {
  const escape = value => Utils.escapeHTML(String(value ?? ''));

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      if (bytes.length > 64 * 1024 * 1024) throw new Error('This iWork package exceeds the safe 64 MB limit.');
      const zip = await JSZip.loadAsync(bytes);
      if (typeof DocumentAdapter !== 'undefined' && DocumentAdapter.validateZipBudget) {
        DocumentAdapter.validateZipBudget(zip);
      }
      const ext = this.record.format || 'pages';
      const candidates = ['QuickLook/Preview.jpg', 'QuickLook/Thumbnail.jpg', 'preview.jpg', 'QuickLook/Preview.png', 'preview.png'];
      let preview = '';
      for (const name of candidates) {
        const file = zip.file(name);
        if (!file) continue;
        const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
        preview = `data:${mime};base64,${await file.async('base64')}`;
        break;
      }
      const title = (this.record.title || this.record.originalName || 'Apple iWork Document').replace(/\.[^/.]+$/, '');
      const html = `<article class="iwork-document"><h2>${escape(title)}</h2><p>Apple ${escape(ext.toUpperCase())} document</p>${preview ? `<img src="${preview}" alt="Document preview" style="max-width:100%;height:auto">` : '<p>No embedded QuickLook preview is available.</p>'}</article>`;
      return [{ id: 'iwork-1', label: title, depth: 0, html }];
    }
  }

  return { Adapter };
})();
