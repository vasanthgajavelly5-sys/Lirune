/**
 * Lirune Reader - offline adapters for lightweight document families.
 *
 * These adapters intentionally render read-only content through the existing
 * DocumentAdapter surface. They do not execute macros, scripts, formulas, or
 * external resources.
 */
const ExpansionAdapters = (() => {
  const MAX_TEXT_BYTES = 64 * 1024 * 1024;
  const MAX_ROWS = 5000;

  function escape(value) {
    return Utils.escapeHTML(String(value ?? ''));
  }

  function decode(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  class TextAdapter extends DocumentAdapter.Adapter {
    constructor(host, record, format, label) {
      super(host, record);
      this.format = format;
      this.formatLabel = label;
      this.flow = 'scrolled';
    }

    async readText() {
      const bytes = await this.loadBytes();
      if (bytes.length > MAX_TEXT_BYTES) throw new Error(`This ${this.formatLabel} exceeds the safe 64 MB text limit.`);
      return decode(bytes);
    }

    async buildSections() {
      const text = await this.readText();
      if (!text.trim()) throw new Error(`This ${this.formatLabel} is empty.`);
      return [{
        id: 'section-1',
        label: this.record.title || this.formatLabel,
        depth: 0,
        html: `<pre class="expansion-pre">${escape(text)}</pre>`
      }];
    }
  }

  class CsvAdapter extends TextAdapter {
    constructor(host, record) {
      super(host, record, 'csv', 'spreadsheet');
    }

    async buildSections() {
      const text = await this.readText();
      const delimiter = this.format === 'tsv' || /\.tsv$/i.test(this.record.originalName || '') ? '\t' : detectDelimiter(text);
      const rows = parseDelimited(text, delimiter).slice(0, MAX_ROWS);
      if (!rows.length) throw new Error('This spreadsheet contains no readable rows.');
      const [header, ...body] = rows;
      const headHtml = header.map(cell => `<th>${escape(cell)}</th>`).join('');
      const bodyHtml = body.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('');
      return [{
        id: 'sheet-1',
        label: this.record.title || 'Spreadsheet',
        depth: 0,
        html: `<div class="expansion-table-wrap"><table class="expansion-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
      }];
    }
  }

  class StructuredAdapter extends TextAdapter {
    constructor(host, record) {
      super(host, record, record.format, 'structured document');
    }

    async buildSections() {
      const raw = await this.readText();
      let content = raw;
      if (this.format === 'json') {
        try { content = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* preserve malformed JSON for reading */ }
      }
      return [{
        id: 'section-1',
        label: this.record.title || this.format.toUpperCase(),
        depth: 0,
        html: `<pre class="expansion-code">${escape(content)}</pre>`
      }];
    }
  }

  class EmailAdapter extends TextAdapter {
    constructor(host, record) {
      super(host, record, record.format, 'email document');
    }

    async buildSections() {
      const raw = await this.readText();
      const split = raw.search(/\r?\n\r?\n/);
      const headerText = split >= 0 ? raw.slice(0, split) : raw;
      const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, '') : '';
      const headers = {};
      headerText.split(/\r?\n/).forEach(line => {
        const match = /^([^:]+):\s*(.*)$/.exec(line);
        if (match) headers[match[1].toLowerCase()] = match[2];
      });
      const title = headers.subject || this.record.title || 'Email';
      const headerHtml = ['from', 'to', 'cc', 'date', 'subject']
        .filter(key => headers[key])
        .map(key => `<p><strong>${escape(key)}:</strong> ${escape(headers[key])}</p>`)
        .join('');
      return [{
        id: 'message-1',
        label: title,
        depth: 0,
        html: `<article class="expansion-message"><header>${headerHtml}</header><pre>${escape(body)}</pre></article>`
      }];
    }
  }

  class ContactCalendarAdapter extends TextAdapter {
    constructor(host, record) {
      super(host, record, record.format, record.format === 'ics' ? 'calendar file' : 'contact file');
    }

    async buildSections() {
      const raw = await this.readText();
      const fields = raw.split(/\r?\n/).filter(Boolean).map(line => {
        const index = line.indexOf(':');
        return index > 0 ? `<p><strong>${escape(line.slice(0, index))}:</strong> ${escape(line.slice(index + 1))}</p>` : `<p>${escape(line)}</p>`;
      }).join('');
      return [{ id: 'item-1', label: this.record.title || this.format.toUpperCase(), depth: 0, html: `<section>${fields}</section>` }];
    }
  }

  class PackageTextAdapter extends DocumentAdapter.Adapter {
    constructor(host, record, format, label) {
      super(host, record);
      this.format = format;
      this.formatLabel = label;
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      if (bytes.length > MAX_TEXT_BYTES) throw new Error(`This ${this.formatLabel} exceeds the safe 64 MB limit.`);
      if (typeof JSZip === 'undefined') throw new Error('ZIP support is unavailable in this build.');
      const zip = await JSZip.loadAsync(bytes);
      if (typeof DocumentAdapter !== 'undefined' && DocumentAdapter.validateZipBudget) {
        DocumentAdapter.validateZipBudget(zip);
      }
      const files = Object.values(zip.files).filter(file => !file.dir);
      const textFiles = files.filter(file => /\.(xml|rels|txt|html|xhtml)$/i.test(file.name)).slice(0, 100);
      const sections = [];
      for (const file of textFiles) {
        const source = await file.async('text');
        const plain = source.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain) sections.push({ id: file.name, label: file.name, depth: 0, html: `<h3>${escape(file.name)}</h3><p>${escape(plain)}</p>` });
      }

      if (!sections.length) throw new Error(`This ${this.formatLabel} contains no readable content.`);
      return sections;
    }
  }

  class XlsbAdapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      if (bytes.length > MAX_TEXT_BYTES) throw new Error('This binary Excel workbook exceeds the safe 64 MB limit.');
      const { parseXlsb } = await import('../../node_modules/xlsb-parser/dist/index.js');
      const workbook = await parseXlsb(bytes, { maxRowsPerSheet: MAX_ROWS, maxZipBytes: MAX_TEXT_BYTES });
      const sections = workbook.sheets.map((sheet) => {
        const rows = sheet.rows.map((row) => {
          const indexes = Object.keys(row.cols).map(Number).filter((index) => index >= 0 && index < 100);
          const width = indexes.length ? Math.max(...indexes) + 1 : 0;
          return Array.from({ length: width }, (_, index) => {
            const cell = row.cols[index];
            return escape(cell ? (cell.dateValue ?? cell.v ?? cell.err ?? '') : '');
          });
        });
        const [header = [], ...body] = rows;
        return {
          id: `sheet-${sheet.name}`,
          label: sheet.name,
          depth: 0,
          html: `<h3>${escape(sheet.name)}</h3><div class="expansion-table-wrap"><table class="expansion-table"><thead><tr>${header.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        };
      });
      if (!sections.length) throw new Error('This binary Excel workbook contains no readable sheets.');
      return sections;
    }
  }

  function detectDelimiter(text) {
    const candidates = [',', '\t', ';', '|'];
    return candidates.reduce((best, candidate) => {
      const current = (text.slice(0, 8192).match(new RegExp(candidate === '\t' ? '\\t' : `\\${candidate}`, 'g')) || []).length;
      const previous = (text.slice(0, 8192).match(new RegExp(best === '\t' ? '\\t' : `\\${best}`, 'g')) || []).length;
      return current > previous ? candidate : best;
    }, ',');
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length && rows.length < MAX_ROWS; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(cell); cell = ''; }
      else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  return {
    CsvAdapter: class extends CsvAdapter {},
    TsvAdapter: class extends CsvAdapter {},
    JsonAdapter: class extends StructuredAdapter {},
    XmlAdapter: class extends StructuredAdapter {},
    YamlAdapter: class extends StructuredAdapter {},
    LogAdapter: class extends StructuredAdapter {},
    EmlAdapter: class extends EmailAdapter {},
    MhtAdapter: class extends EmailAdapter {},
    MboxAdapter: class extends EmailAdapter {},
    VcfAdapter: class extends ContactCalendarAdapter {},
    IcsAdapter: class extends ContactCalendarAdapter {},
    SpreadsheetPackageAdapter: class extends PackageTextAdapter {},
    XlsbAdapter,
    PresentationPackageAdapter: class extends PackageTextAdapter {},
    IWorkPackageAdapter: class extends PackageTextAdapter {},
    XpsPackageAdapter: class extends PackageTextAdapter {}
  };
})();
