/**
 * Lirune Reader — Kindle & MOBI Reader Adapter
 *
 * Pure JavaScript PalmDatabase / Mobipocket / PalmDOC e-book parser.
 * Supports:
 *   - .mobi, .azw, .azw3 files
 *   - PalmDOC LZ77 decompression
 *   - EXTH extended metadata (Author, Cover, Title, Description)
 *   - Embedded image extraction (JPEG, PNG, GIF)
 *   - Automatic chapter splitting from headings & <mbp:pagebreak>
 *   - Both paginated and scrolled reading modes via DocumentAdapter
 */

const MobiAdapter = (() => {
  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'mobi';
      this.formatLabel = 'Kindle / MOBI';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const parsed = parseMobi(bytes, this.record.title || 'Kindle Book');

      if (parsed.metadata.title && (!this.record.title || this.record.title === this.record.originalName)) {
        this.record.title = parsed.metadata.title;
      }
      if (parsed.metadata.author && !this.record.author) {
        this.record.author = parsed.metadata.author;
      }
      if (parsed.metadata.coverDataUrl && !this.record.coverDataUrl) {
        this.record.coverDataUrl = parsed.metadata.coverDataUrl;
      }

      return parsed.sections;
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      const desktopApi = window.noveraDesktop || window.liruneDesktop;
      if (this.record.storageId && desktopApi?.readManagedBook) {
        const buffer = await desktopApi.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error('This Kindle / MOBI file is unavailable.');
    }
  }

  function parseMobi(bytes, defaultTitle) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 78) throw new Error('Not a valid PalmDOC / MOBI file: header too short');

    // 1. Palm Database Header
    const numRecords = view.getUint16(76);
    if (numRecords === 0 || bytes.length < 78 + numRecords * 8) {
      throw new Error('Invalid MOBI record header table');
    }

    const recordOffsets = [];
    for (let i = 0; i < numRecords; i++) {
      recordOffsets.push(view.getUint32(78 + i * 8));
    }
    recordOffsets.push(bytes.length);

    // 2. Record 0 Header (PalmDOC / MOBI)
    const rec0Offset = recordOffsets[0];
    const rec0Length = recordOffsets[1] - rec0Offset;
    const rec0 = new DataView(bytes.buffer, bytes.byteOffset + rec0Offset, rec0Length);

    const compression = rec0.getUint16(0);
    if (compression !== 1 && compression !== 2) {
      if (compression === 17480) {
        throw new Error('HUFF/CDIC compressed MOBI files are not supported. Please convert with Calibre.');
      }
      throw new Error(`Unsupported MOBI compression type (${compression})`);
    }

    const textLength = rec0.getUint32(4);
    const textRecordCount = rec0.getUint16(8);
    const encryptionType = rec0.getUint16(12);

    if (encryptionType !== 0) {
      throw new Error('This Kindle book is protected by Amazon DRM and cannot be opened.');
    }

    // 3. Extract Metadata from Record 0 & EXTH Header
    let title = defaultTitle;
    let author = '';
    let description = '';
    let coverRecordIndex = null;
    let firstImageIndex = null;

    // Check for 'MOBI' magic identifier at offset 16
    let isMobi = false;
    if (rec0Length >= 24) {
      const mobiMagic = String.fromCharCode(rec0.getUint8(16), rec0.getUint8(17), rec0.getUint8(18), rec0.getUint8(19));
      isMobi = (mobiMagic === 'MOBI');
    }

    if (isMobi && rec0Length >= 132) {
      const headerLength = rec0.getUint32(20);
      const fullNameOffset = rec0.getUint32(84);
      const fullNameLength = rec0.getUint32(88);

      if (fullNameLength > 0 && rec0Offset + fullNameOffset + fullNameLength <= bytes.length) {
        const titleBytes = bytes.subarray(rec0Offset + fullNameOffset, rec0Offset + fullNameOffset + fullNameLength);
        title = new TextDecoder('utf-8', { fatal: false }).decode(titleBytes).trim() || defaultTitle;
      }

      firstImageIndex = rec0.getUint32(108);
      const exthFlags = rec0.getUint32(128);

      // EXTH header check
      if ((exthFlags & 0x40) !== 0 && rec0Length >= 16 + headerLength + 12) {
        const exthOffset = 16 + headerLength;
        const exthMagic = String.fromCharCode(rec0.getUint8(exthOffset), rec0.getUint8(exthOffset + 1), rec0.getUint8(exthOffset + 2), rec0.getUint8(exthOffset + 3));
        if (exthMagic === 'EXTH') {
          const exthRecordCount = rec0.getUint32(exthOffset + 8);
          let curr = exthOffset + 12;

          for (let e = 0; e < exthRecordCount && curr + 8 <= rec0Length; e++) {
            const tag = rec0.getUint32(curr);
            const len = rec0.getUint32(curr + 4);
            if (len < 8 || curr + len > rec0Length) break;
            const dataBytes = bytes.subarray(rec0Offset + curr + 8, rec0Offset + curr + len);

            if (tag === 100) { // Author
              author = new TextDecoder('utf-8', { fatal: false }).decode(dataBytes).trim();
            } else if (tag === 103) { // Description
              description = new TextDecoder('utf-8', { fatal: false }).decode(dataBytes).trim();
            } else if (tag === 201) { // Cover offset
              if (dataBytes.length === 4) {
                const coverOffsetNum = new DataView(dataBytes.buffer, dataBytes.byteOffset, 4).getUint32(0);
                coverRecordIndex = (firstImageIndex || 0) + coverOffsetNum;
              }
            } else if (tag === 503 && !title) { // Updated title
              title = new TextDecoder('utf-8', { fatal: false }).decode(dataBytes).trim();
            }
            curr += len;
          }
        }
      }
    }

    // 4. Extract Images into Data URLs
    const imageMap = new Map();
    let coverDataUrl = null;

    if (firstImageIndex !== null && firstImageIndex < numRecords) {
      for (let imgIdx = firstImageIndex; imgIdx < numRecords; imgIdx++) {
        const start = recordOffsets[imgIdx];
        const end = recordOffsets[imgIdx + 1];
        if (end <= start || end > bytes.length) continue;

        const imgBytes = bytes.subarray(start, end);
        let mime = null;

        // Magic bytes
        if (imgBytes.length >= 3 && imgBytes[0] === 0xFF && imgBytes[1] === 0xD8 && imgBytes[2] === 0xFF) {
          mime = 'image/jpeg';
        } else if (imgBytes.length >= 4 && imgBytes[0] === 0x89 && imgBytes[1] === 0x50 && imgBytes[2] === 0x4E && imgBytes[3] === 0x47) {
          mime = 'image/png';
        } else if (imgBytes.length >= 4 && imgBytes[0] === 0x47 && imgBytes[1] === 0x49 && imgBytes[2] === 0x46) {
          mime = 'image/gif';
        } else if (imgBytes.length >= 2 && imgBytes[0] === 0x42 && imgBytes[1] === 0x4D) {
          mime = 'image/bmp';
        }

        if (mime) {
          const b64 = uint8ArrayToBase64(imgBytes);
          const dataUrl = `data:${mime};base64,${b64}`;
          const recRelIdx = imgIdx - firstImageIndex + 1;
          imageMap.set(recRelIdx, dataUrl);
          imageMap.set(String(recRelIdx), dataUrl);
          imageMap.set(imgIdx, dataUrl);

          if (imgIdx === coverRecordIndex || (!coverDataUrl && imgIdx === firstImageIndex)) {
            coverDataUrl = dataUrl;
          }
        }
      }
    }

    // 5. Decompress Text Records (1 .. textRecordCount)
    const decompressedChunks = [];
    const count = Math.min(textRecordCount, numRecords - 1);

    for (let r = 1; r <= count; r++) {
      const start = recordOffsets[r];
      const end = recordOffsets[r + 1];
      if (end <= start || end > bytes.length) continue;

      const recBytes = bytes.subarray(start, end);
      if (compression === 1) {
        decompressedChunks.push(recBytes);
      } else if (compression === 2) {
        decompressedChunks.push(decompressPalmDocLz77(recBytes));
      }
    }

    // Concatenate decompressed chunks
    const totalDecompressedLength = decompressedChunks.reduce((acc, c) => acc + c.length, 0);
    const combinedBytes = new Uint8Array(totalDecompressedLength);
    let offset = 0;
    for (const chunk of decompressedChunks) {
      combinedBytes.set(chunk, offset);
      offset += chunk.length;
    }

    let fullHtml = new TextDecoder('utf-8', { fatal: false }).decode(combinedBytes);
    if (!fullHtml.trim()) {
      throw new Error('This MOBI file has no readable text content.');
    }

    // 6. Replace Image recindex attributes with Data URLs
    fullHtml = fullHtml.replace(/<img([^>]+)>/gi, (match, attrs) => {
      const recMatch = attrs.match(/recindex=["']?(\d+)["']?/i);
      if (recMatch) {
        const idx = Number(recMatch[1]);
        const dataUrl = imageMap.get(idx) || imageMap.get(idx - 1);
        if (dataUrl) {
          const cleanAttrs = attrs.replace(/src=["'][^"']*["']/gi, '').replace(/recindex=["']?\d+["']?/gi, '');
          return `<img src="${Utils.escapeAttr(dataUrl)}" class="doc-image"${cleanAttrs}>`;
        }
      }
      return match;
    });

    // 7. Parse Chapters / Sections
    const sections = splitMobiHtmlIntoSections(fullHtml, title);

    return {
      metadata: {
        title,
        author,
        description,
        coverDataUrl,
        chapterCount: sections.length
      },
      sections
    };
  }

  function decompressPalmDocLz77(input) {
    const out = [];
    let i = 0;
    const len = input.length;

    while (i < len) {
      const b = input[i++];
      if (b === 0) {
        out.push(0);
      } else if (b <= 8) {
        for (let j = 0; j < b && i < len; j++) {
          out.push(input[i++]);
        }
      } else if (b <= 0x7F) {
        out.push(b);
      } else if (b <= 0xBF) {
        if (i >= len) break;
        const b2 = input[i++];
        const distance = (((b << 8) | b2) >> 3) & 0x07FF;
        const copyLen = (b2 & 0x07) + 3;
        const start = out.length - distance;
        for (let j = 0; j < copyLen; j++) {
          out.push(out[start + j]);
        }
      } else {
        out.push(0x20);
        out.push(b ^ 0x80);
      }
    }

    return new Uint8Array(out);
  }

  function splitMobiHtmlIntoSections(html, fallbackTitle) {
    if (typeof DOMParser === 'undefined') {
      const headingMatches = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || [];
      const count = Math.max(1, headingMatches.length);
      return Array.from({ length: count }, (_, i) => ({
        id: `sec-${i + 1}`,
        label: i === 0 ? fallbackTitle : `Section ${i + 1}`,
        depth: 0,
        html: i === 0 ? html : ''
      }));
    }
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const body = parsed.body;
    if (!body || !body.textContent.trim()) {
      return [{ id: 'sec-1', label: fallbackTitle, depth: 0, html }];
    }

    // Split along <mbp:pagebreak>, <pagebreak>, or top-level headings
    const rawChildren = [...body.children];
    const sections = [];
    let current = null;

    const pushSection = (label, depth = 0) => {
      current = {
        id: `sec-${sections.length + 1}`,
        label: label || `Section ${sections.length + 1}`,
        depth: Math.min(2, depth),
        chunks: []
      };
      sections.push(current);
    };

    for (const node of rawChildren) {
      const tag = node.tagName.toLowerCase();
      const isBreak = tag.includes('pagebreak') || tag === 'hr';
      const heading = node.matches('h1,h2,h3') ? node : node.querySelector?.('h1,h2,h3');

      if (heading) {
        const text = heading.textContent.trim();
        const level = Number(heading.tagName.slice(1)) || 1;
        pushSection(text, level - 1);
        current.chunks.push(node.outerHTML);
        continue;
      }

      if (isBreak && current && current.chunks.length > 0) {
        pushSection(`Section ${sections.length + 1}`);
        continue;
      }

      if (!current) pushSection(fallbackTitle);
      current.chunks.push(node.outerHTML);
    }

    if (!sections.length) {
      sections.push({
        id: 'sec-1',
        label: fallbackTitle,
        depth: 0,
        html: body.innerHTML
      });
    }

    return sections.map(s => ({
      ...s,
      html: s.chunks ? s.chunks.join('\n') : s.html
    }));
  }

  function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
      const sub = bytes.subarray(i, Math.min(i + chunk, len));
      binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
  }

  function parseMetadata(arrayBuffer, record) {
    try {
      const parsed = parseMobi(new Uint8Array(arrayBuffer), record.title || 'Kindle Book');
      if (parsed.metadata.title) record.title = parsed.metadata.title;
      if (parsed.metadata.author) record.author = parsed.metadata.author;
      if (parsed.metadata.description) record.description = parsed.metadata.description;
      if (parsed.metadata.coverDataUrl) record.coverDataUrl = parsed.metadata.coverDataUrl;
      record.chapterCount = parsed.metadata.chapterCount || null;
    } catch (e) {
      console.warn('MOBI metadata extraction failed:', e);
    }
    return record;
  }

  return { Adapter, parseMobi, parseMetadata, decompressPalmDocLz77 };
})();
