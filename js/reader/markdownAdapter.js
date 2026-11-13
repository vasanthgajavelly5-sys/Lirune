/**
 * Lirune Reader — Markdown Document Adapter
 *
 * Renders Markdown (.md, .markdown) documents into structured flowing sections
 * with automatic Table of Contents extraction from headings (#, ##, ###),
 * YAML frontmatter metadata extraction, syntax-styled code blocks, tables,
 * quotes, and full typography/theme customization.
 */

const MarkdownAdapter = (() => {
  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'md';
      this.formatLabel = 'Markdown';
      this.flow = 'scrolled';
    }

    _mount() {
      super._mount();
      this.element?.classList.add('is-page-document');
      this.viewport?.classList.add('is-page-document');
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const rawText = TextAdapter.decodeText(bytes).replace(/\r\n?/g, '\n');
      if (!rawText.trim()) throw new Error('This Markdown file is empty.');

      const { metadata, bodyText } = parseFrontmatter(rawText);
      if (metadata.title && (!this.record.title || this.record.title === this.record.originalName)) {
        this.record.title = metadata.title;
      }
      if (metadata.author && !this.record.author) {
        this.record.author = metadata.author;
      }

      const sections = parseMarkdownSections(bodyText, this.record.title || 'Document');
      return sections;
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      const desktopApi = window.noveraDesktop || window.liruneDesktop;
      if (this.record.storageId && desktopApi?.readManagedBook) {
        const buffer = await desktopApi.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error('This Markdown file is unavailable.');
    }
  }

  function parseFrontmatter(text) {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith('---')) return { metadata: {}, bodyText: text };

    const endIdx = trimmed.indexOf('\n---', 3);
    if (endIdx === -1) return { metadata: {}, bodyText: text };

    const frontmatterBlock = trimmed.slice(3, endIdx).trim();
    const bodyText = trimmed.slice(endIdx + 4).trimStart();
    const metadata = {};

    frontmatterBlock.split('\n').forEach(line => {
      const colon = line.indexOf(':');
      if (colon > 0) {
        const key = line.slice(0, colon).trim().toLowerCase();
        let val = line.slice(colon + 1).trim();
        val = val.replace(/^["']|["']$/g, '');
        metadata[key] = val;
      }
    });

    return { metadata, bodyText };
  }

  function parseMarkdownSections(text, defaultTitle) {
    const lines = text.split('\n');
    const sections = [];
    let currentSection = null;
    let sectionLines = [];
    let inCodeBlock = false;
    let globalPageNum = 1;

    function commitSection() {
      if (!currentSection && sectionLines.length === 0) return;
      const blocks = renderMarkdownBlocks(sectionLines.join('\n'));
      if (!blocks.length) {
        currentSection = null;
        sectionLines = [];
        return;
      }

      // Chunk blocks into ~2400 char page cards
      const CHARS_PER_PAGE = 2400;
      let pageBlocks = [];
      let pageChars = 0;
      const label = currentSection?.label || (globalPageNum === 1 ? defaultTitle : `Page ${globalPageNum}`);
      const depth = currentSection?.depth ?? 0;
      let isFirstPageOfSection = true;

      const flushCard = () => {
        if (!pageBlocks.length) return;
        const pageNum = globalPageNum++;
        const cardHtml = `<article class="doc-page-card" data-page-number="${pageNum}"><div class="doc-page-content">${pageBlocks.join('\n')}</div><div class="doc-page-footer">Page ${pageNum}</div></article>`;
        sections.push({
          id: `page-${pageNum}`,
          label: isFirstPageOfSection ? label : `${label} (p. ${pageNum})`,
          depth: isFirstPageOfSection ? depth : Math.min(2, depth + 1),
          html: cardHtml
        });
        isFirstPageOfSection = false;
        pageBlocks = [];
        pageChars = 0;
      };

      for (const block of blocks) {
        if (pageChars + block.length > CHARS_PER_PAGE && pageChars > 0) {
          flushCard();
        }
        pageBlocks.push(block);
        pageChars += block.length;
      }
      flushCard();

      currentSection = null;
      sectionLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inCodeBlock = !inCodeBlock;
        sectionLines.push(line);
        continue;
      }

      if (!inCodeBlock) {
        const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const headingText = headingMatch[2].trim();
          commitSection();
          currentSection = {
            id: `sec-${sections.length + 1}`,
            label: headingText,
            depth: Math.min(2, level - 1),
            html: ''
          };
          sectionLines.push(line);
          continue;
        }
      }

      sectionLines.push(line);
    }

    commitSection();
    if (!sections.length) {
      sections.push({
        id: 'page-1',
        label: defaultTitle,
        depth: 0,
        html: `<article class="doc-page-card" data-page-number="1"><div class="doc-page-content">${renderMarkdownToHtml(text)}</div><div class="doc-page-footer">Page 1</div></article>`
      });
    }

    return sections;
  }

  function renderMarkdownToHtml(markdown) {
    return renderMarkdownBlocks(markdown).join('\n');
  }

  function renderMarkdownBlocks(markdown) {
    const lines = markdown.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      // 1. Code blocks
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        const fence = trimmed.slice(0, 3);
        const lang = trimmed.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence)) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing fence
        const codeEscaped = Utils.escapeHTML(codeLines.join('\n'));
        out.push(`<pre class="doc-code-block"><code${lang ? ` class="language-${Utils.escapeAttr(lang)}"` : ''}>${codeEscaped}</code></pre>`);
        continue;
      }

      // 2. Headings
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = renderInlineMarkdown(headingMatch[2].trim());
        out.push(`<h${level}>${text}</h${level}>`);
        i++;
        continue;
      }

      // 3. Horizontal rule
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
        out.push('<hr class="doc-divider" />');
        i++;
        continue;
      }

      // 4. Blockquotes
      if (trimmed.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && (lines[i].trim().startsWith('>') || (lines[i].trim() && !lines[i].trim().startsWith('#')))) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push(`<blockquote class="doc-quote">${renderMarkdownToHtml(quoteLines.join('\n'))}</blockquote>`);
        continue;
      }

      // 5. Unordered lists
      if (/^[-*+]\s+/.test(trimmed)) {
        const listItems = [];
        while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
          listItems.push(`<li>${renderInlineMarkdown(itemText)}</li>`);
          i++;
        }
        out.push(`<ul class="doc-list">${listItems.join('')}</ul>`);
        continue;
      }

      // 6. Ordered lists
      if (/^\d+\.\s+/.test(trimmed)) {
        const listItems = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
          listItems.push(`<li>${renderInlineMarkdown(itemText)}</li>`);
          i++;
        }
        out.push(`<ol class="doc-list">${listItems.join('')}</ol>`);
        continue;
      }

      // 7. Tables
      if (trimmed.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].includes('-')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().includes('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        out.push(renderMarkdownTable(tableLines));
        continue;
      }

      // 8. Normal paragraph
      const paraLines = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('#') &&
             !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('>') &&
             !/^[-*+]\s+/.test(lines[i].trim()) && !/^\d+\.\s+/.test(lines[i].trim())) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length) {
        out.push(`<p>${renderInlineMarkdown(paraLines.join(' '))}</p>`);
      }
    }

    return out;
  }

  function renderInlineMarkdown(text) {
    if (!text) return '';
    let s = text;

    // Inline code
    s = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${Utils.escapeHTML(code)}</code>`);

    // Images: ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const cleanUrl = url.trim();
      const safeSrc = Utils.sanitizeCoverUrl ? Utils.sanitizeCoverUrl(cleanUrl) : cleanUrl;
      return safeSrc ? `<img src="${Utils.escapeAttr(safeSrc)}" alt="${Utils.escapeAttr(alt)}" class="doc-image" />` : '';
    });

    // Links: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      const cleanUrl = url.trim();
      if (/^https?:\/\//i.test(cleanUrl)) {
        return `<a href="${Utils.escapeAttr(cleanUrl)}" target="_blank" rel="noopener noreferrer">${Utils.escapeHTML(label)}</a>`;
      }
      return Utils.escapeHTML(label);
    });

    // Bold + Italic: ***text*** or ___text___
    s = s.replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>');

    // Bold: **text** or __text__
    s = s.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

    // Italic: *text* or _text_
    s = s.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

    // Strikethrough: ~~text~~
    s = s.replace(/~~(.*?)~~/g, '<s>$1</s>');

    return s;
  }

  function renderMarkdownTable(tableLines) {
    if (tableLines.length < 2) return '';
    const splitRow = (row) => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const headers = splitRow(tableLines[0]);
    // tableLines[1] is alignment / separator: |---|---|
    const rows = tableLines.slice(2).map(splitRow);

    let html = '<div class="doc-table-wrapper"><table class="doc-table"><thead><tr>';
    headers.forEach(h => {
      html += `<th>${renderInlineMarkdown(h)}</th>`;
    });
    html += '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>';
      r.forEach(c => {
        html += `<td>${renderInlineMarkdown(c)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function parseMetadata(arrayBuffer, record) {
    try {
      const source = TextAdapter.decodeText(new Uint8Array(arrayBuffer)).replace(/\r\n?/g, '\n');
      const { metadata, bodyText } = parseFrontmatter(source);
      if (metadata.title) record.title = metadata.title;
      if (metadata.author) record.author = metadata.author;
      if (metadata.description) record.description = metadata.description;

      const headings = (bodyText.match(/^#{1,3}\s+.+$/gm) || []).length;
      record.chapterCount = headings || null;
    } catch {
      // Fall back
    }
    return record;
  }

  return { Adapter, parseMetadata, parseFrontmatter, renderMarkdownToHtml };
})();
