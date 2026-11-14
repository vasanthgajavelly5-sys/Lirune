/**
 * Lirune Reader Mobile — Pure TypeScript PPTX (PowerPoint Open XML) Parser
 * Unpacks ECMA-376 PPTX ZIP structure, extracts slide order, text, and images.
 * Models the existing DocxParser.ts pattern exactly.
 * Zero new dependencies — uses bundled jszip.
 *
 * Security:
 * - Only reads declared ZIP entries; no path traversal.
 * - All text is HTML-escaped before embedding.
 * - Images are embedded as data URLs from verified ZIP entries only.
 * - Macro/VBA entries (ppt/vbaProject.bin) are ignored and never executed.
 * - External relationships (non-data URLs, http:// etc.) are stripped.
 */

import JSZip from 'jszip';
import { validateZipArchive } from '../security/archiveBudget.ts';

export interface PptxMetadata {
  title: string;
  author: string;
  description?: string;
  slideCount: number;
}

export interface PptxSlide {
  index: number;
  /** Rendered safe HTML snippet for this slide */
  html: string;
}

export interface ParsedPptx {
  metadata: PptxMetadata;
  slides: PptxSlide[];
  /** All slides concatenated — used as combined reader HTML */
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

function extractTextRuns(xml: string): string {
  // Collect text from <a:t> (DrawingML text) and <a:r><a:t> run elements
  const runs: string[] = [];
  const tRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi;
  let m: RegExpExecArray | null;
  while ((m = tRegex.exec(xml)) !== null) {
    const text = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (text.trim()) runs.push(text.trim());
  }
  return runs.join(' ');
}

export class PptxParser {
  static async parse(buffer: ArrayBuffer | Uint8Array | string): Promise<ParsedPptx> {
    const zip =
      typeof buffer === 'string'
        ? await JSZip.loadAsync(buffer, { base64: true })
        : await JSZip.loadAsync(buffer);
    validateZipArchive(zip);

    // 1. Metadata from docProps/core.xml
    let title = 'Untitled Presentation';
    let author = 'Unknown Author';
    let description: string | undefined;

    const coreFile = zip.file('docProps/core.xml');
    if (coreFile) {
      const coreXml = await coreFile.async('text');
      const titleMatch = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (titleMatch?.[1]?.trim()) title = titleMatch[1].trim();

      const creatorMatch = coreXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
      if (creatorMatch?.[1]?.trim()) author = creatorMatch[1].trim();

      const descMatch = coreXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
      if (descMatch?.[1]?.trim()) description = descMatch[1].trim();
    }

    // 2. Slide order from ppt/presentation.xml
    const presFile = zip.file('ppt/presentation.xml');
    if (!presFile) throw new Error('Invalid PPTX: missing ppt/presentation.xml');

    const presXml = await presFile.async('text');

    // Extract slide IDs in order: <p:sldIdLst><p:sldId id="..." r:id="rId2"/></p:sldIdLst>
    const rIds: string[] = [];
    const sldIdRegex = /<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*>/gi;
    let sldIdMatch: RegExpExecArray | null;
    while ((sldIdMatch = sldIdRegex.exec(presXml)) !== null) {
      rIds.push(sldIdMatch[1]);
    }

    // 3. Resolve rIds → slide paths via ppt/_rels/presentation.xml.rels
    const relsFile = zip.file('ppt/_rels/presentation.xml.rels');
    const slidePathMap: Record<string, string> = {};
    if (relsFile) {
      const relsXml = await relsFile.async('text');
      const relRegex =
        /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*>/gi;
      let relMatch: RegExpExecArray | null;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        // Target is relative to ppt/ — normalize
        const target = relMatch[2].startsWith('/')
          ? relMatch[2].slice(1)
          : `ppt/${relMatch[2]}`;
        slidePathMap[relMatch[1]] = target;
      }
    }

    const slidePaths = rIds
      .map(id => slidePathMap[id])
      .filter(Boolean) as string[];

    // If we could not resolve via presentation.xml.rels, fall back to listing slide files
    if (slidePaths.length === 0) {
      const allKeys = Object.keys(zip.files);
      const fallback = allKeys
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)?.[0] ?? '0');
          const nb = parseInt(b.match(/\d+/)?.[0] ?? '0');
          return na - nb;
        });
      slidePaths.push(...fallback);
    }

    // 4. Parse each slide
    const slides: PptxSlide[] = [];

    for (let i = 0; i < slidePaths.length; i++) {
      const slidePath = slidePaths[i];
      const slideFile = zip.file(slidePath);
      if (!slideFile) continue;

      const slideXml = await slideFile.async('text');
      const slideIndex = i + 1;
      const htmlParts: string[] = [
        `<div class="lirune-slide" data-slide="${slideIndex}">`,
        `<div class="lirune-slide-number">Slide ${slideIndex}</div>`,
      ];

      // Build image map for this slide via _rels/slide{N}.xml.rels
      const slideRelPath = slidePath.replace(
        /slides\/slide(\d+)\.xml/,
        'slides/_rels/slide$1.xml.rels'
      );
      const slideRelsFile = zip.file(slideRelPath);
      const slideImageMap: Record<string, string> = {};
      if (slideRelsFile) {
        const relsXml = await slideRelsFile.async('text');
        const relRegex =
          /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*>/gi;
        let rm: RegExpExecArray | null;
        while ((rm = relRegex.exec(relsXml)) !== null) {
          const target = rm[2];
          // Only embed internal media entries
          if (!target.startsWith('http') && !target.startsWith('//')) {
            const mediaPath = target.startsWith('/')
              ? target.slice(1)
              : slidePath.replace(/[^/]+$/, '') + target;
            const mediaFile = zip.file(mediaPath);
            if (mediaFile) {
              const ext = mediaPath.split('.').pop()?.toLowerCase() ?? 'png';
              const mimeMap: Record<string, string> = {
                png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
                svg: 'image/svg+xml', avif: 'image/avif',
              };
              try {
                const b64 = await mediaFile.async('base64');
                slideImageMap[rm[1]] = `data:${mimeMap[ext] ?? 'image/png'};base64,${b64}`;
              } catch {
                // skip
              }
            }
          }
        }
      }

      // Extract paragraphs <a:p> → title/body text
      const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
      let pm: RegExpExecArray | null;
      let isFirst = true;
      while ((pm = pRegex.exec(slideXml)) !== null) {
        const text = extractTextRuns(pm[1]);
        if (!text) continue;
        if (isFirst) {
          htmlParts.push(`<h3 class="lirune-slide-title">${escapeHtml(text)}</h3>`);
          isFirst = false;
        } else {
          htmlParts.push(`<p class="lirune-slide-text">${escapeHtml(text)}</p>`);
        }
      }

      // Embedded images: <p:blipFill><a:blip r:embed="rIdN"/>
      const blipRegex = /<a:blip\b[^>]*\br:embed="([^"]+)"[^>]*>/gi;
      let blipMatch: RegExpExecArray | null;
      while ((blipMatch = blipRegex.exec(slideXml)) !== null) {
        const src = slideImageMap[blipMatch[1]];
        if (src) {
          htmlParts.push(
            `<img class="lirune-slide-image" src="${src}" alt="" loading="lazy" />`
          );
        }
      }

      htmlParts.push('</div>');
      slides.push({ index: slideIndex, html: htmlParts.join('\n') });
    }

    const html = slides.map(s => s.html).join('\n');

    return {
      metadata: { title, author, description, slideCount: slides.length },
      slides,
      html,
    };
  }
}
