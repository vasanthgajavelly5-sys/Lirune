/**
 * Lirune Reader — Concrete Flowing-Document Adapters
 *
 * TXT  : plain UTF-8 text, rendered as a single flowing document.
 * HTML : a local HTML file, sanitised and inlined so it can never navigate the
 *        shell or reach the network.
 * FB2  : FictionBook 2 XML, mapped onto the same document model.
 */

const TextAdapter = (() => {
  // A plain-text file is one continuous run of lines. Emitting the whole file
  // as a single <p> joined by <br> builds one enormous inline formatting
  // context, and the layout engine has to re-break that whole run across every
  // paginated column each time the typography changes. Above this many lines a
  // block is split per line instead, so the document is a list of ordinary
  // paragraph boxes rather than one giant run of text.
  const MAX_LINES_IN_ONE_PARAGRAPH = 400;

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'txt';
      this.formatLabel = 'Plain text';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      // Windows line endings are normalised first. A CRLF paragraph break is
      // \r\n\r\n, whose two newlines are not adjacent, so splitting on blank
      // lines before normalising leaves the entire file as one block.
      const text = decodeText(bytes).replace(/\r\n?/g, '\n');
      if (!text.trim()) throw new Error('This text file is empty.');

      let blocks = text
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean);

      // Blank-line separation alone leaves a whole novel in one block when the
      // file separates its lines with single newlines, which is the usual shape
      // of a Project Gutenberg text. That block is split per line so the
      // rendered document is a list of paragraphs rather than one huge run.
      if (blocks.length <= 2) {
        const lines = blocks.join('\n').split(/\n/);
        if (lines.length > MAX_LINES_IN_ONE_PARAGRAPH) {
          blocks = lines.map(line => line.trim()).filter(Boolean);
        }
      }

      const html = blocks
        .map(block => `<p>${Utils.escapeHTML(block).replace(/\n/g, '<br>')}</p>`)
        .join('');
      return [{ id: 'text', label: this.record.title || 'Document', depth: 0, html }];
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
      let isXmlError = false;
      let parser;
      try {
        parser = new DOMParser({
          errorHandler: {
            warning: () => {},
            error: () => { isXmlError = true; },
            fatalError: () => { isXmlError = true; }
          }
        });
      } catch {
        parser = new DOMParser();
      }
      const parsed = parser.parseFromString(source, 'application/xml');
      const errorTag = parsed?.querySelector ? parsed.querySelector('parsererror') : (parsed?.getElementsByTagName ? parsed.getElementsByTagName('parsererror')[0] : null);
      if (isXmlError || errorTag) throw new Error('This FictionBook file is not valid XML.');

      const doc = parsed;
      const fictionBook = doc.documentElement;
      if (!fictionBook || fictionBook.nodeName.toLowerCase() !== 'fictionbook') {
        throw new Error('This file is not a FictionBook document.');
      }

      function getElementChildren(el) {
        if (!el) return [];
        if (el.children) return Array.from(el.children);
        const res = [];
        const nodes = el.childNodes || [];
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].nodeType === 1) res.push(nodes[i]);
        }
        return res;
      }

      // Inline validated raster <binary> image payloads so embedded covers render offline.
      const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
      const images = new Map();
      const binaryNodes = doc.querySelectorAll ? doc.querySelectorAll('binary') : doc.getElementsByTagName('binary');
      for (let i = 0; i < (binaryNodes?.length || 0); i++) {
        const binary = binaryNodes[i];
        const id = binary.getAttribute('id');
        if (!id) continue;
        const contentType = (binary.getAttribute('content-type') || 'image/jpeg').toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) continue;
        const rawBase64 = (binary.textContent || '').replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/=]+$/.test(rawBase64)) continue;
        const dataUri = `data:${contentType};base64,${rawBase64}`;
        images.set(id, dataUri);
        images.set(`#${id}`, dataUri);
      }
      this.embeddedImages = images;

      const body = doc.querySelector ? doc.querySelector('body') : (doc.getElementsByTagName ? doc.getElementsByTagName('body')[0] : null);
      if (!body) throw new Error('This FictionBook file has no body.');

      function convertFb2Node(node, depth = 0) {
        if (!node) return '';
        if (node.nodeType === 3) { // Text node
          return Utils.escapeHTML(node.nodeValue);
        }
        if (node.nodeType !== 1) return '';

        const tag = (node.localName || node.nodeName.split(':').pop() || '').toLowerCase();

        // Drop dangerous, active, or unsupported elements
        if (['script', 'svg', 'math', 'foreignobject', 'binary', 'style', 'iframe', 'object', 'embed', 'applet', 'link', 'meta'].includes(tag)) {
          return '';
        }

        const convertChildren = (n) => {
          let out = '';
          const children = n.childNodes || [];
          for (let i = 0; i < children.length; i++) {
            out += convertFb2Node(children[i], depth);
          }
          return out;
        };

        switch (tag) {
          case 'section':
            return `<div class="doc-section-content">${convertChildren(node)}</div>`;
          case 'title': {
            const hLevel = Math.min(6, Math.max(2, depth + 1));
            return `<h${hLevel}>${convertChildren(node)}</h${hLevel}>`;
          }
          case 'subtitle':
            return `<h4>${convertChildren(node)}</h4>`;
          case 'p':
            return `<p>${convertChildren(node)}</p>`;
          case 'v':
            return `<p class="doc-verse">${convertChildren(node)}</p>`;
          case 'stanza':
            return `<div class="doc-stanza">${convertChildren(node)}</div>`;
          case 'poem':
            return `<blockquote class="doc-poem">${convertChildren(node)}</blockquote>`;
          case 'cite':
            return `<blockquote class="doc-cite">${convertChildren(node)}</blockquote>`;
          case 'epigraph':
            return `<blockquote class="doc-epigraph">${convertChildren(node)}</blockquote>`;
          case 'annotation':
            return `<div class="doc-annotation">${convertChildren(node)}</div>`;
          case 'text-author':
            return `<p class="doc-author">${convertChildren(node)}</p>`;
          case 'empty-line':
            return `<p class="empty-line">&nbsp;</p>`;
          case 'strong':
          case 'b':
            return `<strong>${convertChildren(node)}</strong>`;
          case 'emphasis':
          case 'i':
            return `<em>${convertChildren(node)}</em>`;
          case 'code':
            return `<code>${convertChildren(node)}</code>`;
          case 'strikethrough':
            return `<s>${convertChildren(node)}</s>`;
          case 'sub':
            return `<sub>${convertChildren(node)}</sub>`;
          case 'sup':
            return `<sup>${convertChildren(node)}</sup>`;
          case 'table':
            return `<div class="doc-table-wrapper"><table class="doc-table">${convertChildren(node)}</table></div>`;
          case 'tr':
            return `<tr>${convertChildren(node)}</tr>`;
          case 'th':
            return `<th>${convertChildren(node)}</th>`;
          case 'td':
            return `<td>${convertChildren(node)}</td>`;
          case 'image': {
            const href = node.getAttribute('href') || node.getAttribute('l:href') || node.getAttribute('xlink:href') || '';
            const dataUri = images.get(href) || images.get(`#${href.replace(/^#/, '')}`);
            if (dataUri) {
              return `<img src="${dataUri}" alt="Document Image" class="doc-image" />`;
            }
            return '';
          }
          case 'a': {
            const href = node.getAttribute('href') || node.getAttribute('l:href') || node.getAttribute('xlink:href') || '';
            const inner = convertChildren(node);
            if (!inner) return '';
            if (href.startsWith('#')) {
              return `<a href="${Utils.escapeAttr(href)}">${inner}</a>`;
            }
            try {
              const url = new URL(href);
              if (url.protocol === 'http:' || url.protocol === 'https:') {
                return `<a href="${Utils.escapeAttr(url.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
              }
            } catch {}
            return inner;
          }
          default:
            return convertChildren(node);
        }
      }

      const sections = [];
      const walk = (parent, depth) => {
        const parentChildren = getElementChildren(parent);
        for (const node of parentChildren) {
          const name = (node.localName || node.nodeName.split(':').pop() || '').toLowerCase();
          if (name === 'title') continue;
          if (name === 'section') {
            const nodeChildren = getElementChildren(node);
            const titleNode = node.querySelector ? node.querySelector(':scope > title') : nodeChildren.find(c => (c.localName || c.nodeName).toLowerCase() === 'title');
            const titleText = titleNode?.textContent?.trim();
            let sectionHtml = '';
            for (const child of nodeChildren) {
              const childName = (child.localName || child.nodeName.split(':').pop() || '').toLowerCase();
              if (childName === 'section' || childName === 'title') continue;
              sectionHtml += convertFb2Node(child, depth);
            }
            sections.push({
              id: `sec-${sections.length + 1}`,
              label: titleText || `Section ${sections.length + 1}`,
              depth: Math.min(2, depth),
              html: sectionHtml
            });
            const nested = nodeChildren.filter(child => {
              const cName = (child.localName || child.nodeName.split(':').pop() || '').toLowerCase();
              return cName === 'section';
            });
            if (nested.length) walk(node, depth + 1);
          } else if (node.nodeType === 1) {
            const existing = sections[sections.length - 1];
            if (existing) {
              existing.html += convertFb2Node(node, depth);
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
          html: convertFb2Node(body, 0)
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
