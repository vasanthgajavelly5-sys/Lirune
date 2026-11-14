/**
 * Lirune Reader - bounded BIFF8 reader for legacy XLS workbooks.
 * The parser reads values only; formulas, macros, links, and embedded objects
 * are never evaluated or executed.
 */
const LegacySpreadsheetAdapter = (() => {
  const MAX_ROWS = 5000;
  const MAX_COLS = 100;

  const escape = value => Utils.escapeHTML(String(value ?? ''));
  const u16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
  const u32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

  function readString(bytes, offset, rich = false) {
    const length = u16(bytes, offset);
    const flags = bytes[offset + 2];
    let cursor = offset + 3;
    if (flags & 0x08) cursor += 2;
    if (flags & 0x04) cursor += 4;
    const size = flags & 1 ? length * 2 : length;
    const value = new TextDecoder(flags & 1 ? 'utf-16le' : 'latin1').decode(bytes.subarray(cursor, cursor + size));
    return { value, end: cursor + size + (rich ? (flags & 0x08 ? u16(bytes, offset + 3) * 4 : 0) : 0) };
  }

  function parseSst(records, start) {
    const chunks = [];
    for (let i = start; i < records.length && (i === start || records[i].type === 0x003C); i++) {
      chunks.push(records[i].data);
    }
    if (!chunks.length) return [];
    const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (bytes.length < 8) return [];
    const count = Math.min(u32(bytes, 4), 100000);
    const strings = [];
    offset = 8;
    for (let i = 0; i < count && offset + 3 <= bytes.length; i++) {
      const parsed = readString(bytes, offset, true);
      if (parsed.end <= offset || parsed.end > bytes.length) break;
      strings.push(parsed.value);
      offset = parsed.end;
    }
    return strings;
  }

  function recordsFrom(bytes, start, end = bytes.length) {
    const records = [];
    for (let offset = start; offset + 4 <= end;) {
      const type = u16(bytes, offset);
      const length = u16(bytes, offset + 2);
      const dataStart = offset + 4;
      const dataEnd = dataStart + length;
      if (dataEnd > end) break;
      records.push({ type, data: bytes.slice(dataStart, dataEnd), offset });
      offset = dataEnd;
    }
    return records;
  }

  function parseWorkbook(bytes, container, cfbModule) {
    const findStream = (name) => {
      if (cfbModule && typeof cfbModule.find === 'function') {
        return cfbModule.find(container, name);
      }
      if (container && typeof container.find === 'function') {
        return container.find(container, name);
      }
      return null;
    };
    const workbook = findStream('Workbook') || findStream('Book');
    if (!workbook?.content) throw new Error('Legacy XLS workbook stream is missing.');
    const stream = new Uint8Array(workbook.content);
    const records = recordsFrom(stream, 0);
    const sheets = [];
    const bounds = [];
    let sst = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.type === 0x00FC) sst = parseSst(records, i + 0);
      if (record.type !== 0x0085 || record.data.length < 8) continue;
      const name = readString(record.data, 6).value || `Sheet ${bounds.length + 1}`;
      bounds.push({ offset: u32(record.data, 0), name });
    }
    for (const bound of bounds) {
      const sheetRecords = recordsFrom(stream, bound.offset);
      const cells = new Map();
      for (const record of sheetRecords) {
        if (record.type === 0x000A) break;
        const data = record.data;
        if (data.length < 6) continue;
        const row = u16(data, 0);
        const col = u16(data, 2);
        if (row >= MAX_ROWS || col >= MAX_COLS) continue;
        let value = '';
        if (record.type === 0x00FD && data.length >= 10) value = sst[u32(data, 6)] || '';
        else if (record.type === 0x0204) value = readString(data, 6).value;
        else if (record.type === 0x0203 && data.length >= 14) value = new DataView(data.buffer, data.byteOffset + 6, 8).getFloat64(0, true);
        else if (record.type === 0x027E && data.length >= 10) {
          const raw = u32(data, 6);
          value = raw & 1 ? raw >> 2 : `0x${(raw >>> 2).toString(16)}`;
        } else if (record.type === 0x0205 && data.length >= 8) value = data[6] ? 'TRUE' : 'FALSE';
        else if (record.type === 0x0006 && data.length >= 14) value = new DataView(data.buffer, data.byteOffset + 6, 8).getFloat64(0, true);
        else continue;
        if (!cells.has(row)) cells.set(row, new Map());
        cells.get(row).set(col, value);
      }
      const rows = [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => {
        const max = Math.min(MAX_COLS, Math.max(0, ...row.keys()) + 1);
        return Array.from({ length: max }, (_, col) => row.get(col) ?? '');
      });
      if (rows.length) sheets.push({ name: bound.name, rows });
    }
    return sheets;
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = 'xls';
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      let cfb = (typeof window !== 'undefined' && window.CFB) || (typeof CFB !== 'undefined' ? CFB : null);
      if (!cfb) {
        const module = await import('../../node_modules/cfb/cfb.js');
        cfb = module.default || module;
      }
      const sheets = parseWorkbook(bytes, cfb.read(bytes, { type: 'array' }), cfb);
      if (!sheets.length) throw new Error('This XLS workbook contains no readable sheets.');
      return sheets.map(sheet => ({
        id: `sheet-${sheet.name}`,
        label: sheet.name,
        depth: 0,
        html: `<section class="spreadsheet-sheet"><h3>${escape(sheet.name)}</h3><div class="expansion-table-wrap"><table class="expansion-table"><tbody>${sheet.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`
      }));
    }
  }

  return { Adapter, parseWorkbook };
})();
