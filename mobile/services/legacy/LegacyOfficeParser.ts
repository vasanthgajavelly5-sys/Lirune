/**
 * Read-only fallback parser for legacy OLE office files.
 *
 * Legacy Word, Excel, PowerPoint, and WPS files share the CFBF/OLE container.
 * The parser deliberately extracts only printable text and never evaluates
 * macros, embedded objects, formulas, or external links.
 */

export type LegacyOfficeFormat = 'doc' | 'xls' | 'ppt' | 'pps' | 'wps';

export interface ParsedLegacyOffice {
  title: string;
  html: string;
}

const LABELS: Record<LegacyOfficeFormat, string> = {
  doc: 'Word document',
  xls: 'Excel workbook',
  ppt: 'PowerPoint presentation',
  pps: 'PowerPoint slide show',
  wps: 'WPS document',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isOle(bytes: Uint8Array): boolean {
  return bytes.length >= 8
    && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
}

function extractText(bytes: Uint8Array): string[] {
  const runs: string[] = [];
  let run = '';
  const flush = () => {
    const value = run.trim();
    if (value.length >= 3 && /[a-zA-Z0-9]/.test(value)) runs.push(value);
    run = '';
  };

  for (let index = 512; index < bytes.length;) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const code = first | (second << 8);
    const isPrintableUtf16 = (code === 9 || code === 10 || code === 13 || (code >= 0x0020 && code <= 0x007E) || (code >= 0x00A0 && code <= 0xD7FF) || (code >= 0xE000 && code <= 0xFFFD));

    if (isPrintableUtf16 && (second !== 0 || (first >= 32 && first <= 126) || first === 9 || first === 10 || first === 13)) {
      if (code === 10 || code === 13) flush();
      else run += String.fromCharCode(code);
      index += 2;
    } else if (first >= 32 && first <= 126) {
      run += String.fromCharCode(first);
      index += 1;
    } else {
      flush();
      if (first === 0 && second === 0) {
        index += 2;
      } else {
        index += 1;
      }
    }
  }
  flush();

  const ignored = new Set([
    'WordDocument', 'Workbook', 'PowerPoint Document', 'Microsoft Word',
    'Microsoft Excel', 'Microsoft PowerPoint', 'ObjectPool', 'SummaryInformation',
    'DocumentSummaryInformation', 'CompObj', 'Macros', 'VBA', 'Normal',
  ]);
  return runs
    .filter((value) => !ignored.has(value))
    .filter((value) => !/^[A-Z0-9]{2,8}$/.test(value) || /[AEIOU]/i.test(value))
    .map((value) => value.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 10000);
}

export class LegacyOfficeParser {
  static parse(bytes: Uint8Array, format: LegacyOfficeFormat): ParsedLegacyOffice {
    const label = LABELS[format];
    if (!isOle(bytes)) throw new Error(`Invalid ${label}: expected an OLE compound document.`);
    const paragraphs = extractText(bytes);
    if (!paragraphs.length) throw new Error(`The ${label} contains no readable text.`);
    return {
      title: label,
      html: paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n'),
    };
  }
}
