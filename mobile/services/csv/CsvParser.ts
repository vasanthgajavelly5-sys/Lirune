/**
 * Lirune Reader Mobile — Pure TypeScript CSV / TSV Parser
 * RFC 4180-compliant delimiter-detected parser.
 * Zero dependencies — works identically in Electron renderer and React Native JS context.
 *
 * Security:
 * - Row count limit: prevents memory exhaustion from huge files.
 * - Column count limit: prevents pathological wide-sheet attacks.
 * - Cell content length limit: prevents rendering extremely long strings.
 * - No formula execution (viewer only).
 */

const MAX_ROWS = 10_000;
const MAX_COLS = 500;
const MAX_CELL_LENGTH = 32_768; // 32 KB per cell

export interface CsvMetadata {
  title: string;
  rowCount: number;
  columnCount: number;
  delimiter: string;
  encoding: string;
}

export interface ParsedCsv {
  metadata: CsvMetadata;
  /** Header row (first data row or column indices) */
  headers: string[];
  /** Data rows — each row is an array of cell strings */
  rows: string[][];
  /** Whether row count was truncated due to MAX_ROWS limit */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Delimiter detection
// ---------------------------------------------------------------------------

function detectDelimiter(sample: string): string {
  const candidates = [',', '\t', ';', '|'];
  const scores: Record<string, number> = {};

  for (const d of candidates) {
    // Count occurrences outside quoted regions in first 20 lines
    const lines = sample.split('\n').slice(0, 20);
    let total = 0;
    for (const line of lines) {
      let inQuote = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuote = !inQuote;
        else if (ch === d && !inQuote) count++;
      }
      total += count;
    }
    scores[d] = total;
  }

  // Pick the delimiter with the highest consistent occurrence
  return candidates.reduce((best, d) => (scores[d] > (scores[best] ?? 0) ? d : best), ',');
}

// ---------------------------------------------------------------------------
// RFC 4180 finite-state-machine parser
// ---------------------------------------------------------------------------

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuote = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        // Peek for escaped quote ("")
        if (i + 1 < len && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === delimiter) {
        row.push(cell.length > MAX_CELL_LENGTH ? cell.slice(0, MAX_CELL_LENGTH) : cell);
        cell = '';
        if (row.length > MAX_COLS) {
          // Truncate extra columns silently
          while (i < len && text[i] !== '\n') i++;
        }
      } else if (ch === '\r') {
        // Skip bare CR (handle \r\n as \n)
      } else if (ch === '\n') {
        row.push(cell.length > MAX_CELL_LENGTH ? cell.slice(0, MAX_CELL_LENGTH) : cell);
        cell = '';
        // Skip empty trailing row
        if (row.some(c => c.trim() !== '') || rows.length === 0) {
          rows.push(row);
        }
        row = [];
        if (rows.length >= MAX_ROWS) break;
      } else {
        cell += ch;
      }
    }
  }

  // Final cell/row
  if (cell || row.length > 0) {
    row.push(cell.length > MAX_CELL_LENGTH ? cell.slice(0, MAX_CELL_LENGTH) : cell);
    if (row.some(c => c.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class CsvParser {
  /**
   * Parses a CSV or TSV buffer into structured rows.
   * @param buffer Raw file bytes.
   * @param forcedDelimiter Override auto-detection (use '\t' for TSV).
   */
  static parse(buffer: ArrayBuffer | Uint8Array, forcedDelimiter?: string): ParsedCsv {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    const delimiter = forcedDelimiter ?? detectDelimiter(text);
    const allRows = parseRows(text, delimiter);

    const truncated = allRows.length >= MAX_ROWS;
    const headers = allRows.length > 0 ? allRows[0] : [];
    const dataRows = allRows.slice(1);

    return {
      metadata: {
        title: 'Spreadsheet',
        rowCount: allRows.length,
        columnCount: headers.length,
        delimiter,
        encoding: 'utf-8',
      },
      headers,
      rows: dataRows,
      truncated,
    };
  }
}
