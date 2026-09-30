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

    if (isOle) {
      // Extract textual characters from the WordDocument stream by looking for text runs.
      // Word 97-2003 stores text either as 8-bit CP1252 or 16-bit UTF-16LE.
      const textParts: string[] = [];
      let currentRun = '';

      // Skip 512-byte OLE header
      let i = 512;
      while (i < bytes.length - 1) {
        const b1 = bytes[i];
        const b2 = bytes[i + 1];

        // Check for printable UTF-16LE ASCII character (b2 === 0 and b1 is printable ASCII or newline)
        if (b2 === 0 && ((b1 >= 32 && b1 <= 126) || b1 === 10 || b1 === 13 || b1 === 9)) {
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
          // Printable ASCII 8-bit run
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

      // Filter out binary metadata garbage: keep runs that have real words
      const validParagraphs = textParts.filter((p) => {
        if (p.length < 3) return false;
        // Ignore internal Word object strings like "Normal", "Default Paragraph Font", "Table Grid"
        if (/^(Normal|Default Paragraph Font|Table Grid|Times New Roman|Arial|Calibri)$/i.test(p)) return false;
        return /[a-zA-Z0-9]/.test(p);
      });

      textContent = validParagraphs.map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('\n');
    } else {
      // Fallback text decode
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      textContent = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => `<p>${l}</p>`).join('\n');
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
