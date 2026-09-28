/**
 * Lirune Reader — Concrete Flowing-Document Adapters
 *
 * TXT  : plain UTF-8 text, rendered as a single flowing document.
 * HTML : a local HTML file, sanitised and inlined so it can never navigate the
 *        shell or reach the network.
 * FB2  : FictionBook 2 XML, mapped onto the same document model.
 */

const TextAdapter = (() => {
  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'txt';
      this.formatLabel = 'Plain text';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const text = decodeText(bytes);
      if (!text.trim()) throw new Error('This text file is empty.');
      const paragraphs = text
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean)
        .map(block => `<p>${Utils.escapeHTML(block).replace(/\n/g, '<br>')}</p>`)
        .join('');
      return [{ id: 'text', label: this.record.title || 'Document', depth: 0, html: paragraphs }];
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      if (this.record.storageId && window.noveraDesktop?.readManagedBook) {
        const buffer = await window.noveraDesktop.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error('This text file is unavailable.');
    }
  }

  function decodeText(bytes) {
    if (!bytes || !bytes.length) return '';
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  return { Adapter, decodeText };
})();

const HtmlAdapter = (() => {
  const BLOCKED_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET', 'FRAME', 'FRAMESET', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE']);

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'html';
      this.formatLabel = 'HTML document';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const source = TextAdapter.decodeText(bytes);
      const parsed = new DOMParser().parseFromString(source, 'text/html');
      this._sanitize(parsed);

      const title = parsed.querySelector('title')?.textContent?.trim() || this.record.title || 'HTML document';
      const body = parsed.body;
      if (!body || !body.textContent.trim()) throw new Error('This HTML file has no readable content.');

      // Split on the document's own top-level headings so navigation mirrors
      // the source file rather than an invented chapter list.
      const blocks = [...body.children].filter(node => !BLOCKED_TAGS.has(node.tagName));
      const sections = [];
      let current = null;
      const push = (label) => {
        current = { id: `sec-${sections.length + 1}`, label, depth: 0, chunks: [] };
        sections.push(current);
      };

      let autoIndex = 1;
      for (const node of blocks) {
        const heading = node.matches('h1,h2,h3,h4,h5,h6')
          ? node
          : node.querySelector?.('h1,h2,h3,h4,h5,h6');
        if (heading === node) {
          push(node.textContent.trim() || `Section ${autoIndex++}`);
          current.depth = Math.min(2, Number(node.tagName.slice(1)) - 1);
          continue;
        }
        if (!current) push(title);
        if (heading) {
          push(heading.textContent.trim() || `Section ${autoIndex++}`);
          current.depth = Math.min(2, Number(heading.tagName.slice(1)) - 1);
        }
        current.chunks.push(node.outerHTML);
      }
      if (!current) push(title);
      return sections.map(section => ({ ...section, html: section.chunks.join('\n') }));
    }

    _sanitize(parsed) {
      const kill = node => {
        while (node.firstChild) node.removeChild(node.firstChild);
        node.remove?.();
      };
      parsed.querySelectorAll('*').forEach(node => {
        if (BLOCKED_TAGS.has(node.tagName)) {
          kill(node);
          return;
        }
        [...node.attributes].forEach(attr => {
          const name = attr.name.toLowerCase();
          const value = attr.value || '';
          if (name.startsWith('on')) node.removeAttribute(attr.name);
          else if (name === 'style' && /url\s*\(|expression\s*\(|javascript:/i.test(value)) node.removeAttribute(attr.name);
          else if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'srcset' || name === 'poster') &&
                   /^\s*(https?:|javascript:|data:text\/html|file:)/i.test(value) && !/^\s*data:image\//i.test(value)) {
            // Keep local resources, drop anything that would leave the machine.
            node.removeAttribute(attr.name);
          }
        });
        if (node.tagName === 'A') {
          node.removeAttribute('target');
          node.addEventListener?.('click', event => event.preventDefault());
        }
      });
      // Inline the document's own stylesheet rules so the local file keeps its
      // typography without pulling in a remote stylesheet.
      const styleRules = [...parsed.querySelectorAll('style')].map(node => node.textContent).join('\n');
      if (styleRules) {
        const style = parsed.createElement('style');
        style.textContent = styleRules;
        parsed.head.appendChild(style);
      }
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      if (this.record.storageId && window.noveraDesktop?.readManagedBook) {
        const buffer = await window.noveraDesktop.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error('This HTML file is unavailable.');
    }
  }

  return { Adapter };
})();

