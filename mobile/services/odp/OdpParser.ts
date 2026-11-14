/**
 * Lirune Reader Mobile — Pure TypeScript ODP (OpenDocument Presentation) Parser
 * Unpacks OASIS ODP ZIP structure, extracts metadata and slide content.
 * Models the existing OdtParser.ts pattern exactly.
 * Zero new dependencies — uses bundled jszip.
 *
 * Security:
 * - Only reads declared ZIP entries; no path traversal.
 * - All text content is HTML-escaped before embedding.
 * - Images are embedded as data URLs from verified ZIP entries only.
 * - Macro/script entries (Basic/, Scripts/) are ignored.
 */

import JSZip from 'jszip';
import { validateZipArchive } from '../security/archiveBudget.ts';

export interface OdpMetadata {
  title: string;
  author: string;
  description?: string;
  slideCount: number;
}

export interface OdpSlide {
  index: number;
  name: string;
  /** Rendered as safe HTML snippet */
  html: string;
}

export interface ParsedOdp {
  metadata: OdpMetadata;
  slides: OdpSlide[];
  /** First slide HTML used as a combined view fallback */
  html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Extract all text nodes recursively from an XML tag's inner content */
function extractText(xml: string): string {
  // Remove all XML tags, leaving only text content
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export class OdpParser {
  static async parse(buffer: ArrayBuffer | Uint8Array | string): Promise<ParsedOdp> {
    const zip =
      typeof buffer === 'string'
        ? await JSZip.loadAsync(buffer, { base64: true })
        : await JSZip.loadAsync(buffer);
    validateZipArchive(zip);

    // 1. Metadata from meta.xml
    let title = 'Untitled Presentation';
    let author = 'Unknown Author';
    let description: string | undefined;

    const metaFile = zip.file('meta.xml');
    if (metaFile) {
      const metaXml = await metaFile.async('text');
      const titleMatch = metaXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (titleMatch?.[1]?.trim()) title = titleMatch[1].trim();

      const creatorMatch = metaXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
      if (creatorMatch?.[1]?.trim()) author = creatorMatch[1].trim();

      const descMatch = metaXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
      if (descMatch?.[1]?.trim()) description = descMatch[1].trim();
    }

    // 2. Build image data-URL map from media entries
    const imageMap: Record<string, string> = {};
    const picturesFiles = Object.keys(zip.files).filter(
      name => name.startsWith('Pictures/') && !zip.files[name].dir
    );
    for (const picPath of picturesFiles) {
      try {
        const ext = picPath.split('.').pop()?.toLowerCase() ?? 'png';
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
          svg: 'image/svg+xml', avif: 'image/avif',
        };
        const mime = mimeMap[ext] ?? 'image/png';
        const b64 = await zip.files[picPath].async('base64');
        imageMap[picPath] = `data:${mime};base64,${b64}`;
      } catch {
        // skip unreadable media
      }
    }

    // 3. Parse slides from content.xml
    const contentFile = zip.file('content.xml');
    if (!contentFile) {
      throw new Error('Invalid ODP: missing content.xml');
    }

    const contentXml = await contentFile.async('text');

    // Each slide is a <draw:page> element
    const slideRegex = /<draw:page\b([^>]*)>([\s\S]*?)<\/draw:page>/gi;
    const slides: OdpSlide[] = [];
    let slideMatch: RegExpExecArray | null;

    while ((slideMatch = slideRegex.exec(contentXml)) !== null) {
      const attrs = slideMatch[1];
      const slideContent = slideMatch[2];
      const slideIndex = slides.length + 1;

      // Extract slide name
      const nameMatch = attrs.match(/draw:name="([^"]+)"/);
      const slideName = nameMatch ? nameMatch[1] : `Slide ${slideIndex}`;

      const htmlParts: string[] = [
        `<div class="lirune-slide" data-slide="${slideIndex}">`,
        `<div class="lirune-slide-number">Slide ${slideIndex}</div>`,
      ];

      // Extract text boxes: <draw:text-box> containing <text:p> and <text:h>
      const textBoxRegex = /<draw:text-box\b[^>]*>([\s\S]*?)<\/draw:text-box>/gi;
      let boxMatch: RegExpExecArray | null;

      while ((boxMatch = textBoxRegex.exec(slideContent)) !== null) {
        const boxContent = boxMatch[1];

        // Headings <text:h>
        const hRegex = /<text:h\b[^>]*>([\s\S]*?)<\/text:h>/gi;
        let hm: RegExpExecArray | null;
        while ((hm = hRegex.exec(boxContent)) !== null) {
          const text = extractText(hm[1]);
          if (text) htmlParts.push(`<h3 class="lirune-slide-heading">${escapeHtml(text)}</h3>`);
        }

        // Paragraphs <text:p>
        const pRegex = /<text:p\b[^>]*>([\s\S]*?)<\/text:p>/gi;
        let pm: RegExpExecArray | null;
        while ((pm = pRegex.exec(boxContent)) !== null) {
          const text = extractText(pm[1]);
          if (text) htmlParts.push(`<p class="lirune-slide-text">${escapeHtml(text)}</p>`);
        }
      }

      // Embedded images: <draw:image xlink:href="Pictures/...">
      const imgRegex = /<draw:image\b[^>]*xlink:href="([^"]+)"[^>]*>/gi;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(slideContent)) !== null) {
        const href = imgMatch[1];
        const src = imageMap[href];
        if (src) {
          htmlParts.push(
            `<img class="lirune-slide-image" src="${src}" alt="" loading="lazy" />`
          );
        }
      }

      htmlParts.push('</div>');
      slides.push({
        index: slideIndex,
        name: slideName,
        html: htmlParts.join('\n'),
      });
    }

    const html = slides.map(s => s.html).join('\n');

    return {
      metadata: { title, author, description, slideCount: slides.length },
      slides,
      html,
    };
  }
}
