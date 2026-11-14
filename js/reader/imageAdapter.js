/**
 * Lirune Reader - Safe local raster-image adapter.
 *
 * Images are rendered as a blob URL so the renderer does not duplicate large
 * files as base64 strings. The adapter owns the URL and revokes it on close.
 */
const ImageAdapter = (() => {
  const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
  const MIME_TYPES = {
    jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml',
    tiff: 'image/tiff', bmp: 'image/bmp', gif: 'image/gif',
    avif: 'image/avif', heic: 'image/heic', heif: 'image/heif'
  };

  async function normalizeUnsupportedRaster(bytes, ext) {
    const canvas = document.createElement('canvas');
    let width;
    let height;
    let rgba;
    if (ext === 'tiff' || ext === 'tif') {
      const module = await import('../../node_modules/utif/UTIF.js').catch(() => null);
      const UTIF = (typeof window !== 'undefined' && window.UTIF) || module?.default || module;
      const ifd = UTIF.decode(bytes.buffer)[0];
      if (!ifd) throw new Error('This TIFF contains no readable image.');
      UTIF.decodeImage(bytes.buffer, ifd);
      width = ifd.width;
      height = ifd.height;
      rgba = UTIF.toRGBA8(ifd);
    } else {
      const module = await import('../../node_modules/libheif-js/libheif-wasm/libheif-bundle.mjs');
      const decoder = new (module.default || module).HeifDecoder();
      const images = decoder.decode(bytes);
      if (!images?.length) throw new Error(`This ${ext.toUpperCase()} image contains no readable frames.`);
      const image = images[0];
      width = image.get_width();
      height = image.get_height();
      const imageData = new ImageData(width, height);
      await new Promise((resolve, reject) => image.display(imageData, result => result ? resolve(result) : reject(new Error(`Could not decode ${ext.toUpperCase()} image.`))));
      rgba = imageData.data;
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 100_000_000) {
      throw new Error('Image dimensions exceed the safe rendering limit.');
    }
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  class Adapter {
    constructor(host, record) {
      this.host = host;
      this.record = record || {};
      this.capabilities = { typography: false, search: false, toc: false, annotations: false, zoom: true, paginate: false };
      this.zoom = 100;
      this.url = null;
      this.image = null;
      this.viewport = null;
      this.hooks = {};
    }

    async open(hooks) {
      this.hooks = hooks || {};
      const bytes = this.record.fileData
        ? new Uint8Array(this.record.fileData)
        : await this._loadManagedBytes();
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('This image is empty or exceeds the safe 128 MB limit.');
      const ext = BookFormat.extensionOf(this.record.originalName || this.record.title || '') || 'png';
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const source = ['tiff', 'tif', 'avif', 'heic', 'heif'].includes(ext)
        ? await normalizeUnsupportedRaster(bytes, ext)
        : new Blob([bytes], { type: mime });
      if (!source) throw new Error(`Could not decode ${ext.toUpperCase()} image.`);
      this.url = URL.createObjectURL(source);
      this.host.innerHTML = '';
      this.host.className = 'image-host';
      this.viewport = document.createElement('div');
      this.viewport.className = 'image-viewport';
      this.image = document.createElement('img');
      this.image.alt = this.record.title || 'Image';
      this.image.draggable = false;
      this.image.src = this.url;
      this.image.addEventListener('load', () => this.hooks.onPageChange?.());
      this.viewport.appendChild(this.image);
      this.host.appendChild(this.viewport);
      this.setZoom(100);
      return true;
    }

    async _loadManagedBytes() {
      const api = window.noveraDesktop || window.liruneDesktop;
      if (!this.record.storageId || !api?.readManagedBook) throw new Error('This image file is unavailable.');
      const buffer = await api.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
      return new Uint8Array(buffer);
    }

    setZoom(value) {
      this.zoom = Math.max(25, Math.min(400, Number(value) || 100));
      if (this.image) this.image.style.transform = `scale(${this.zoom / 100})`;
    }

    getProgress() { return { percent: 100, chapter: 'Image', page: 1, pageCount: 1, locationLabel: 'Image' }; }
    getLocation() { return 'page:1'; }
    next() { return false; }
    prev() { return false; }
    applySettings() {}
    destroy() {
      this.image?.remove();
      this.viewport?.remove();
      if (this.url) URL.revokeObjectURL(this.url);
      this.image = null;
      this.viewport = null;
      this.url = null;
    }
  }

  return { Adapter };
})();
