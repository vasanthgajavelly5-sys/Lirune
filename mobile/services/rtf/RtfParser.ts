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

/**
 * Strip an RTF group starting at index `start` (which should point to `{`).
 * Returns the index after the closing `}`.
 */
function stripRtfGroup(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

/** Remove ignorable destinations such as Word's generator and private groups. */
function removeIgnorableDestinationGroups(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{' && /^\{\\\*\\[a-z]+/i.test(text.slice(i))) {
      i = stripRtfGroup(text, i);
      continue;
    }
    result += text[i];
    i++;
  }
  return result;
}

/**
 * Remove all top-level RTF groups whose control word matches any of the given names.
 * Handles arbitrarily nested braces correctly.
 */
function removeRtfHeaderGroups(text: string, groupNames: string[]): string {
  const pattern = new RegExp(`^\\{\\\\(${groupNames.join('|')})\\b`, 'i');
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      // Look ahead at the control word
      const slice = text.slice(i);
      if (pattern.test(slice)) {
        // Skip entire group
        i = stripRtfGroup(text, i);
        continue;
      }
    }
    result += text[i];
    i++;
  }
  return result;
}

export class RtfParser {
  static parse(input: string | Uint8Array): ParsedRtf {
    const rtfText = typeof input === 'string' ? input : new TextDecoder('latin1').decode(input);
    // 1. Title/Author heuristic
    let title = 'Untitled RTF';
    let author = 'Unknown Author';

    const titleMatch = rtfText.match(/\{\\info[\s\S]*?\{\\title\s+([^}]+)\}/i);
    if (titleMatch && titleMatch[1].trim()) title = titleMatch[1].trim();

    const authorMatch = rtfText.match(/\{\\info[\s\S]*?\{\\author\s+([^}]+)\}/i);
    if (authorMatch && authorMatch[1].trim()) author = authorMatch[1].trim();

    // 2. Remove RTF header groups that contain no body text
    let cleaned = removeIgnorableDestinationGroups(rtfText);
    cleaned = removeRtfHeaderGroups(cleaned, [
      'fonttbl', 'colortbl', 'stylesheet', 'info',
      'header', 'footer', 'headerl', 'headerr', 'headerf',
      'footerl', 'footerr', 'footerf', 'listtable', 'listoverridetable',
      'rsidtbl', 'mmathPr', 'themedata', 'colorschememapping',
      'datastore', 'latentstyles', 'nonesttables', 'expandedcolortbl',
    ]);

    // Strip only the root marker. The remaining root control words are removed below;
    // consuming through the next brace can erase the entire body after group cleanup.
    cleaned = cleaned.replace(/^\{\\rtf1\b/i, '').replace(/\}$/, '');

    // Convert unicode escapes: \u1234? -> character
    cleaned = cleaned.replace(/\\u(-?\d+)\??/g, (_, codeStr) => {
      let code = parseInt(codeStr, 10);
      if (code < 0) code += 65536;
      return String.fromCharCode(code);
    });

    // Convert hex escapes: \'e9 -> character
    cleaned = cleaned.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      return new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(hex, 16)]));
    });

    const punctuation: Record<string, string> = {
      lquote: '‘',
      rquote: '’',
      ldblquote: '“',
      rdblquote: '”',
      emdash: '—',
      endash: '–',
      bullet: '•',
      tab: '\t',
    };
    cleaned = cleaned.replace(/\\(lquote|rquote|ldblquote|rdblquote|emdash|endash|bullet|tab)\b\s?/g, (_, word: string) => punctuation[word]);

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

      // Remove other control words: \word or \word123
      pText = pText.replace(/\\[a-zA-Z]+(-?\d+)?\s?/g, '');
      // Remove braces
      pText = pText.replace(/[{}]/g, '').trim();

      // Filter out lines that are clearly still RTF header garbage (semicolons, all-caps junk)
      if (pText.length > 0 && !/^[A-Z0-9 ;,.*\\-]{20,}$/.test(pText)) {
        const escaped = pText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        htmlParagraphs.push(`<p>${escaped}</p>`);
      }
    }

    const fullHtml = htmlParagraphs.join('\n') || '<p>Empty RTF document.</p>';

    return {
      metadata: { title, author },
      html: fullHtml,
    };
  }
}
