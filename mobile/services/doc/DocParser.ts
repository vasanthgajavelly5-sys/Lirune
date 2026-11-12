/**
 * Lirune Reader Mobile — Pure TypeScript Microsoft Word 97-2003 (.doc) Parser
 * Extracts text content and paragraphs from Compound Document Binary Format (CFBF/OLE2).
 */

export interface DocMetadata {
  title: string;
  author: string;
}

export interface ParsedDoc {
  metadata: DocMetadata;
  html: string;
}

export class DocParser {
  static parse(bytes: Uint8Array): ParsedDoc {
    if (bytes.length < 512) {
      throw new Error('Invalid DOC file: file too small.');
    }

    // Check OLE2 header: 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
    const isOle =
      bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 &&
      bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1;

    let textContent = '';

    // Known Word internal metadata strings to discard completely
    const WORD_INTERNAL = new Set([
      'bjbj', 'ObjectPool', 'WordDocument', 'CompObj', 'DocumentSummaryInformation',
      'SummaryInformation', '1Table', '0Table', 'Data', 'Macros', 'VBA', 'Normal',
      'Default Paragraph Font', 'Table Grid', 'Times New Roman', 'Arial', 'Calibri',
      'Courier New', 'Symbol', 'Wingdings', 'Microsoft Word', 'MSWD', 'Word.Document',
    ]);

    if (isOle) {
      // Extract textual characters from the WordDocument stream.
      // Word 97-2003 stores text as 16-bit UTF-16LE or 8-bit CP1252.
      const textParts: string[] = [];
      let currentRun = '';

      // Skip 512-byte OLE header
      let i = 512;
      while (i < bytes.length - 1) {
        const b1 = bytes[i];
        const b2 = bytes[i + 1];

        if (b2 === 0 && ((b1 >= 32 && b1 <= 126) || b1 === 10 || b1 === 13 || b1 === 9)) {
          // UTF-16LE printable character
          if (b1 === 13 || b1 === 10) {
            if (currentRun.trim().length > 0) {
              textParts.push(currentRun.trim());
              currentRun = '';
            }
          } else {
            currentRun += String.fromCharCode(b1);
          }
          i += 2;
        } else if (b1 >= 32 && b1 <= 126) {
          // Printable ASCII 8-bit character
          currentRun += String.fromCharCode(b1);
          i += 1;
        } else {
          if (currentRun.trim().length > 3) {
            textParts.push(currentRun.trim());
          }
          currentRun = '';
          i += 1;
        }
      }

      if (currentRun.trim().length > 3) {
        textParts.push(currentRun.trim());
      }

      // Filter and clean extracted text runs
      const validParagraphs = textParts
        .filter((p) => {
          if (p.length < 3) return false;
          if (WORD_INTERNAL.has(p) || WORD_INTERNAL.has(p.trim())) return false;
          // Discard short all-caps/no-vowel binary metadata strings
          if (/^[A-Z0-9]{2,8}$/.test(p) && !/[aeiouAEIOU]/.test(p)) return false;
          if (!/[a-zA-Z0-9]/.test(p)) return false;
          return true;
        })
        .map((p) => {
          // Strip Word field codes: HYPERLINK "url" \h
          p = p.replace(/HYPERLINK\s+"[^"]*"\s*(\\[a-z]*)*/gi, '');
          p = p.replace(/HYPERLINK\s+\S+\s*(\\[a-z]*)*/gi, '');
          // Strip standalone field modifier sequences (\h, \l, \o, etc.)
          p = p.replace(/\\[a-zA-Z]\b\s*/g, '');
          return p.trim();
        })
        .filter((p) => p.length > 0);

      textContent = validParagraphs
        .map((p) => {
          const escaped = p
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<p>${escaped}</p>`;
        })
        .join('\n');
    } else {
      // Fallback: plain text decode
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      textContent = raw
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => {
          const esc = l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<p>${esc}</p>`;
        })
        .join('\n');
    }

    const fullHtml = textContent || '<p>Empty Word document.</p>';

    return {
      metadata: {
        title: 'Word Document',
        author: 'Unknown Author',
      },
      html: fullHtml,
    };
  }
}
