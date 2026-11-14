/**
 * Lirune Reader Mobile — Pure TypeScript Spreadsheet Parser
 * Supports XLSX (OpenXML), ODS (OpenDocument Spreadsheet), CSV, and TSV.
 * Uses bundled JSZip for OpenXML and ODS package reading.
 * Zero new dependencies.
 *
 * Security:
 * - Never executes macros or active content (strips vbaProject.bin).
 * - Caps row count and column count to prevent memory exhaustion.
 * - Escapes all cell text before rendering HTML.
 * - Strips any external XML entities / formulas.
 */

import JSZip from 'jszip';
import { validateZipArchive } from '../security/archiveBudget.ts';
import { CsvParser, ParsedCsv } from '../csv/CsvParser.ts';
import { LegacyOfficeParser } from '../legacy/LegacyOfficeParser.ts';

const MAX_ROWS = 5000;
const MAX_COLS = 100;

export interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
}

export interface ParsedSpreadsheet {
  title: string;
  sheets: SheetData[];
  html: string;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class SpreadsheetParser {
  static async parseXlsb(buffer: ArrayBuffer | Uint8Array): Promise<ParsedSpreadsheet> {
    const { parseXlsb } = await import('xlsb-parser');
    const workbook = await parseXlsb(buffer, { maxRowsPerSheet: MAX_ROWS, maxZipBytes: 64 * 1024 * 1024 });
    const sheets: SheetData[] = workbook.sheets.map((sheet) => {
      const rows = sheet.rows.map((row) => {
        const indexes = Object.keys(row.cols).map(Number).filter((index) => index >= 0 && index < MAX_COLS);
        const width = indexes.length ? Math.max(...indexes) + 1 : 0;
        const cells = Array.from({ length: width }, (_, column) => {
          const cell = row.cols[column];
          return cell ? String(cell.dateValue ?? cell.v ?? cell.err ?? '') : '';
        });
        return cells;
      });
      const headers = rows[0] || [];
      return {
        name: sheet.name,
        headers,
        rows: rows.slice(1),
        rowCount: rows.length,
        columnCount: headers.length,
      };
    });
    return { title: 'Excel binary workbook', sheets, html: SpreadsheetParser.renderHtml(sheets, 'Excel binary workbook') };
  }

  /**
   * Parse an XLSX buffer using pure TypeScript + bundled JSZip.
   */
  static async parseXlsx(buffer: ArrayBuffer | Uint8Array | string): Promise<ParsedSpreadsheet> {
    const zip =
      typeof buffer === 'string'
        ? await JSZip.loadAsync(buffer, { base64: true })
        : await JSZip.loadAsync(buffer);
    validateZipArchive(zip);

    // 1. Title from docProps/core.xml if present
    let title = 'Spreadsheet';
    const coreFile = zip.file('docProps/core.xml');
    if (coreFile) {
      const coreXml = await coreFile.async('text');
      const m = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (m?.[1]?.trim()) title = m[1].trim();
    }

    // 2. Shared strings from xl/sharedStrings.xml
    const sharedStrings: string[] = [];
    const ssFile = zip.file('xl/sharedStrings.xml');
    if (ssFile) {
      const ssXml = await ssFile.async('text');
      // Shared strings are <si><t>...</t></si> or <si><r><t>...</t></r></si>
      const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
      let siMatch: RegExpExecArray | null;
      while ((siMatch = siRegex.exec(ssXml)) !== null) {
        const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
        let tMatch: RegExpExecArray | null;
        let cellText = '';
        while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
          cellText += tMatch[1];
        }
        sharedStrings.push(
          cellText
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
        );
      }
    }

    // 3. Sheet names from xl/workbook.xml
    const sheetNames: { id: string; name: string }[] = [];
    const wbFile = zip.file('xl/workbook.xml');
    if (wbFile) {
      const wbXml = await wbFile.async('text');
      const sRegex = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\bsheetId="([^"]+)"[^>]*>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = sRegex.exec(wbXml)) !== null) {
        sheetNames.push({ name: sm[1], id: sm[2] });
      }
    }

    // 4. Parse sheets
    const sheets: SheetData[] = [];
    const sheetFiles = Object.keys(zip.files)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort();

    for (let sIdx = 0; sIdx < sheetFiles.length; sIdx++) {
      const sFile = zip.file(sheetFiles[sIdx]);
      if (!sFile) continue;
      const sheetXml = await sFile.async('text');
      const sheetDisplayName = sheetNames[sIdx]?.name || `Sheet ${sIdx + 1}`;

      const rows: string[][] = [];
      const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
      let rm: RegExpExecArray | null;

      while ((rm = rowRegex.exec(sheetXml)) !== null && rows.length < MAX_ROWS) {
        const rowContent = rm[1];
        const cellRegex = /<c\b([^>]*)>(?:<f[\s\S]*?<\/f>)?(?:<v>([\s\S]*?)<\/v>|<is><t>([\s\S]*?)<\/t><\/is>)?<\/c>/gi;
        let cm: RegExpExecArray | null;
        const curRow: string[] = [];

        while ((cm = cellRegex.exec(rowContent)) !== null && curRow.length < MAX_COLS) {
          const attrs = cm[1];
          const val = cm[2];
          const inlineText = cm[3];

          let text = '';
          const isString = attrs.includes('t="s"');
          const isInline = attrs.includes('t="inlineStr"');

          if (isInline && inlineText !== undefined) {
            text = inlineText;
          } else if (isString && val !== undefined) {
            const idx = parseInt(val, 10);
            text = sharedStrings[idx] ?? '';
          } else if (val !== undefined) {
            text = val;
          }
          curRow.push(text.trim());
        }

        if (curRow.some((c) => c !== '')) {
          rows.push(curRow);
        }
      }

      const headers = rows.length > 0 ? rows[0] : [];
      const dataRows = rows.slice(1);

      sheets.push({
        name: sheetDisplayName,
        headers,
        rows: dataRows,
        rowCount: rows.length,
        columnCount: headers.length,
      });
    }

    const html = SpreadsheetParser.renderHtml(sheets, title);
    return { title, sheets, html };
  }

  /**
   * Parse an ODS (OpenDocument Spreadsheet) buffer using pure TypeScript + bundled JSZip.
   */
  static async parseOds(buffer: ArrayBuffer | Uint8Array | string): Promise<ParsedSpreadsheet> {
    const zip =
      typeof buffer === 'string'
        ? await JSZip.loadAsync(buffer, { base64: true })
        : await JSZip.loadAsync(buffer);
    validateZipArchive(zip);

    let title = 'Spreadsheet';
    const metaFile = zip.file('meta.xml');
    if (metaFile) {
      const metaXml = await metaFile.async('text');
      const m = metaXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (m?.[1]?.trim()) title = m[1].trim();
    }

    const contentFile = zip.file('content.xml');
    if (!contentFile) throw new Error('Invalid ODS: missing content.xml');
    const contentXml = await contentFile.async('text');

    const sheets: SheetData[] = [];
    const tableRegex = /<table:table\b[^>]*\btable:name="([^"]+)"[^>]*>([\s\S]*?)<\/table:table>/gi;
    let tm: RegExpExecArray | null;

    while ((tm = tableRegex.exec(contentXml)) !== null) {
      const sheetName = tm[1];
      const tableContent = tm[2];
      const rows: string[][] = [];

      const rowRegex = /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/gi;
      let rm: RegExpExecArray | null;

      while ((rm = rowRegex.exec(tableContent)) !== null && rows.length < MAX_ROWS) {
        const rowContent = rm[1];
        const cellRegex = /<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/gi;
        let cm: RegExpExecArray | null;
        const curRow: string[] = [];

        while ((cm = cellRegex.exec(rowContent)) !== null && curRow.length < MAX_COLS) {
          const cellXml = cm[1];
          const textMatch = cellXml.match(/<text:p[^>]*>([\s\S]*?)<\/text:p>/i);
          curRow.push(textMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '');
        }

        if (curRow.some((c) => c !== '')) {
          rows.push(curRow);
        }
      }

      const headers = rows.length > 0 ? rows[0] : [];
      const dataRows = rows.slice(1);
      sheets.push({
        name: sheetName,
        headers,
        rows: dataRows,
        rowCount: rows.length,
        columnCount: headers.length,
      });
    }

    const html = SpreadsheetParser.renderHtml(sheets, title);
    return { title, sheets, html };
  }

  /**
   * Parse CSV/TSV into Spreadsheet format.
   */
  static parseCsv(buffer: ArrayBuffer | Uint8Array, delimiter?: string): ParsedSpreadsheet {
    const parsed: ParsedCsv = CsvParser.parse(buffer, delimiter);
    const sheet: SheetData = {
      name: 'Sheet 1',
      headers: parsed.headers,
      rows: parsed.rows,
      rowCount: parsed.metadata.rowCount,
      columnCount: parsed.metadata.columnCount,
    };
    const title = parsed.metadata.title;
    const html = SpreadsheetParser.renderHtml([sheet], title);
    return { title, sheets: [sheet], html };
  }

  /**
   * Parse legacy Excel 97-2003 (BIFF8 .xls) binary workbook.
   */
  static parseXls(buffer: ArrayBuffer | Uint8Array): ParsedSpreadsheet {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const stream = extractOleStream(bytes, 'Workbook') || extractOleStream(bytes, 'Book');
    if (stream && stream.length > 0) {
      const sheets = parseBiff8Workbook(stream);
      if (sheets.length > 0) {
        const title = 'Excel workbook';
        const html = SpreadsheetParser.renderHtml(sheets, title);
        return { title, sheets, html };
      }
    }
    // Fallback: legacy office text extraction
    try {
      const parsed = LegacyOfficeParser.parse(bytes, 'xls');
      const rows = parsed.html
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_ROWS)
        .map((line) => [line]);
      const headers = rows.length > 0 ? rows[0] : ['Content'];
      const dataRows = rows.slice(1);
      const sheet: SheetData = {
        name: 'Sheet 1',
        headers,
        rows: dataRows,
        rowCount: rows.length,
        columnCount: 1,
      };
      const title = parsed.title || 'Excel workbook';
      const html = SpreadsheetParser.renderHtml([sheet], title);
      return { title, sheets: [sheet], html };
    } catch {
      throw new Error('This legacy XLS file does not contain readable spreadsheet data.');
    }
  }

  /**
   * Render sheets to clean, responsive, reader-themed HTML tables.
   */
  static renderHtml(sheets: SheetData[], title: string): string {
    const parts: string[] = [
      `<div class="lirune-spreadsheet">`,
      `<h2 class="lirune-spreadsheet-title">${escapeHtml(title)}</h2>`,
    ];

    for (const sheet of sheets) {
      parts.push(`<div class="lirune-sheet-container">`);
      parts.push(`<h3 class="lirune-sheet-name">${escapeHtml(sheet.name)} (${sheet.rowCount} rows)</h3>`);
      parts.push(`<div class="lirune-table-wrapper"><table class="lirune-table">`);

      if (sheet.headers.length > 0) {
        parts.push(`<thead><tr>`);
        sheet.headers.forEach((h, idx) => {
          parts.push(`<th>${escapeHtml(h || `Col ${idx + 1}`)}</th>`);
        });
        parts.push(`</tr></thead>`);
      }

      parts.push(`<tbody>`);
      sheet.rows.forEach((row) => {
        parts.push(`<tr>`);
        row.forEach((cell) => {
          parts.push(`<td>${escapeHtml(cell)}</td>`);
        });
        parts.push(`</tr>`);
      });
      parts.push(`</tbody></table></div></div>`);
    }

    parts.push(`</div>`);
    return parts.join('\n');
  }
}

