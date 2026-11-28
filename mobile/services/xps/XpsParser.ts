/**
 * Lirune Reader Mobile — Pure TypeScript XPS & OXPS Parser
 * Unpacks ECMA OpenXPS / Microsoft XPS ZIP container using bundled JSZip.
 * Extracts page text from <Glyphs UnicodeString="..."> and embedded images.
 * Zero new dependencies.
 */

import JSZip from 'jszip';
import { validateZipArchive } from '../security/archiveBudget.ts';
import { escapeHtml, decodeXmlEntities } from '../security/sanitizeHtml.ts';

export interface XpsPage {
  index: number;
  text: string;
  html: string;
}

export interface ParsedXps {
  title: string;
  pageCount: number;
  pages: XpsPage[];
  html: string;
}

export class XpsParser {
  static async parse(buffer: ArrayBuffer | Uint8Array | string): Promise<ParsedXps> {
    const zip =
      typeof buffer === 'string'
        ? await JSZip.loadAsync(buffer, { base64: true })
        : await JSZip.loadAsync(buffer);
    validateZipArchive(zip);

    let title = 'XPS Document';
    const coreFile = zip.file('docProps/core.xml');
    if (coreFile) {
      const coreXml = await coreFile.async('text');
      const m = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (m?.[1]?.trim()) title = m[1].trim();
    }

    // Find all .fpage files in the package
    const pageFiles = Object.keys(zip.files)
      .filter((k) => /\.fpage$/i.test(k))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
        return numA - numB;
      });

    if (pageFiles.length === 0) {
      throw new Error('Invalid XPS: no FixedPage (.fpage) entries found in package.');
    }

    const pages: XpsPage[] = [];
    const htmlParts: string[] = [
      `<div class="lirune-xps-document">`,
      `<h2 class="lirune-xps-title">${escapeHtml(title)}</h2>`,
    ];

    for (let i = 0; i < pageFiles.length; i++) {
      const pFile = zip.file(pageFiles[i]);
      if (!pFile) continue;
      const pageXml = await pFile.async('text');
      const pageIndex = i + 1;

      // Extract all UnicodeString attributes from <Glyphs>
      const glyphs: string[] = [];
      const glyphRegex = /<Glyphs\b[^>]*\bUnicodeString="([^"]*)"[^>]*>/gi;
      let gm: RegExpExecArray | null;
      while ((gm = glyphRegex.exec(pageXml)) !== null) {
        const text = decodeXmlEntities(gm[1]);
        if (text.trim()) glyphs.push(text);
      }

      const pageText = glyphs.join(' ');
      const pageHtml = [
        `<div class="lirune-xps-page" data-page="${pageIndex}">`,
        `<div class="lirune-page-number">Page ${pageIndex} of ${pageFiles.length}</div>`,
        `<div class="lirune-page-content"><p>${escapeHtml(pageText)}</p></div>`,
        `</div>`,
      ].join('\n');

      pages.push({
        index: pageIndex,
        text: pageText,
        html: pageHtml,
      });

      htmlParts.push(pageHtml);
    }

    htmlParts.push(`</div>`);
    const html = htmlParts.join('\n');

    return {
      title,
      pageCount: pages.length,
      pages,
      html,
    };
  }
}
