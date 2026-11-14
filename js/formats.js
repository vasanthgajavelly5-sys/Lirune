/**
 * Lirune Reader — Book Format Detection
 *
 * Single authority for "what kind of file is this". Uses the file signature
 * (magic bytes) first and the file name extension only as a tie-breaker, so a
 * mis-named file is never silently mis-rendered. Container formats (ZIP based)
 * are refined by inspecting the archive entries.
 */

const BookFormat = (() => {
  const SIGNATURES = [
    { id: 'pdf', mime: 'application/pdf', test: b => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d },
    // RAR 1.5–5.x archive marker: "Rar!\x1a\x07"
    { id: 'cbr', mime: 'application/vnd.comicbook-rar', test: b => b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 && b[4] === 0x1a && b[5] === 0x07 },
    { id: 'zip', mime: 'application/zip', test: b => (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) },
    // OLE2 Compound Document (DOC): 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
    { id: 'doc', mime: 'application/msword', test: b => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1 },
    // CHM / ITSF: 0x49, 0x54, 0x53, 0x46 ("ITSF")
    { id: 'chm', mime: 'application/vnd.ms-htmlhelp', test: b => b[0] === 0x49 && b[1] === 0x54 && b[2] === 0x53 && b[3] === 0x46 },
    // DjVu: AT&T / FORM / DJVU: 0x41, 0x54, 0x26, 0x54 ("AT&T")
    { id: 'djvu', mime: 'image/vnd.djvu', test: b => b[0] === 0x41 && b[1] === 0x54 && b[2] === 0x26 && b[3] === 0x54 }
  ];

  const FORMATS = {
    epub: { id: 'epub', label: 'EPUB', extensions: ['epub'], mime: 'application/epub+zip', layout: 'reflowable', supported: true },
    pdf: { id: 'pdf', label: 'PDF', extensions: ['pdf'], mime: 'application/pdf', layout: 'fixed', supported: true },
    txt: { id: 'txt', label: 'Plain text', extensions: ['txt'], mime: 'text/plain', layout: 'reflowable', supported: true },
    html: { id: 'html', label: 'HTML', extensions: ['html', 'htm'], mime: 'text/html', layout: 'reflowable', supported: true },
    fb2: { id: 'fb2', label: 'FictionBook', extensions: ['fb2'], mime: 'application/x-fictionbook+xml', layout: 'reflowable', supported: true },
    cbz: { id: 'cbz', label: 'Comic archive', extensions: ['cbz'], mime: 'application/vnd.comicbook+zip', layout: 'image', supported: true },
    docx: { id: 'docx', label: 'Word document', extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', layout: 'reflowable', supported: true },
    odt: { id: 'odt', label: 'OpenDocument text', extensions: ['odt'], mime: 'application/vnd.oasis.opendocument.text', layout: 'reflowable', supported: true },
    rtf: { id: 'rtf', label: 'Rich text', extensions: ['rtf'], mime: 'application/rtf', layout: 'reflowable', supported: true },
    md: { id: 'md', label: 'Markdown', extensions: ['md', 'markdown'], mime: 'text/markdown', layout: 'reflowable', supported: true },
    fbz: { id: 'fbz', label: 'FictionBook archive', extensions: ['fbz'], mime: 'application/x-zip-compressed-fb2', layout: 'reflowable', supported: true },
    mobi: { id: 'mobi', label: 'Kindle / MOBI', extensions: ['mobi', 'azw', 'azw3'], mime: 'application/x-mobipocket-ebook', layout: 'reflowable', supported: true },
    cbr: { id: 'cbr', label: 'Comic archive (RAR)', extensions: ['cbr'], mime: 'application/vnd.comicbook-rar', layout: 'image', supported: true },
    doc: { id: 'doc', label: 'Legacy Word document', extensions: ['doc'], mime: 'application/msword', layout: 'reflowable', supported: true },
    chm: { id: 'chm', label: 'Compiled HTML Help', extensions: ['chm'], mime: 'application/vnd.ms-htmlhelp', layout: 'reflowable', supported: true },
    djvu: { id: 'djvu', label: 'DjVu document', extensions: ['djvu', 'djv'], mime: 'image/vnd.djvu', layout: 'reflowable', supported: true }
  };

  const UNKNOWN = { id: 'unknown', label: 'Unknown', extensions: [], mime: 'application/octet-stream', layout: 'unknown', supported: false, reason: 'Unrecognised file type.' };

  const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'jxl'];
  // The formats that are themselves ZIP containers. Only these may be guessed
  // from the file name when an archive has to be read: a file that starts with
  // the ZIP signature is an archive, so if it cannot be opened as one it must
  // not quietly fall back to a plain-text reader just because it was named
  // .txt, which would render the raw bytes as a wall of nonsense.
  const ZIP_CONTAINER_IDS = new Set(['epub', 'cbz', 'docx', 'odt', 'fbz']);

  function extensionOf(fileName) {
    const match = /\.([A-Za-z0-9]+)$/.exec(String(fileName || ''));
    return match ? match[1].toLowerCase() : '';
  }

  function decodeHead(bytes, count = 1024) {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, count));
    } catch {
      return '';
    }
  }

  function looksLikePalmDoc(bytes) {
    // PalmDB header: name field at offset 60 holds "BOOKMOBI" for MOBI/KF8/AZW.
    if (bytes.length > 68) {
      let name = '';
      for (let i = 60; i < 68; i++) name += String.fromCharCode(bytes[i]);
      if (name === 'BOOKMOBI') return true;
    }
    // Uncompressed PalmDOC "TPZ" style container start.
    return bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x60;
  }

  function isProbablyText(head) {
    if (!head) return false;
    const stripped = head.replace(/^[\s﻿]+/, '');
    if (!stripped) return false;
    let control = 0;
    for (let i = 0; i < stripped.length; i++) {
      const code = stripped.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) control++;
    }
    return control / stripped.length < 0.02;
  }

  /**
   * Detect a format from raw bytes plus a file name.
   * @returns {Promise<{id:string,label:string,layout:string,supported:boolean,source:string,reason?:string}>}
   */
  async function detect(fileName, arrayBuffer) {
    const head = arrayBuffer ? new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 8192)) : new Uint8Array(0);
    const ext = extensionOf(fileName);

    for (const signature of SIGNATURES) {
      if (signature.test(head)) {
        if (signature.id === 'zip') return detectZip(fileName, arrayBuffer, ext);
        if (signature.id === 'pdf') return finish('pdf', 'signature');
        if (signature.id === 'cbr') return finish('cbr', 'signature');
        if (signature.id === 'doc') return finish('doc', 'signature');
        if (signature.id === 'chm') return finish('chm', 'signature');
        if (signature.id === 'djvu') return finish('djvu', 'signature');
      }
    }

    if (looksLikePalmDoc(head)) return finish('mobi', 'signature');

    if (head.length) {
      const text = decodeHead(head, 4096).toLowerCase();
      const leading = text.replace(/^[\s﻿]+/, '');
      if (leading.startsWith('{\\rtf')) return finish('rtf', 'signature');
      if (leading.startsWith('<?xml') || leading.startsWith('<fictionbook')) return finish('fb2', 'signature');
      if (leading.startsWith('<!doctype html') || leading.startsWith('<html')) return finish('html', 'signature');
      if (leading.startsWith('<svg')) return finish('html', 'signature');
      if (isProbablyText(text)) {
        // A readable text header: HTML when it carries markup, plain text
        // otherwise. Neither guess is allowed to hide an unreadable file, so
        // the extension is consulted when the header is ambiguous.
        const looksMarkup = /<(p|div|body|head|title|span|table|section|article|h[1-6])\b/i.test(text);
        if (['md', 'markdown'].includes(ext)) return finish('md', 'extension');
        if (looksMarkup && ext !== 'txt') return finish('html', 'signature');
        if (looksMarkup && ext === 'txt') return finish('html', 'signature', 'txt');
        return finish('txt', 'signature');
      }
    }

    // Nothing matched on content: fall back to the extension so the user gets a
    // precise "unsupported" message rather than a generic failure.
    const byExtension = Object.values(FORMATS).find(format => format.extensions.includes(ext));
    if (byExtension) return { ...byExtension, source: 'extension' };
    return { ...UNKNOWN, source: 'none' };
  }

  async function detectZip(fileName, arrayBuffer, ext) {
    if (typeof JSZip === 'undefined' || !arrayBuffer) {
      return { ...FORMATS.epub, source: 'extension', reason: 'Archive inspection unavailable.' };
    }
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const names = Object.keys(zip.files);

      if (zip.file('META-INF/container.xml')) return { ...FORMATS.epub, source: 'signature' };
      if (zip.file('mimetype') && /application\/epub/i.test(await zip.file('mimetype').async('text'))) {
        return { ...FORMATS.epub, source: 'signature' };
      }
      if (zip.file('word/document.xml')) {
        return { ...FORMATS.docx, source: 'signature' };
      }
      if (zip.file('mimetype')) {
        const mime = (await zip.file('mimetype').async('text')).trim();
        if (/^application\/vnd\.oasis\.opendocument\.text/i.test(mime)) {
          return { ...FORMATS.odt, source: 'signature' };
        }
      }
      if (zip.file('content.xml') && (zip.file('META-INF/manifest.xml') || zip.file('styles.xml'))) {
        return { ...FORMATS.odt, source: 'signature' };
      }

      const hasFb2 = names.some(name => !zip.files[name].dir && extensionOf(name) === 'fb2');
      if (hasFb2) {
        return { ...FORMATS.fbz, source: 'signature' };
      }

      const images = names.filter(name => !zip.files[name].dir && IMAGE_EXT.includes(extensionOf(name)));
      if (images.length > 0 && images.length >= names.filter(n => !zip.files[n].dir).length * 0.6) {
        return { ...FORMATS.cbz, source: 'signature' };
      }
      if (names.length === 0) return { ...UNKNOWN, source: 'none', reason: 'The archive is empty.' };
      return { ...UNKNOWN, source: 'none', reason: 'The ZIP archive is not a supported book format.' };
    } catch (error) {
      const byExtension = Object.values(FORMATS).find(format =>
        format.extensions.includes(ext) && ZIP_CONTAINER_IDS.has(format.id));
      if (byExtension) return { ...byExtension, source: 'extension' };
      return { ...UNKNOWN, source: 'none', reason: 'The archive could not be read.' };
    }
  }

  function finish(id, source, forcedId) {
    const format = FORMATS[forcedId || id];
    return format ? { ...format, source } : { ...UNKNOWN, source: 'none' };
  }

  function get(id) {
    return FORMATS[id] || UNKNOWN;
  }

  function isSupported(id) {
    return Boolean(FORMATS[id]?.supported);
  }

  /** File-dialog filter list for the import dialog. */
  function importExtensions() {
    return Object.values(FORMATS).filter(f => f.supported).flatMap(f => f.extensions);
  }

  function describe(id) {
    const format = FORMATS[id];
    if (!format) return UNKNOWN.label;
    return format.supported ? format.label : `${format.label} (unsupported)`;
  }

  return {
    FORMATS,
    detect,
    get,
    isSupported,
    importExtensions,
    describe,
    extensionOf,
    isProbablyText,
    IMAGE_EXT
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BookFormat;
}