function extractOleStream(bytes: Uint8Array, streamName: string): Uint8Array | null {
  if (bytes.length < 512) return null;
  if (
    bytes[0] !== 0xd0 || bytes[1] !== 0xcf || bytes[2] !== 0x11 || bytes[3] !== 0xe0 ||
    bytes[4] !== 0xa1 || bytes[5] !== 0xb1 || bytes[6] !== 0x1a || bytes[7] !== 0xe1
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = view.getUint16(30, true);
  const sectorSize = 1 << sectorShift;
  if (sectorSize !== 512 && sectorSize !== 4096) return null;
  const firstDirSector = view.getUint32(48, true);

  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && 76 + i * 4 < 512; i++) {
    const sec = view.getUint32(76 + i * 4, true);
    if (sec < 0xfffffffa) fatSectors.push(sec);
  }

  const fat: number[] = [];
  for (const sec of fatSectors) {
    const secOffset = (sec + 1) * sectorSize;
    if (secOffset + sectorSize > bytes.length) break;
    for (let i = 0; i < sectorSize; i += 4) {
      fat.push(view.getUint32(secOffset + i, true));
    }
  }

  let dirSec = firstDirSector;
  const dirBytes: Uint8Array[] = [];
  let visited = 0;
  while (dirSec < 0xfffffffa && visited++ < 1024) {
    const offset = (dirSec + 1) * sectorSize;
    if (offset + sectorSize > bytes.length) break;
    dirBytes.push(bytes.subarray(offset, offset + sectorSize));
    dirSec = fat[dirSec] ?? 0xfffffffe;
  }
  const allDir = new Uint8Array(dirBytes.reduce((acc, c) => acc + c.length, 0));
  let cur = 0;
  for (const c of dirBytes) { allDir.set(c, cur); cur += c.length; }

  const dirView = new DataView(allDir.buffer, allDir.byteOffset, allDir.byteLength);
  for (let i = 0; i + 128 <= allDir.length; i += 128) {
    const nameLen = dirView.getUint16(i + 64, true);
    if (nameLen < 2 || nameLen > 64) continue;
    let name = '';
    for (let c = 0; c < nameLen - 2; c += 2) {
      name += String.fromCharCode(dirView.getUint16(i + c, true));
    }
    if (name.toLowerCase() === streamName.toLowerCase()) {
      const startSec = dirView.getUint32(i + 116, true);
      const streamSize = dirView.getUint32(i + 120, true);
      const streamChunks: Uint8Array[] = [];
      let s = startSec;
      let sVisited = 0;
      let bytesLeft = streamSize;
      while (s < 0xfffffffa && sVisited++ < 65536 && bytesLeft > 0) {
        const off = (s + 1) * sectorSize;
        if (off >= bytes.length) break;
        const take = Math.min(sectorSize, bytesLeft, bytes.length - off);
        streamChunks.push(bytes.subarray(off, off + take));
        bytesLeft -= take;
        s = fat[s] ?? 0xfffffffe;
      }
      const streamData = new Uint8Array(streamChunks.reduce((acc, c) => acc + c.length, 0));
      let scur = 0;
      for (const c of streamChunks) { streamData.set(c, scur); scur += c.length; }
      return streamData;
    }
  }
  return null;
}

