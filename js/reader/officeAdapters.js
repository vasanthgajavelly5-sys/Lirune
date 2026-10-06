/**
 * Lirune Reader - Office Document Adapters (DOCX, ODT, RTF)
 * All extend DocumentAdapter.Adapter so scroll/paginate/search work out of the box.
 */

// ─────────────────────────────────────────────── DOCX ──────────
const DocxAdapter = (() => {
  function headingLevel(styleId) {
    const m = /Heading(\d)/i.exec(styleId || '');
    return m ? Math.min(6, Number(m[1])) : 0;
  }

  function runsText(para) {
    const parts = [];
    for (const node of para.querySelectorAll('r')) {
      const rPr = node.querySelector('rPr');
      const isBold = !!rPr && (rPr.querySelector('b') && !rPr.querySelector('b[w\\:val="0"]') && !rPr.querySelector('b[val="0"]'));
      const isItalic = !!rPr && (rPr.querySelector('i') && !rPr.querySelector('i[w\\:val="0"]') && !rPr.querySelector('i[val="0"]'));
      const text = [...node.querySelectorAll('t')].map(t => t.textContent).join('');
      if (!text) continue;
      const esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      parts.push(isBold && isItalic ? `<em><strong>${esc}</strong></em>` : isBold ? `<strong>${esc}</strong>` : isItalic ? `<em>${esc}</em>` : esc);
    }
    return parts.join('');
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'docx';
      this.formatLabel = 'Word document';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      if (typeof JSZip === 'undefined') throw new Error('JSZip is required to open DOCX files.');
      const zip = await JSZip.loadAsync(bytes);
      const xmlFile = zip.file('word/document.xml');
      if (!xmlFile) throw new Error('This DOCX file is missing word/document.xml.');
      const xml = await xmlFile.async('text');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');

      const paragraphs = [...doc.querySelectorAll('p')];
      if (!paragraphs.length) throw new Error('This Word document appears to be empty.');

      const sections = [];
      let currentSection = null;

      for (const para of paragraphs) {
        const pStyle = para.querySelector('pStyle');
        const styleId = pStyle?.getAttribute('val') || pStyle?.getAttribute('w:val') || '';
        const level = headingLevel(styleId);
        const text = runsText(para);
        if (!text.trim()) continue;

        if (level > 0) {
          if (currentSection) sections.push(currentSection);
          currentSection = { id: `sec-${sections.length + 1}`, label: text.replace(/<[^>]+>/g,''), depth: level - 1, html: `<h${level}>${text}</h${level}>` };
        } else {
          if (!currentSection) currentSection = { id: 'sec-1', label: this.record.title || 'Document', depth: 0, html: '' };
          currentSection.html += `<p>${text}</p>`;
        }
      }

      if (currentSection) sections.push(currentSection);
      if (!sections.length) throw new Error('This Word document has no readable content.');
      return sections;
    }
  }

  return { Adapter };
})();

// ─────────────────────────────────────────────────── ODT ──────────
const OdtAdapter = (() => {
  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'odt';
      this.formatLabel = 'OpenDocument text';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      if (typeof JSZip === 'undefined') throw new Error('JSZip is required to open ODT files.');
      const zip = await JSZip.loadAsync(bytes);
      const xmlFile = zip.file('content.xml');
      if (!xmlFile) throw new Error('This ODT file is missing content.xml.');
      const xml = await xmlFile.async('text');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const body = doc.querySelector('body');
      if (!body) throw new Error('This ODT file has no readable body.');

      const sections = [];
      let currentSection = null;

      for (const node of [...body.querySelectorAll('h, p')]) {
        const tagLocal = node.localName;
        const text = node.textContent.trim();
        if (!text) continue;
        const esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        if (tagLocal === 'h') {
          const level = Math.min(6, Number(node.getAttribute('text:outline-level') || node.getAttribute('outline-level') || 1));
          if (currentSection) sections.push(currentSection);
          currentSection = { id: `sec-${sections.length + 1}`, label: text, depth: level - 1, html: `<h${level}>${esc}</h${level}>` };
        } else {
          if (!currentSection) currentSection = { id: 'sec-1', label: this.record.title || 'Document', depth: 0, html: '' };
          currentSection.html += `<p>${esc}</p>`;
        }
      }

      if (currentSection) sections.push(currentSection);
      if (!sections.length) throw new Error('This OpenDocument file has no readable content.');
      return sections;
    }
  }

  return { Adapter };
})();

// ─────────────────────────────────────────────────── RTF ──────────
const RtfAdapter = (() => {
  function extractText(rtf) {
    let text = rtf.replace(/\{\\\*[^{}]*(?:\{[^{}]*\})*[^{}]*\}/g, ' ');
    text = text.replace(/\{([^{}]*)\}/g, '$1');
    text = text.replace(/\\[a-z]+[-\d]*/gi, ' ');
    text = text.replace(/\\\\/g, '\\').replace(/\\\{/g, '{').replace(/\\\}/g, '}');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'rtf';
      this.formatLabel = 'Rich text';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const raw = new TextDecoder('windows-1252', { fatal: false }).decode(bytes);
      const text = extractText(raw);
      if (!text.trim()) throw new Error('This RTF file appears to be empty.');

      const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
      const html = blocks.map(b =>
        `<p>${b.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>`
      ).join('\n');

      return [{ id: 'sec-1', label: this.record.title || 'Document', depth: 0, html }];
    }
  }

  return { Adapter };
})();
