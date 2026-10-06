/**
 * Lirune Reader - Office Document Adapters (DOCX, ODT, RTF)
 * All extend DocumentAdapter.Adapter so scroll/paginate/search work out of the box.
 */

// ─────────────────────────────────────────────── DOCX ──────────
// ─────────────────────────────────────────────── DOCX ──────────
const DocxAdapter = (() => {
  function nodeNameLocal(node) {
    if (!node) return '';
    return node.localName || (node.nodeName ? node.nodeName.split(':').pop() : '');
  }

  function getAttr(el, localAttrName) {
    if (!el) return '';
    const targetLower = localAttrName.toLowerCase();
    if (el.attributes) {
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        const aName = (attr.localName || attr.name.split(':').pop() || '').toLowerCase();
        if (aName === targetLower) return attr.value;
      }
    }
    return el.getAttribute?.(localAttrName) || '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadImageRelationships(zip) {
    const imageMap = new Map();
    const linkMap = new Map();
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (!relsFile) return { imageMap, linkMap };

    try {
      const xml = await relsFile.async('text');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const allRels = doc.getElementsByTagName('*');
      for (const rel of allRels) {
        if (nodeNameLocal(rel).toLowerCase() !== 'relationship') continue;
        const id = getAttr(rel, 'id');
        const type = getAttr(rel, 'type');
        const target = getAttr(rel, 'target');
        if (!id || !target) continue;

        if (type.includes('/hyperlink') || /^https?:\/\//i.test(target)) {
          linkMap.set(id, target);
        } else if (type.includes('/image') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(target)) {
          let cleanTarget = target.replace(/^\.\.\//, '').replace(/^\//, '');
          let zipPath = cleanTarget.startsWith('word/') ? cleanTarget : `word/${cleanTarget}`;
          let file = zip.file(zipPath);
          if (!file) {
            const baseName = target.split('/').pop();
            const found = Object.keys(zip.files).find(n => n.endsWith(baseName));
            if (found) file = zip.file(found);
          }
          if (file) {
            try {
              const ext = (target.split('.').pop() || 'png').toLowerCase();
              const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'png' ? 'image/png'
                : ext === 'gif' ? 'image/gif'
                : ext === 'webp' ? 'image/webp'
                : ext === 'svg' ? 'image/svg+xml'
                : 'image/png';
              const base64 = await file.async('base64');
              imageMap.set(id, `data:${mime};base64,${base64}`);
            } catch (err) {
              console.warn('Could not decode DOCX image:', target, err);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not parse DOCX relationships:', e);
    }
    return { imageMap, linkMap };
  }

  function parseRun(runNode, imageMap) {
    let isBold = false;
    let isItalic = false;
    let isUnderline = false;
    let isStrike = false;
    let html = '';

    for (const child of runNode.children || []) {
      const tag = nodeNameLocal(child);
      if (tag === 'rPr') {
        for (const prop of child.children || []) {
          const pTag = nodeNameLocal(prop);
          const val = getAttr(prop, 'val');
          const isEnabled = val === '' || (val !== '0' && val !== 'false' && val !== 'off' && val !== 'none');
          if (pTag === 'b' && isEnabled) isBold = true;
          if (pTag === 'i' && isEnabled) isItalic = true;
          if (pTag === 'u' && isEnabled) isUnderline = true;
          if ((pTag === 'strike' || pTag === 'dstrike') && isEnabled) isStrike = true;
        }
      } else if (tag === 't') {
        html += escapeHtml(child.textContent || '');
      } else if (tag === 'br') {
        html += '<br>';
      } else if (tag === 'tab') {
        html += '&emsp;';
      } else if (tag === 'drawing') {
        html += parseDrawing(child, imageMap);
      }
    }

    if (!html) return '';
    if (isBold) html = `<strong>${html}</strong>`;
    if (isItalic) html = `<em>${html}</em>`;
    if (isUnderline) html = `<u>${html}</u>`;
    if (isStrike) html = `<s>${html}</s>`;
    return html;
  }

  function parseDrawing(drawingNode, imageMap) {
    const all = drawingNode.getElementsByTagName('*');
    for (const el of all) {
      const tag = nodeNameLocal(el);
      if (tag === 'blip' || tag === 'imagedata') {
        const rId = getAttr(el, 'embed') || getAttr(el, 'id');
        if (rId && imageMap.has(rId)) {
          return `<img src="${imageMap.get(rId)}" alt="Document Image" class="doc-image" style="max-width:100%;height:auto;margin:1em auto;display:block;border-radius:4px;" />`;
        }
      }
    }
    return '';
  }

  function parseHyperlink(linkNode, imageMap, linkMap) {
    const rId = getAttr(linkNode, 'id');
    const href = rId && linkMap.has(rId) ? linkMap.get(rId) : '';
    let inner = '';
    for (const child of linkNode.children || []) {
      const tag = nodeNameLocal(child);
      if (tag === 'r') inner += parseRun(child, imageMap);
      else if (tag === 'drawing') inner += parseDrawing(child, imageMap);
    }
    if (!inner) return '';
    if (href) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    return inner;
  }

  function parseParagraph(pNode, imageMap, linkMap) {
    let styleId = '';
    let outlineLevel = -1;
    let isListItem = false;
    let listLevel = 0;
    let align = '';
    let contentHtml = '';

    for (const child of pNode.children || []) {
      const tag = nodeNameLocal(child);
      if (tag === 'pPr') {
        for (const prop of child.children || []) {
          const pTag = nodeNameLocal(prop);
          const val = getAttr(prop, 'val');
          if (pTag === 'pStyle') styleId = val;
          if (pTag === 'outlineLvl') outlineLevel = parseInt(val, 10);
          if (pTag === 'jc') align = val;
          if (pTag === 'numPr') {
            isListItem = true;
            for (const nChild of prop.children || []) {
              if (nodeNameLocal(nChild) === 'ilvl') {
                listLevel = parseInt(getAttr(nChild, 'val') || '0', 10);
              }
            }
          }
        }
      } else if (tag === 'r') {
        contentHtml += parseRun(child, imageMap);
      } else if (tag === 'hyperlink') {
        contentHtml += parseHyperlink(child, imageMap, linkMap);
      } else if (tag === 'drawing') {
        contentHtml += parseDrawing(child, imageMap);
      }
    }

    let level = 0;
    const m = /Heading(\d)/i.exec(styleId);
    if (m) {
      level = Math.min(6, Math.max(1, Number(m[1])));
    } else if (outlineLevel >= 0 && outlineLevel <= 5) {
      level = outlineLevel + 1;
    } else if (/^Title$/i.test(styleId)) {
      level = 1;
    } else if (/^Subtitle$/i.test(styleId)) {
      level = 2;
    }

    const plainText = contentHtml.replace(/<[^>]+>/g, '').trim();
    return { level, isListItem, listLevel, align, contentHtml, plainText };
  }

  function parseTable(tblNode, imageMap, linkMap) {
    let rowsHtml = '';
    for (const row of tblNode.children || []) {
      if (nodeNameLocal(row) !== 'tr') continue;
      let cellsHtml = '';
      for (const cell of row.children || []) {
        if (nodeNameLocal(cell) !== 'tc') continue;
        let cellContent = '';
        for (const child of cell.children || []) {
          const tag = nodeNameLocal(child);
          if (tag === 'p') {
            const pRes = parseParagraph(child, imageMap, linkMap);
            if (pRes.contentHtml) {
              cellContent += `<p style="margin:0.25em 0;">${pRes.contentHtml}</p>`;
            }
          } else if (tag === 'tbl') {
            cellContent += parseTable(child, imageMap, linkMap);
          }
        }
        cellsHtml += `<td style="border:1px solid var(--border-subtle, #ccc);padding:6px 10px;vertical-align:top;">${cellContent || '&nbsp;'}</td>`;
      }
      if (cellsHtml) rowsHtml += `<tr>${cellsHtml}</tr>`;
    }
    if (!rowsHtml) return '';
    return `<div class="doc-table-wrapper" style="overflow-x:auto;margin:1.2em 0;"><table class="doc-table" style="width:100%;border-collapse:collapse;border:1px solid var(--border-subtle, #ccc);">${rowsHtml}</table></div>`;
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

      let body = null;
      for (const el of doc.documentElement?.children || []) {
        if (nodeNameLocal(el) === 'body') { body = el; break; }
      }
      if (!body) {
        const all = doc.getElementsByTagName('*');
        for (const el of all) {
          if (nodeNameLocal(el) === 'body') { body = el; break; }
        }
      }
      if (!body) body = doc.documentElement;
      if (!body) throw new Error('This Word document has no readable body.');

      const { imageMap, linkMap } = await loadImageRelationships(zip);

      const sections = [];
      let currentSection = null;
      let paragraphCount = 0;
      const defaultTitle = this.record.title || 'Document';

      function pushCurrentSection() {
        if (currentSection && currentSection.html.trim()) {
          sections.push(currentSection);
          currentSection = null;
        }
      }

      function ensureCurrentSection(label = defaultTitle, depth = 0) {
        if (!currentSection) {
          currentSection = {
            id: `sec-${sections.length + 1}`,
            label,
            depth: Math.max(0, depth),
            html: ''
          };
        }
      }

      for (const node of body.children || []) {
        const tag = nodeNameLocal(node);
        if (tag === 'p') {
          const res = parseParagraph(node, imageMap, linkMap);
          if (!res.contentHtml && !res.plainText) continue;

          if (res.level > 0) {
            pushCurrentSection();
            const label = res.plainText || `Section ${sections.length + 1}`;
            currentSection = {
              id: `sec-${sections.length + 1}`,
              label,
              depth: res.level - 1,
              html: `<h${res.level}>${res.contentHtml}</h${res.level}>`
            };
            paragraphCount = 0;
          } else {
            ensureCurrentSection();
            paragraphCount++;
            if (paragraphCount > 75 && currentSection.html.length > 25000) {
              pushCurrentSection();
              ensureCurrentSection(`Part ${sections.length + 1}`, 0);
              paragraphCount = 0;
            }
            if (res.isListItem) {
              const indent = res.listLevel * 1.5 + 1.2;
              currentSection.html += `<p class="doc-list-item" style="padding-left:${indent}em;margin:0.35em 0;">• ${res.contentHtml}</p>`;
            } else {
              const alignStyle = res.align ? ` style="text-align:${res.align};"` : '';
              currentSection.html += `<p${alignStyle}>${res.contentHtml}</p>`;
            }
          }
        } else if (tag === 'tbl') {
          const tblHtml = parseTable(node, imageMap, linkMap);
          if (tblHtml) {
            ensureCurrentSection();
            currentSection.html += tblHtml;
          }
        }
      }

      pushCurrentSection();

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