function parseBiff8Workbook(stream: Uint8Array): SheetData[] {
  const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
  const u32 = (b: Uint8Array, o: number) => ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0);

  function readBiffString(b: Uint8Array, offset: number, rich = false): { value: string; end: number } {
    if (offset + 3 > b.length) return { value: '', end: b.length };
    const length = u16(b, offset);
    const flags = b[offset + 2];
    let cursor = offset + 3;
    if (flags & 0x08) cursor += 2;
    if (flags & 0x04) cursor += 4;
    const isUnicode = (flags & 1) !== 0;
    const size = isUnicode ? length * 2 : length;
    if (cursor + size > b.length) return { value: '', end: b.length };
    const val = new TextDecoder(isUnicode ? 'utf-16le' : 'latin1').decode(b.subarray(cursor, cursor + size));
    const end = cursor + size + (rich ? (flags & 0x08 ? u16(b, offset + 3) * 4 : 0) : 0);
    return { value: val, end };
  }

  function recordsFrom(b: Uint8Array, start: number, end = b.length) {
    const recs: { type: number; data: Uint8Array; offset: number }[] = [];
    for (let off = start; off + 4 <= end;) {
      const type = u16(b, off);
      const len = u16(b, off + 2);
      const dStart = off + 4;
      const dEnd = dStart + len;
      if (dEnd > end) break;
      recs.push({ type, data: b.slice(dStart, dEnd), offset: off });
      off = dEnd;
    }
    return recs;
  }

  const records = recordsFrom(stream, 0);
  const bounds: { offset: number; name: string }[] = [];
  const sst: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.type === 0x00fc) {
      const chunks: Uint8Array[] = [];
      for (let j = i; j < records.length && (j === i || records[j].type === 0x003c); j++) {
        chunks.push(records[j].data);
      }
      const sstBytes = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
      let o = 0;
      for (const c of chunks) { sstBytes.set(c, o); o += c.length; }
      if (sstBytes.length >= 8) {
        const count = Math.min(u32(sstBytes, 4), 100000);
        let cur = 8;
        for (let k = 0; k < count && cur + 3 <= sstBytes.length; k++) {
          const parsed = readBiffString(sstBytes, cur, true);
          if (parsed.end <= cur || parsed.end > sstBytes.length) break;
          sst.push(parsed.value);
          cur = parsed.end;
        }
      }
    }
    if (record.type === 0x0085 && record.data.length >= 8) {
      const name = readBiffString(record.data, 6).value || `Sheet ${bounds.length + 1}`;
      bounds.push({ offset: u32(record.data, 0), name });
    }
  }

  const sheets: SheetData[] = [];
  for (const bound of bounds) {
    const sheetRecords = recordsFrom(stream, bound.offset);
    const cells = new Map<number, Map<number, string>>();
    for (const record of sheetRecords) {
      if (record.type === 0x000a) break;
      const data = record.data;
      if (data.length < 6) continue;
      const row = u16(data, 0);
      const col = u16(data, 2);
      if (row >= 5000 || col >= 100) continue;
      let val = '';
      if (record.type === 0x00fd && data.length >= 10) {
        val = sst[u32(data, 6)] || '';
      } else if (record.type === 0x0204) {
        val = readBiffString(data, 6).value;
      } else if (record.type === 0x0203 && data.length >= 14) {
        val = String(new DataView(data.buffer, data.byteOffset + 6, 8).getFloat64(0, true));
      } else if (record.type === 0x027e && data.length >= 10) {
        const raw = u32(data, 6);
        val = String(raw & 1 ? raw >> 2 : (raw >>> 2));
      } else if (record.type === 0x0205 && data.length >= 8) {
        val = data[6] ? 'TRUE' : 'FALSE';
      } else if (record.type === 0x0006 && data.length >= 14) {
        val = String(new DataView(data.buffer, data.byteOffset + 6, 8).getFloat64(0, true));
      } else continue;

      if (!cells.has(row)) cells.set(row, new Map());
      cells.get(row)!.set(col, val);
    }
    const sortedRowIndices = [...cells.keys()].sort((a, b) => a - b);
    const allColKeys = [...cells.values()].flatMap(r => [...r.keys()]);
    const maxCol = Math.min(100, (allColKeys.length > 0 ? Math.max(...allColKeys) : 0) + 1);
    const rows: string[][] = sortedRowIndices.map(r => {
      const rowMap = cells.get(r)!;
      return Array.from({ length: maxCol }, (_, c) => rowMap.get(c) || '');
    });
    if (rows.length > 0) {
      const headers = rows[0] || [];
      sheets.push({
        name: bound.name,
        headers,
        rows: rows.slice(1),
        rowCount: rows.length,
        columnCount: headers.length,
      });
    }
  }
  return sheets;
}
