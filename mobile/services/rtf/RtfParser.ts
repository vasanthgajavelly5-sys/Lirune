/**
 * Lirune Reader Mobile — Pure TypeScript RTF (Rich Text Format) Parser
 * Converts RTF tokens, unicode escapes, bold/italic styles, and paragraphs into HTML.
 */

export interface RtfMetadata {
  title: string;
  author: string;
}

export interface ParsedRtf {
  metadata: RtfMetadata;
  html: string;
}

export class RtfParser {
  static parse(input: string | Uint8Array): ParsedRtf {
    const rtfText = typeof input === 'string' ? input : new TextDecoder('latin1').decode(input);
    // 1. Title/Author heuristic
    let title = 'Untitled RTF';
    let author = 'Unknown Author';

    const titleMatch = rtfText.match(/{\\info[\s\S]*?{\\title\s+([^}]+)}/i);
    if (titleMatch && titleMatch[1].trim()) title = titleMatch[1].trim();

    const authorMatch = rtfText.match(/{\\info[\s\S]*?{\\author\s+([^}]+)}/i);
    if (authorMatch && authorMatch[1].trim()) author = authorMatch[1].trim();

    // 2. Tokenize and parse RTF body
    // Remove headers: fonttbl, colortbl, stylesheet, info
    let cleaned = rtfText
      .replace(/{\\fonttbl[\s\S]*?}/gi, '')
      .replace(/{\\colortbl[\s\S]*?}/gi, '')
      .replace(/{\\stylesheet[\s\S]*?}/gi, '')
      .replace(/{\\info[\s\S]*?}/gi, '');

    // Convert unicode escapes: \u1234? -> character
    cleaned = cleaned.replace(/\\u(-?\d+)\??/g, (_, codeStr) => {
      let code = parseInt(codeStr, 10);
      if (code < 0) code += 65536;
      return String.fromCharCode(code);
    });

    // Convert hex escapes: \'e9 -> character
    cleaned = cleaned.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    // Convert paragraphs: \par
    const paragraphs = cleaned.split(/\\par\b/gi);
    const htmlParagraphs: string[] = [];

    for (const p of paragraphs) {
      // Bold tags
      let pText = p
        .replace(/\\b\s+/g, '<b>')
        .replace(/\\b0\b/g, '</b>')
        .replace(/\\i\s+/g, '<i>')
        .replace(/\\i0\b/g, '</i>');

      // Remove other control words: \word
      pText = pText.replace(/\\[a-zA-Z]+(-?\d+)?\s?/g, '');
      // Remove braces
      pText = pText.replace(/[{}]/g, '').trim();

      if (pText.length > 0) {
        htmlParagraphs.push(`<p>${pText}</p>`);
      }
    }

    const fullHtml = htmlParagraphs.join('\n') || '<p>Empty RTF document.</p>';

    return {
      metadata: { title, author },
      html: fullHtml,
    };
  }
}
