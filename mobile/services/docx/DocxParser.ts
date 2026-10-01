/**
 * Lirune Reader Mobile — Pure TypeScript DOCX Parser
 * Unpacks OpenXML ZIP structure, extracts metadata, styles, paragraphs, headings, and images.
 */

import JSZip from 'jszip';

export interface DocxMetadata {
  title: string;
  author: string;
  description?: string;
  coverImage?: string;
}

export interface ParsedDocx {
  metadata: DocxMetadata;
  html: string;
}

export class DocxParser {
  static async parse(buffer: ArrayBuffer | Uint8Array | string): Promise<ParsedDocx> {
    const zip = await JSZip.loadAsync(buffer);

    // 1. Metadata from docProps/core.xml
    let title = 'Untitled Document';
    let author = 'Unknown Author';
    let description: string | undefined;

    const coreFile = zip.file('docProps/core.xml');
    if (coreFile) {
      const coreXml = await coreFile.async('text');
      const titleMatch = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (titleMatch && titleMatch[1].trim()) title = titleMatch[1].trim();

      const creatorMatch = coreXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
      if (creatorMatch && creatorMatch[1].trim()) author = creatorMatch[1].trim();

      const descMatch = coreXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
      if (descMatch && descMatch[1].trim()) description = descMatch[1].trim();
    }

    // 2. Image relationships from word/_rels/document.xml.rels
    const relsMap: Record<string, string> = {};
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      const relsXml = await relsFile.async('text');
      const relMatches = relsXml.matchAll(/<Relationship\b[^>]*\bId=["']([^"']+)["'][^>]*\bTarget=["']([^"']+)["']/gi);
      for (const m of relMatches) {
        relsMap[m[1]] = m[2];
      }
    }

    // 3. Document body from word/document.xml
    const docFile = zip.file('word/document.xml');
    if (!docFile) {
      throw new Error('Invalid DOCX: missing word/document.xml');
    }

    const docXml = await docFile.async('text');

    // Parse paragraphs <w:p>
    const htmlParts: string[] = [];
    const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
    let pMatch;

    while ((pMatch = pRegex.exec(docXml)) !== null) {
      const pContent = pMatch[1];

      // Check heading style
      const styleMatch = pContent.match(/<w:pStyle\b[^>]*\bw:val=["']([^"']+)["']/i);
      const styleVal = styleMatch ? styleMatch[1].toLowerCase() : '';

      let tag = 'p';
      if (styleVal.includes('heading1') || styleVal === '1') tag = 'h1';
      else if (styleVal.includes('heading2') || styleVal === '2') tag = 'h2';
      else if (styleVal.includes('heading3') || styleVal === '3') tag = 'h3';
      else if (styleVal.includes('title')) tag = 'h1';

      // Parse runs <w:r>
      const rRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/gi;
      let rMatch;
      let runHtml = '';

      while ((rMatch = rRegex.exec(pContent)) !== null) {
        const rContent = rMatch[1];
        const isBold = /<w:b\b/i.test(rContent);
        const isItalic = /<w:i\b/i.test(rContent);
        const isUnderline = /<w:u\b/i.test(rContent);

        // Check for embedded blip images
        const blipMatch = rContent.match(/<a:blip\b[^>]*\br:embed=["']([^"']+)["']/i);
        if (blipMatch) {
          const rId = blipMatch[1];
          const target = relsMap[rId];
          if (target) {
            const imgPath = target.startsWith('media/') ? `word/${target}` : `word/${target.replace(/^(\.\.\/)+/, '')}`;
            const imgFile = zip.file(imgPath);
            if (imgFile) {
              const b64 = await imgFile.async('base64');
              const ext = imgPath.split('.').pop() || 'png';
              runHtml += `<img src="data:image/${ext};base64,${b64}" alt="document image"/>`;
            }
          }
        }

        // Text nodes <w:t>
        const tMatches = rContent.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi);
        let text = '';
        for (const tm of tMatches) {
          text += tm[1];
        }

        if (text) {
          let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          if (isBold) escaped = `<b>${escaped}</b>`;
          if (isItalic) escaped = `<i>${escaped}</i>`;
          if (isUnderline) escaped = `<u>${escaped}</u>`;
          runHtml += escaped;
        }
      }

      if (runHtml.trim()) {
        htmlParts.push(`<${tag}>${runHtml}</${tag}>`);
      }
    }

    const fullHtml = htmlParts.join('\n') || '<p>Empty DOCX document.</p>';

    // Find first image for cover preview
    let coverImage: string | undefined;
    for (const target of Object.values(relsMap)) {
      if (target.match(/\.(png|jpe?g|webp|gif)$/i)) {
        const imgPath = target.startsWith('media/') ? `word/${target}` : `word/${target.replace(/^(\.\.\/)+/, '')}`;
        const imgFile = zip.file(imgPath);
        if (imgFile) {
          const b64 = await imgFile.async('base64');
          const ext = imgPath.split('.').pop() || 'png';
          coverImage = `data:image/${ext};base64,${b64}`;
          break;
        }
      }
    }

    return {
      metadata: {
        title,
        author,
        description,
        coverImage,
      },
      html: fullHtml,
    };
  }
}
