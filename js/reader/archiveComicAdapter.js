/**
 * Lirune Reader - TAR/7z/RAR comic reader backed by libarchive-wasm.
 * Only image entries are rendered; archive scripts and non-image payloads are ignored.
 */
const ArchiveComicAdapter = (() => {
  const IMAGE_MIMES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic',
    heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff'
  };

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = record.format;
      this.formatLabel = record.format === 'cb7' ? '7-Zip comic archive' : record.format === 'cbr' ? 'RAR comic archive' : 'TAR comic archive';
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const archiveModule = await import('../../node_modules/libarchive-wasm/dist/index.js');
      const wasm = await archiveModule.libarchiveWasm();
      const reader = new archiveModule.ArchiveReader(wasm, new Int8Array(bytes));
      try {
        const pages = [];
        for (const entry of reader.entries()) {
          const name = entry.getPathname();
          const ext = name.split('.').pop()?.toLowerCase() || '';
          const mime = IMAGE_MIMES[ext];
          if (!mime || entry.getSize() > 100 * 1024 * 1024) continue;
          const data = entry.readData();
          pages.push({
            id: `page-${pages.length + 1}`,
            label: name,
            depth: 0,
            html: `<figure class="comic-page"><figcaption>${escapeHtml(name)}</figcaption><img src="data:${mime};base64,${toBase64(data)}" alt="${escapeHtml(name)}"></figure>`
          });
          if (pages.length >= 2000) break;
        }
        if (!pages.length) throw new Error(`This ${this.formatLabel} contains no readable image pages.`);
        return pages;
      } finally {
        reader.free();
      }
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      const desktopApi = window.noveraDesktop || window.liruneDesktop;
      if (this.record.storageId && desktopApi?.readManagedBook) {
        return new Uint8Array(await desktopApi.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize));
      }
      throw new Error(`This ${this.formatLabel} is unavailable.`);
    }
  }

  function toBase64(bytes) {
    let value = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) value += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(value);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { Adapter };
})();
