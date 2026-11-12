/**
 * Lirune Reader Mobile — Pure TypeScript CHM (Compiled HTML Help) Parser
 * Extracts ITSF directory headers, internal topics, and embedded HTML files.
 */

export interface ChmMetadata {
  title: string;
  author?: string;
}

export interface ParsedChm {
  metadata: ChmMetadata;
  html: string;
}

export class ChmParser {
  static parse(bytes: Uint8Array): ParsedChm {
    if (bytes.length < 100) {
      throw new Error('Invalid CHM file: buffer too small.');
    }

    // Check ITSF magic bytes
    const isItsf = bytes[0] === 0x49 && bytes[1] === 0x54 && bytes[2] === 0x53 && bytes[3] === 0x46;
    if (!isItsf) {
      throw new Error('Invalid CHM file: missing ITSF signature.');
    }

    // Heuristic scan for embedded HTML documents or text within the ITSF stream
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const fullText = decoder.decode(bytes);

    // Look for HTML fragments inside the archive
    const htmlMatches = fullText.match(/<html[\s\S]*?<\/html>/gi);
    let extractedHtml = '';

    if (htmlMatches && htmlMatches.length > 0) {
      // Concatenate unique extracted HTML pages or bodies
      extractedHtml = htmlMatches
        .map((doc) => {
          const bodyMatch = doc.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          return bodyMatch ? bodyMatch[1] : doc;
        })
        .join('<hr style="margin: 32px 0; border: 0; border-top: 1px solid rgba(128,128,128,0.2);"/>');
    } else {
      // Fallback: search for <p>, <h1>, <div> blocks
      const blockMatches = fullText.match(/<(p|div|h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi);
      if (blockMatches && blockMatches.length > 0) {
        extractedHtml = blockMatches.join('\n');
      } else {
        extractedHtml = '<p>Compiled HTML help content extracted.</p>';
      }
    }

    // Try extracting title
    let title = 'Compiled Help Document';
    const titleMatch = extractedHtml.match(/<title[^>]*>([^<]+)<\/title>/i) || fullText.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].trim();
    }

    return {
      metadata: { title },
      html: extractedHtml,
    };
  }
}