const Fb2Adapter = (() => {
  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'fb2';
      this.formatLabel = 'FictionBook';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const source = TextAdapter.decodeText(bytes);
      const parser = new DOMParser();
      const error = parser.parseFromString(source, 'application/xml')?.querySelector('parsererror');
      if (error) throw new Error('This FictionBook file is not valid XML.');

      const doc = parser.parseFromString(source, 'application/xml');
      const fictionBook = doc.documentElement;
      if (!fictionBook || fictionBook.nodeName.toLowerCase() !== 'fictionbook') {
        throw new Error('This file is not a FictionBook document.');
      }

      // Inline <binary> image payloads so embedded covers render offline.
      const images = new Map();
      [...doc.querySelectorAll('binary')].forEach(binary => {
        const id = binary.getAttribute('id');
        if (!id) return;
        const contentType = binary.getAttribute('content-type') || 'image/jpeg';
        images.set(id, `data:${contentType};base64,${(binary.textContent || '').replace(/\s+/g, '')}`);
      });
      this.embeddedImages = images;

      const body = doc.querySelector('body');
      if (!body) throw new Error('This FictionBook file has no body.');

      const sections = [];
      const walk = (parent, depth) => {
        for (const node of parent.children) {
          const name = node.nodeName.toLowerCase();
          if (name === 'title') continue;
          if (name === 'section') {
            const clone = node.cloneNode(true);
            clone.querySelectorAll('title').forEach(t => t.remove());
            clone.querySelectorAll('binary').forEach(b => b.remove());
            clone.querySelectorAll('image').forEach(image => {
              const href = image.getAttribute('href');
              if (href && images.has(`#${href}`)) image.setAttribute('src', images.get(`#${href}`));
            });
            const title = node.querySelector(':scope > title')?.textContent?.trim();
            sections.push({
              id: `sec-${sections.length + 1}`,
              label: title || `Section ${sections.length + 1}`,
              depth: Math.min(2, depth),
              html: new XMLSerializer().serializeToString(clone)
            });
            const nested = [...node.children].filter(child => child.nodeName.toLowerCase() === 'section');
            if (nested.length) walk(node, depth + 1);
          } else if (node.nodeType === 1) {
            const existing = sections[sections.length - 1];
            if (existing) {
              const clone = node.cloneNode(true);
              existing.html += new XMLSerializer().serializeToString(clone);
            }
          }
        }
      };
      walk(body, 0);
      if (!sections.length) {
        sections.push({
          id: 'sec-1',
          label: this.record.title || 'Document',
          depth: 0,
          html: new XMLSerializer().serializeToString(body)
        });
      }
      return sections;
    }

    extractMetadata(bytes) {
      try {
        const doc = new DOMParser().parseFromString(TextAdapter.decodeText(bytes), 'application/xml');
        const info = doc.querySelector('title-info');
        if (!info) return {};
        const get = (tag) => info.querySelector(`:scope > ${tag}`)?.textContent?.trim() || '';
        return {
          title: get('title'),
          author: get('author'),
          description: get('annotation') ? doc.querySelector('annotation')?.textContent?.trim() : '',
          coverId: doc.querySelector('coverpage image')?.getAttribute('href') || ''
        };
      } catch {
        return {};
      }
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      if (this.record.storageId && window.noveraDesktop?.readManagedBook) {
        const buffer = await window.noveraDesktop.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error('This FictionBook file is unavailable.');
    }
  }

  return { Adapter };
})();
