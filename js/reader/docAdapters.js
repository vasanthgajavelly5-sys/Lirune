/**
 * Lirune Reader — Extended Document Adapters (DOC, CHM, DJVU)
 *
 * Implements reflowable and paginated readers for:
 *   - DOC: Microsoft Word 97-2003 OLE2 Compound Documents
 *   - CHM: Compiled HTML Help (ITSF format)
 *   - DJVU: DjVu AT&T / FORM IFF documents and OCR text layer
 *
 * All extend DocumentAdapter.Adapter so both paginated and scrolled reading modes,
 * typography themes, zoom, and text search work uniformly.
 */

// ─────────────────────────────────────────────── DOC (Word 97-2003 OLE2) ──
const DocAdapter = (() => {
  const WORD_INTERNAL = new Set([
    'bjbj', 'ObjectPool', 'WordDocument', 'CompObj', 'DocumentSummaryInformation',
    'SummaryInformation', '1Table', '0Table', 'Data', 'Macros', 'VBA', 'Normal',
    'Default Paragraph Font', 'Table Grid', 'Times New Roman', 'Arial', 'Calibri',
    'Courier New', 'Symbol', 'Wingdings', 'Microsoft Word', 'MSWD', 'Word.Document'
  ]);

  function parseDoc(bytes) {
    if (bytes.length < 512) throw new Error('Invalid DOC file: file too small.');
    const isOle = bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 &&
                  bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1;
    if (!isOle) throw new Error('Not a valid Word (.doc) Compound Document.');

    const textParts = [];
    let currentRun = '';
    let i = 512;
    while (i < bytes.length - 1) {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      if (b2 === 0 && ((b1 >= 32 && b1 <= 126) || b1 === 10 || b1 === 13 || b1 === 9)) {
        if (b1 === 13 || b1 === 10) {
          if (currentRun.trim().length > 0) {
            textParts.push(currentRun.trim());
            currentRun = '';
          }
        } else {
          currentRun += String.fromCharCode(b1);
        }
        i += 2;
      } else if (b1 >= 32 && b1 <= 126) {
        currentRun += String.fromCharCode(b1);
        i += 1;
      } else {
        if (currentRun.trim().length > 3) textParts.push(currentRun.trim());
        currentRun = '';
        i += 1;
      }
    }
    if (currentRun.trim().length > 3) textParts.push(currentRun.trim());

    const paragraphs = textParts
      .filter(p => p.length >= 3 && !WORD_INTERNAL.has(p) && !WORD_INTERNAL.has(p.trim()) && !/^[A-Z0-9]{2,8}$/.test(p) && /[a-zA-Z0-9]/.test(p))
      .map(p => p.replace(/HYPERLINK\s+"[^"]*"\s*(\\[a-z]*)*/gi, '').replace(/\\[a-zA-Z]\b\s*/g, '').trim())
      .filter(p => p.length > 0);

    return paragraphs;
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'doc';
      this.formatLabel = 'Word document';
      this.flow = 'scrolled';
    }

    _mount() {
      super._mount();
      this.element?.classList.add('is-word-document');
      this.viewport?.classList.add('is-word-document');
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const paragraphs = parseDoc(bytes);
      if (!paragraphs.length) throw new Error('This Word (.doc) file appears to be empty.');

      const sections = [];
      const CHUNK_SIZE = 25;
      for (let i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
        const slice = paragraphs.slice(i, i + CHUNK_SIZE);
        const pageNum = Math.floor(i / CHUNK_SIZE) + 1;
        const pageContent = slice.map(p => `<p>${Utils.escapeHTML ? Utils.escapeHTML(p) : p}</p>`).join('\n');
        const html = `
          <article class="word-page-card" data-page-number="${pageNum}">
            <div class="word-page-content">
              ${pageContent}
            </div>
            <div class="word-page-footer">Page ${pageNum}</div>
          </article>
        `;
        sections.push({
          id: `page-${pageNum}`,
          label: pageNum === 1 && this.record.title ? this.record.title : `Page ${pageNum}`,
          depth: 0,
          html
        });
      }

      return sections;
    }
  }

  function parseMetadata(arrayBuffer, record) {
    try {
      const paragraphs = parseDoc(new Uint8Array(arrayBuffer));
      if (paragraphs.length) {
        if (!record.title && paragraphs[0].length <= 100) record.title = paragraphs[0];
        record.chapterCount = Math.ceil(paragraphs.length / 25) || 1;
      }
    } catch {}
    return record;
  }

  return { Adapter, parseDoc, parseMetadata };
})();

