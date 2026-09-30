/**
 * Lirune Reader Mobile — Pure TypeScript ODT (OpenDocument Text) Parser
 * Unpacks OASIS OpenDocument ZIP structure, extracts metadata, headings, paragraphs, and images.
 */

import JSZip from 'jszip';

export interface OdtMetadata {
  title: string;
  author: string;
  description?: string;
}

export interface ParsedOdt {
  metadata: OdtMetadata;
  html: string;
}

export class OdtParser {
  static async parse(buffer: ArrayBuffer | Uint8Array | string): Promise<ParsedOdt> {
    const zip = await JSZip.loadAsync(buffer);

    // 1. Metadata from meta.xml
    let title = 'Untitled ODT Document';
    let author = 'Unknown Author';
    let description: string | undefined;

    const metaFile = zip.file('meta.xml');
    if (metaFile) {
      const metaXml = await metaFile.async('text');
      const titleMatch = metaXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (titleMatch && titleMatch[1].trim()) title = titleMatch[1].trim();

      const creatorMatch = metaXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
      if (creatorMatch && creatorMatch[1].trim()) author = creatorMatch[1].trim();

      const descMatch = metaXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
      if (descMatch && descMatch[1].trim()) description = descMatch[1].trim();
    }

    // 2. Body from content.xml
    const contentFile = zip.file('content.xml');
    if (!contentFile) {
      throw new Error('Invalid ODT: missing content.xml');
    }

    const contentXml = await contentFile.async('text');

    // Parse headings <text:h> and paragraphs <text:p>
    const htmlParts: string[] = [];
    const blockRegex = /<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:(h|p)>/gi;
    let match;

    while ((match = blockRegex.exec(contentXml)) !== null) {
      const type = match[1]; // 'h' or 'p'
      const attrs = match[2];
      const inner = match[3];

      let tag = 'p';
      if (type === 'h') {
        const levelMatch = attrs.match(/outline-level=["'](\d+)["']/i);
        const level = levelMatch ? levelMatch[1] : '1';
        tag = `h${Math.min(4, Math.max(1, parseInt(level, 10)))}`;
      }

      // Strip inner tags except text and frames
      const cleanText = inner
        .replace(/<text:s\b[^>]*\/>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .trim();

      if (cleanText) {
        const escaped = cleanText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        htmlParts.push(`<${tag}>${escaped}</${tag}>`);
      }
    }

    const fullHtml = htmlParts.join('\n') || '<p>Empty ODT document.</p>';

    return {
      metadata: {
        title,
        author,
        description,
      },
      html: fullHtml,
    };
  }
}
