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
    { id: 'png', mime: 'image/png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
    { id: 'jpg', mime: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { id: 'gif', mime: 'image/gif', test: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && (b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) },
    { id: 'bmp', mime: 'image/bmp', test: b => b[0] === 0x42 && b[1] === 0x4d },
    { id: 'webp', mime: 'image/webp', test: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
    { id: 'tiff', mime: 'image/tiff', test: b => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a) },
    { id: 'pdf', mime: 'application/pdf', test: b => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d },
    // RAR 1.5–5.x archive marker: "Rar!\x1a\x07"
    { id: 'cbr', mime: 'application/vnd.comicbook-rar', test: b => b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 && b[4] === 0x1a && b[5] === 0x07 },
    { id: 'cb7', mime: 'application/x-7z-compressed', test: b => b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c },
    { id: 'zip', mime: 'application/zip', test: b => (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) },
    // OLE2 Compound Document (DOC): 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
    { id: 'doc', mime: 'application/msword', test: b => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1 },
    // CHM / ITSF: 0x49, 0x54, 0x53, 0x46 ("ITSF")
    { id: 'chm', mime: 'application/vnd.ms-htmlhelp', test: b => b[0] === 0x49 && b[1] === 0x54 && b[2] === 0x53 && b[3] === 0x46 },
    // DjVu: AT&T / FORM / DJVU: 0x41, 0x54, 0x26, 0x54 ("AT&T")
    { id: 'djvu', mime: 'image/vnd.djvu', test: b => b[0] === 0x41 && b[1] === 0x54 && b[2] === 0x26 && b[3] === 0x54 }
  ];

  const FORMATS = {
    jpg: { id: 'jpg', label: 'JPEG image', extensions: ['jpg', 'jpeg'], mime: 'image/jpeg', layout: 'fixed', supported: true },
    png: { id: 'png', label: 'PNG image', extensions: ['png'], mime: 'image/png', layout: 'fixed', supported: true },
    webp: { id: 'webp', label: 'WebP image', extensions: ['webp'], mime: 'image/webp', layout: 'fixed', supported: true },
    avif: { id: 'avif', label: 'AVIF image', extensions: ['avif'], mime: 'image/avif', layout: 'fixed', supported: true },
    tiff: { id: 'tiff', label: 'TIFF image', extensions: ['tiff', 'tif'], mime: 'image/tiff', layout: 'fixed', supported: true },
    heic: { id: 'heic', label: 'HEIC image', extensions: ['heic'], mime: 'image/heic', layout: 'fixed', supported: true },
    heif: { id: 'heif', label: 'HEIF image', extensions: ['heif'], mime: 'image/heif', layout: 'fixed', supported: true },
    bmp: { id: 'bmp', label: 'Bitmap image', extensions: ['bmp'], mime: 'image/bmp', layout: 'fixed', supported: true },
    gif: { id: 'gif', label: 'GIF image', extensions: ['gif'], mime: 'image/gif', layout: 'fixed', supported: true },
    svg: { id: 'svg', label: 'SVG image', extensions: ['svg'], mime: 'image/svg+xml', layout: 'fixed', supported: true },
    csv: { id: 'csv', label: 'CSV spreadsheet', extensions: ['csv'], mime: 'text/csv', layout: 'reflowable', supported: true },
    tsv: { id: 'tsv', label: 'TSV spreadsheet', extensions: ['tsv'], mime: 'text/tab-separated-values', layout: 'reflowable', supported: true },
    xlsx: { id: 'xlsx', label: 'Excel workbook', extensions: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', layout: 'reflowable', supported: true },
    xlsm: { id: 'xlsm', label: 'Macro-enabled Excel workbook', extensions: ['xlsm'], mime: 'application/vnd.ms-excel.sheet.macroEnabled.12', layout: 'reflowable', supported: true },
    xltx: { id: 'xltx', label: 'Excel template', extensions: ['xltx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template', layout: 'reflowable', supported: true },
    xltm: { id: 'xltm', label: 'Macro-enabled Excel template', extensions: ['xltm'], mime: 'application/vnd.ms-excel.template.macroEnabled.12', layout: 'reflowable', supported: true },
    ods: { id: 'ods', label: 'OpenDocument spreadsheet', extensions: ['ods'], mime: 'application/vnd.oasis.opendocument.spreadsheet', layout: 'reflowable', supported: true },
    pptx: { id: 'pptx', label: 'PowerPoint presentation', extensions: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', layout: 'fixed', supported: true },
    pptm: { id: 'pptm', label: 'Macro-enabled PowerPoint presentation', extensions: ['pptm'], mime: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12', layout: 'fixed', supported: true },
    ppsx: { id: 'ppsx', label: 'PowerPoint slide show', extensions: ['ppsx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow', layout: 'fixed', supported: true },
    ppsm: { id: 'ppsm', label: 'Macro-enabled PowerPoint slide show', extensions: ['ppsm'], mime: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12', layout: 'fixed', supported: true },
    potx: { id: 'potx', label: 'PowerPoint template', extensions: ['potx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.template', layout: 'fixed', supported: true },
    potm: { id: 'potm', label: 'Macro-enabled PowerPoint template', extensions: ['potm'], mime: 'application/vnd.ms-powerpoint.template.macroEnabled.12', layout: 'fixed', supported: true },
    odp: { id: 'odp', label: 'OpenDocument presentation', extensions: ['odp'], mime: 'application/vnd.oasis.opendocument.presentation', layout: 'fixed', supported: true },
    mht: { id: 'mht', label: 'Web archive', extensions: ['mht', 'mhtml'], mime: 'multipart/related', layout: 'reflowable', supported: true },
    mhtml: { id: 'mhtml', label: 'Web archive', extensions: ['mhtml', 'mht'], mime: 'multipart/related', layout: 'reflowable', supported: true },
    json: { id: 'json', label: 'JSON document', extensions: ['json'], mime: 'application/json', layout: 'reflowable', supported: true },
    xml: { id: 'xml', label: 'XML document', extensions: ['xml'], mime: 'application/xml', layout: 'reflowable', supported: true },
    yaml: { id: 'yaml', label: 'YAML document', extensions: ['yaml', 'yml'], mime: 'application/yaml', layout: 'reflowable', supported: true },
    yml: { id: 'yml', label: 'YAML document', extensions: ['yml', 'yaml'], mime: 'application/yaml', layout: 'reflowable', supported: true },
    log: { id: 'log', label: 'Log file', extensions: ['log'], mime: 'text/plain', layout: 'reflowable', supported: true },
    eml: { id: 'eml', label: 'Email message', extensions: ['eml'], mime: 'message/rfc822', layout: 'reflowable', supported: true },
    pst: { id: 'pst', label: 'Outlook personal archive', extensions: ['pst'], mime: 'application/vnd.ms-outlook-pst', layout: 'reflowable', supported: true },
    ost: { id: 'ost', label: 'Outlook offline archive', extensions: ['ost'], mime: 'application/vnd.ms-outlook-ost', layout: 'reflowable', supported: true },
    mbox: { id: 'mbox', label: 'Mailbox archive', extensions: ['mbox'], mime: 'application/mbox', layout: 'reflowable', supported: true },
    vcf: { id: 'vcf', label: 'vCard contact', extensions: ['vcf'], mime: 'text/vcard', layout: 'reflowable', supported: true },
    ics: { id: 'ics', label: 'iCalendar event', extensions: ['ics'], mime: 'text/calendar', layout: 'reflowable', supported: true },
    pages: { id: 'pages', label: 'Apple Pages document', extensions: ['pages'], mime: 'application/vnd.apple.pages', layout: 'reflowable', supported: true },
    numbers: { id: 'numbers', label: 'Apple Numbers document', extensions: ['numbers'], mime: 'application/vnd.apple.numbers', layout: 'reflowable', supported: true },
    key: { id: 'key', label: 'Apple Keynote presentation', extensions: ['key'], mime: 'application/vnd.apple.keynote', layout: 'fixed', supported: true },
    xps: { id: 'xps', label: 'XPS document', extensions: ['xps', 'oxps'], mime: 'application/oxps', layout: 'fixed', supported: true },
    oxps: { id: 'oxps', label: 'XPS document', extensions: ['oxps', 'xps'], mime: 'application/oxps', layout: 'fixed', supported: true },
    epub: { id: 'epub', label: 'EPUB', extensions: ['epub'], mime: 'application/epub+zip', layout: 'reflowable', supported: true },
    kepub: { id: 'kepub', label: 'Kobo EPUB', extensions: ['kepub'], mime: 'application/epub+zip', layout: 'reflowable', supported: true },
    pdf: { id: 'pdf', label: 'PDF', extensions: ['pdf'], mime: 'application/pdf', layout: 'fixed', supported: true },
    txt: { id: 'txt', label: 'Plain text', extensions: ['txt'], mime: 'text/plain', layout: 'reflowable', supported: true },
    html: { id: 'html', label: 'HTML', extensions: ['html', 'htm'], mime: 'text/html', layout: 'reflowable', supported: true },
    fb2: { id: 'fb2', label: 'FictionBook', extensions: ['fb2'], mime: 'application/x-fictionbook+xml', layout: 'reflowable', supported: true },
    cbz: { id: 'cbz', label: 'Comic archive', extensions: ['cbz'], mime: 'application/vnd.comicbook+zip', layout: 'image', supported: true },
    docx: { id: 'docx', label: 'Word document', extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', layout: 'reflowable', supported: true },
    xls: { id: 'xls', label: 'Excel workbook', extensions: ['xls'], mime: 'application/vnd.ms-excel', layout: 'reflowable', supported: true },
    ppt: { id: 'ppt', label: 'PowerPoint presentation', extensions: ['ppt'], mime: 'application/vnd.ms-powerpoint', layout: 'reflowable', supported: true },
    pps: { id: 'pps', label: 'PowerPoint slide show', extensions: ['pps'], mime: 'application/vnd.ms-powerpoint', layout: 'reflowable', supported: true },
    wps: { id: 'wps', label: 'WPS document', extensions: ['wps'], mime: 'application/vnd.ms-works', layout: 'reflowable', supported: true },
    odt: { id: 'odt', label: 'OpenDocument text', extensions: ['odt'], mime: 'application/vnd.oasis.opendocument.text', layout: 'reflowable', supported: true },
    rtf: { id: 'rtf', label: 'Rich text', extensions: ['rtf'], mime: 'application/rtf', layout: 'reflowable', supported: true },
    md: { id: 'md', label: 'Markdown', extensions: ['md', 'markdown'], mime: 'text/markdown', layout: 'reflowable', supported: true },
    fbz: { id: 'fbz', label: 'FictionBook archive', extensions: ['fbz'], mime: 'application/x-zip-compressed-fb2', layout: 'reflowable', supported: true },
    mobi: { id: 'mobi', label: 'Kindle / MOBI', extensions: ['mobi', 'azw', 'azw3'], mime: 'application/x-mobipocket-ebook', layout: 'reflowable', supported: true },
    azw: { id: 'azw', label: 'Kindle AZW', extensions: ['azw'], mime: 'application/vnd.amazon.ebook', layout: 'reflowable', supported: true },
    azw3: { id: 'azw3', label: 'Kindle AZW3', extensions: ['azw3'], mime: 'application/x-mobi8-ebook', layout: 'reflowable', supported: true },
    cbr: { id: 'cbr', label: 'Comic archive (RAR)', extensions: ['cbr'], mime: 'application/vnd.comicbook-rar', layout: 'image', supported: true },
    rar: { id: 'rar', label: 'RAR archive', extensions: ['rar'], mime: 'application/x-rar-compressed', layout: 'image', supported: true },
    zip: { id: 'zip', label: 'ZIP archive', extensions: ['zip'], mime: 'application/zip', layout: 'image', supported: true },
    cbt: { id: 'cbt', label: 'Comic archive (TAR)', extensions: ['cbt', 'tar'], mime: 'application/x-tar', layout: 'image', supported: true },
    cb7: { id: 'cb7', label: 'Comic archive (7-Zip)', extensions: ['cb7', '7z'], mime: 'application/x-7z-compressed', layout: 'image', supported: true },
    doc: { id: 'doc', label: 'Legacy Word document', extensions: ['doc'], mime: 'application/msword', layout: 'reflowable', supported: true },
    msg: { id: 'msg', label: 'Outlook message', extensions: ['msg'], mime: 'application/vnd.ms-outlook', layout: 'reflowable', supported: true },
    xlsb: { id: 'xlsb', label: 'Binary Excel workbook', extensions: ['xlsb'], mime: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12', layout: 'reflowable', supported: true },
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
  const ZIP_CONTAINER_IDS = new Set([
    'epub', 'kepub', 'cbz', 'docx', 'odt', 'fbz',
    'xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'ods',
    'pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm', 'odp',
    'xps', 'oxps', 'pages', 'numbers', 'key'
  ]);

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

  function detectOle2Subtype(bytes, ext = '') {
    if (!bytes || bytes.length < 8) return null;
    let sample = '';
    const limit = Math.min(bytes.length, 8192);
    for (let i = 0; i < limit; i++) sample += String.fromCharCode(bytes[i]);
    if (sample.includes('P\x00o\x00w\x00e\x00r\x00P\x00o\x00i\x00n\x00t\x00') || sample.includes('P\x00P\x004\x000\x00') || (sample.includes('C\x00u\x00r\x00r\x00e\x00n\x00t\x00 \x00U\x00s\x00e\x00r\x00') && ['ppt', 'pps'].includes(ext))) return 'ppt';
    if (sample.includes('_\x00_\x00s\x00u\x00b\x00s\x00t\x00g\x00') || sample.includes('_\x00_\x00a\x00t\x00t\x00a\x00c\x00h\x00')) return 'msg';
    if (sample.includes('W\x00P\x00S\x00 \x00O\x00f\x00f\x00i\x00c\x00e\x00')) return 'wps';
    if (sample.includes('W\x00o\x00r\x00d\x00D\x00o\x00c\x00u\x00m\x00e\x00n\x00t\x00')) return 'doc';
    if (sample.includes('W\x00o\x00r\x00k\x00b\x00o\x00o\x00k\x00') || (sample.includes('B\x00o\x00o\x00k\x00') && ext === 'xls')) return 'xls';
    return null;
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
        if (['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff'].includes(signature.id)) return finish(signature.id, 'signature');
        if (signature.id === 'pdf') return finish('pdf', 'signature');
        if (signature.id === 'cbr') return finish('cbr', 'signature');
        if (signature.id === 'cb7') return finish('cb7', 'signature');
        if (signature.id === 'doc') {
          const detected = detectOle2Subtype(head, ext);
          if (detected) {
            if (['ppt', 'pps'].includes(ext) && detected === 'ppt') return finish(ext, 'signature');
            return finish(detected, 'signature');
          }
          if (['xls', 'ppt', 'pps', 'wps', 'msg'].includes(ext)) return finish(ext, 'signature');
          return finish('doc', 'signature');
        }
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
      if (leading.startsWith('<svg')) return finish('svg', 'signature');
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

      if (zip.file('META-INF/container.xml')) {
        return /\.kepub\.epub$/i.test(fileName) ? { ...FORMATS.kepub, source: 'signature' } : { ...FORMATS.epub, source: 'signature' };
      }
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
        if (ext === 'ods') return finish('ods', 'signature');
        if (ext === 'odp') return finish('odp', 'signature');
        return { ...FORMATS.odt, source: 'signature' };
      }
      if (zip.file('xl/workbook.xml')) {
        const xlFormat = ['xlsm', 'xlsb', 'xltx', 'xltm'].includes(ext) ? ext : 'xlsx';
        return finish(xlFormat, 'signature');
      }
      if (zip.file('ppt/presentation.xml')) {
        const pptFormat = ['pptm', 'ppsx', 'ppsm', 'potx', 'potm'].includes(ext) ? ext : 'pptx';
        return finish(pptFormat, 'signature');
      }
      if (zip.file('FixedDocSeq.fdseq') || names.some(name => /\.fpage$/i.test(name))) {
        return finish(ext === 'oxps' ? 'oxps' : 'xps', 'signature');
      }
      if (zip.file('QuickLook/Preview.jpg') || zip.file('QuickLook/Thumbnail.jpg') || zip.file('Index/Document.iwa')) {
        const iworkFormat = ['numbers', 'key', 'pages'].includes(ext) ? ext : 'pages';
        return finish(iworkFormat, 'signature');
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
        format.extensions.includes(ext) && (ZIP_CONTAINER_IDS.has(format.id) || format.id === 'zip'));
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