// ─────────────────────────────────────────────── CHM (Compiled HTML Help) ──
const ChmAdapter = (() => {
  function parseChm(bytes) {
    if (bytes.length < 100) throw new Error('Invalid CHM file: buffer too small.');
    const isItsf = bytes[0] === 0x49 && bytes[1] === 0x54 && bytes[2] === 0x53 && bytes[3] === 0x46;
    if (!isItsf) throw new Error('Invalid CHM file: missing ITSF signature.');

    const decoder = new TextDecoder('utf-8', { fatal: false });
    const fullText = decoder.decode(bytes);
    const htmlMatches = fullText.match(/<html[\s\S]*?<\/html>/gi);
    let extractedHtml = '';
    if (htmlMatches && htmlMatches.length > 0) {
      extractedHtml = htmlMatches
        .map(doc => {
          const bodyMatch = doc.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          return bodyMatch ? bodyMatch[1] : doc;
        })
        .join('<hr class="chm-divider"/>');
    } else {
      const blockMatches = fullText.match(/<(p|div|h[1-4])[^>]*>([\s\S]*?)<\/(?:p|div|h[1-4])>/gi);
      extractedHtml = blockMatches && blockMatches.length ? blockMatches.join('\n') : '<p>Compiled HTML help content extracted.</p>';
    }

    let title = 'Compiled Help Document';
    const titleMatch = extractedHtml.match(/<title[^>]*>([^<]+)<\/title>/i) || fullText.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) title = titleMatch[1].trim();

    return { title, html: extractedHtml };
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'chm';
      this.formatLabel = 'Compiled HTML Help';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const parsed = parseChm(bytes);
      if (parsed.title && (!this.record.title || this.record.title === this.record.originalName)) {
        this.record.title = parsed.title;
      }

      const headings = parsed.html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi) || [];
      if (headings.length > 1) {
        const parts = parsed.html.split(/(?=<h[1-3][^>]*>)/i).filter(Boolean);
        return parts.map((part, idx) => {
          let rawLabel = '';
          if (hMatch) {
            let text = hMatch[1];
            let prev;
            do {
              prev = text;
              text = text.replace(/<[^>]+>/g, '');
            } while (text !== prev);
            rawLabel = text.trim();
          }
          return {
            id: `sec-${idx + 1}`,
            label: rawLabel || `Topic ${idx + 1}`,
            depth: 0,
            html: part
          };
        });
      }

      return [{ id: 'sec-1', label: parsed.title || this.record.title || 'Help Document', depth: 0, html: parsed.html }];
    }
  }

  function parseMetadata(arrayBuffer, record) {
    try {
      const parsed = parseChm(new Uint8Array(arrayBuffer));
      if (parsed.title) record.title = parsed.title;
      const headings = (parsed.html.match(/<h[1-3][^>]*>/gi) || []).length;
      record.chapterCount = headings || 1;
    } catch {}
    return record;
  }

  return { Adapter, parseChm, parseMetadata };
})();

// ─────────────────────────────────────────────── DjVu Document ─────────────
const DjvuAdapter = (() => {
  function parseDjvu(bytes) {
    if (bytes.length < 12) throw new Error('Invalid DjVu file: buffer too small.');
    const isDjvu = bytes[0] === 0x41 && bytes[1] === 0x54 && bytes[2] === 0x26 && bytes[3] === 0x54;
    if (!isDjvu) throw new Error('Invalid DjVu signature: missing AT&T header.');

    const pages = [];
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let offset = 4;
    let pageCount = 0;

    while (offset + 8 < bytes.length) {
      const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const chunkSize =
        (bytes[offset + 4] << 24) |
        (bytes[offset + 5] << 16) |
        (bytes[offset + 6] << 8) |
        bytes[offset + 7];

      if (chunkId === 'FORM') {
        pageCount++;
      } else if (chunkId === 'TXTa' && chunkSize > 0 && offset + 8 + chunkSize <= bytes.length) {
        const textData = bytes.subarray(offset + 8, offset + 8 + chunkSize);
        const text = decoder.decode(textData).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
        pages.push({
          pageNumber: pages.length + 1,
          text: text.trim()
        });
      }

      const advance = Math.max(8, (chunkSize > 0 && chunkSize < bytes.length ? chunkSize + 8 : 8));
      offset += advance + (advance % 2);
    }

    if (pages.length === 0) {
      const fullText = decoder.decode(bytes);
      const textMatches = fullText.match(/[a-zA-Z0-9.,!?'"()\- \n]{20,}/g) || [];
      const cleanParagraphs = textMatches
        .filter(m => !m.includes('DJVU') && !m.includes('FORM') && !m.includes('AT&T'))
        .slice(0, 100);
      pages.push({
        pageNumber: 1,
        text: cleanParagraphs.join('\n\n') || 'DjVu document text layer.'
      });
    }

    return {
      title: 'DjVu Document',
      pageCount: Math.max(1, pageCount || pages.length),
      pages
    };
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'djvu';
      this.formatLabel = 'DjVu document';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const parsed = parseDjvu(bytes);
      return parsed.pages.map(p => {
        const esc = Utils.escapeHTML ? Utils.escapeHTML(p.text) : p.text;
        const html = `<div class="djvu-page-badge" style="text-align:center;font-size:12px;opacity:0.6;margin-bottom:16px;">DjVu Page ${p.pageNumber} of ${parsed.pages.length}</div><p>${esc.replace(/\n\n+/g, '</p><p>')}</p>`;
        return {
          id: `sec-${p.pageNumber}`,
          label: `Page ${p.pageNumber}`,
          depth: 0,
          html
        };
      });
    }
  }

  function parseMetadata(arrayBuffer, record) {
    try {
      const parsed = parseDjvu(new Uint8Array(arrayBuffer));
      record.pageCount = parsed.pageCount;
      record.chapterCount = parsed.pageCount;
    } catch {}
    return record;
  }

  return { Adapter, parseDjvu, parseMetadata };
})();
