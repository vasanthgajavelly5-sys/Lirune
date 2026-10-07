/**
 * Lirune Reader Mobile — Format-Specific Metadata Extractor
 * Extracts title, author, description, and cover image for EPUB, PDF, TXT, HTML, FB2, CBZ.
 */

import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { BookFormat } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { resolveZipPath } from '@/services/epub/zipPaths';
import { parseOpfMetadata } from '@/services/epub/package';
import { MobiParser } from '@/services/mobi/MobiParser';
import { DocxParser } from '@/services/docx/DocxParser';
import { OdtParser } from '@/services/odt/OdtParser';
import { RtfParser } from '@/services/rtf/RtfParser';
import { DocParser } from '@/services/doc/DocParser';
import { ChmParser } from '@/services/chm/ChmParser';
import { DjvuParser } from '@/services/djvu/DjvuParser';
import { RarExtractor } from '@/services/archive/RarExtractor';
import { logger } from '@/utils/logger';

const TAG = 'MetadataExtractor';

export interface ExtractedMetadata {
  title: string;
  author: string;
  description?: string;
  coverUrl?: string;
  coverColor: string;
  chapterCount?: number;
  metadata?: Record<string, unknown>;
}

// Harmonious palette colors for cover fallbacks (Lirune design language)
const PALETTE_COLORS = [
  '#2C2D35',
  '#352B3C',
  '#22323D',
  '#2A362E',
  '#382E26',
  '#33242B',
  '#252E38',
  '#3A3050',
];

export function getCoverColorForTitle(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE_COLORS.length;
  return PALETTE_COLORS[index];
}

/**
 * Decodes a base64 range read back into text.
 *
 * A range read is a byte range, so it can start mid-character in a UTF-8
 * sequence; the replacement character from that split byte is stripped so a
 * `/Title (…)` value is not polluted by it.
 */
function base64ToText(base64: string): string {
  try {
    const raw = atob(base64);
    let binary = '';
    for (let i = 0; i < raw.length; i++) binary += raw.charCodeAt(i);
    // A range read can start mid-character; drop the replacement character that
    // the split byte decodes to.
    const SPLIT_CHAR = String.fromCharCode(0xfffd);
    return binary.split(SPLIT_CHAR).join('');
  } catch {
    return '';
  }
}

/**
 * Reads a string out of the PDF Info dictionary.
 *
 * Handles both encodings a producer may use: PDFDocEncoding/PDF literal strings
 * with escapes, and UTF-16BE with a byte-order mark.
 */
function readPdfInfoString(window: string, key: string): string | undefined {
  const literal = new RegExp(`/${key}\\s*\\(((?:\\\\.|[^\\\\()])*)\\)`).exec(window);
  const hex = new RegExp(`/${key}\\s*<([0-9A-Fa-f\\s]+)>`).exec(window);
  let value: string | undefined;

  if (hex && hex[1]) {
    const bytes: number[] = [];
    const digits = hex[1].replace(/\s+/g, '');
    for (let i = 0; i + 1 < digits.length; i += 2) bytes.push(parseInt(digits.substr(i, 2), 16));
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      // UTF-16BE with a BOM.
      let text = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      value = text;
    } else {
      value = String.fromCharCode(...bytes.slice(0, 512));
    }
  } else if (literal && literal[1] !== undefined) {
    value = literal[1]
      .replace(/\\([nrtbf()\\])/g, (_, c: string) =>
        c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c === 'b' || c === 'f' ? '' : c
      )
      .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
  }

  const cleaned = (value || '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function cleanTitleFromFilename(fileName: string): string {  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  // Replace underscores and extra dashes
  return withoutExt.replace(/[_-]+/g, ' ').trim() || 'Untitled Book';
}


function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class MetadataExtractor {
  /**
   * Main metadata extraction entry point for all supported formats.
   */
  static async extract(
    filePath: string,
    format: BookFormat,
    originalName: string,
    fileId: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    const coverColor = getCoverColorForTitle(fallbackTitle);

    try {
      switch (format) {
        case 'epub':
          return await this.extractEpub(filePath, originalName, fileId, coverColor);
        case 'fb2':
          return await this.extractFb2(filePath, originalName, fileId, coverColor);
        case 'cbz':
          return await this.extractCbz(filePath, originalName, fileId, coverColor);
        case 'cbr':
          return await this.extractCbr(filePath, originalName, fileId, coverColor);
        case 'html':
          return await this.extractHtml(filePath, originalName, coverColor);
        case 'txt':
          return await this.extractTxt(filePath, originalName, coverColor);
        case 'pdf':
          return await this.extractPdf(filePath, originalName, coverColor);
        case 'mobi':
        case 'azw':
        case 'azw3':
          return await this.extractMobi(filePath, originalName, fileId, coverColor);
        case 'docx':
          return await this.extractDocx(filePath, originalName, fileId, coverColor);
        case 'odt':
          return await this.extractOdt(filePath, originalName, fileId, coverColor);
        case 'rtf':
          return await this.extractRtf(filePath, originalName, coverColor);
        case 'doc':
          return await this.extractDoc(filePath, originalName, coverColor);
        case 'chm':
          return await this.extractChm(filePath, originalName, coverColor);
        case 'djvu':
          return await this.extractDjvu(filePath, originalName, coverColor);
        default:
          return {
            title: fallbackTitle,
            author: 'Unknown Author',
            coverColor,
          };
      }
    } catch (err) {
      logger.warn(TAG, `Metadata extraction failed for ${originalName}, using fallback`, err);
      return {
        title: fallbackTitle,
        author: 'Unknown Author',
        coverColor,
      };
    }
  }

  // ================= EPUB =================
  private static async extractEpub(
    filePath: string,
    originalName: string,
    fileId: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      // Bytes, not base64: the whole publication was being held as a base64
      // string plus its decoded copy, which is what made importing a large EPUB
      // look like a hang.
      const bytes = await fileStorage.readAsArrayBuffer(filePath);
      const zip = await JSZip.loadAsync(bytes);

      // 1. Read container.xml to find OPF file path
      const containerFile = zip.file('META-INF/container.xml');
      if (!containerFile) {
        return { title: fallbackTitle, author: 'Unknown Author', coverColor };
      }

      const containerXml = await containerFile.async('text');
      const opfPathMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
      const opfPath = opfPathMatch ? opfPathMatch[1] : 'OEBPS/content.opf';

      // 2. Read OPF
      const opfFile = zip.file(opfPath);
      if (!opfFile) {
        return { title: fallbackTitle, author: 'Unknown Author', coverColor };
      }

      const opfXml = await opfFile.async('text');

      // Title, every author, description and the rest of the Dublin Core set come
      // from the shared parser, so an imported book can never disagree with what
      // the Files screen showed before the import. The regexes this replaces broke
      // on CDATA, nested tags and `&amp;`, and stopped at the first creator.
      const opfMetadata = parseOpfMetadata(opfXml, opfPath);
      const title = opfMetadata.title || fallbackTitle;
      const author = opfMetadata.authors.length > 0 ? opfMetadata.authors.join(', ') : 'Unknown Author';
      const description = opfMetadata.description;

      // Count chapters/items in spine
      const spineItems = opfXml.match(/<itemref\b[^>]*>/gi) || [];
      const chapterCount = spineItems.length;

      // Parse all manifest items (agnostic to attribute order)
      interface ManifestItem {
        id: string;
        href: string;
        mediaType: string;
        properties?: string;
      }
      const manifest: ManifestItem[] = [];
      const itemTagRegex = /<item\b([^>]+)\/?>/gi;
      let itemTagMatch;
      while ((itemTagMatch = itemTagRegex.exec(opfXml)) !== null) {
        const rawAttrs = itemTagMatch[1];
        const idMatch = rawAttrs.match(/\bid=["']([^"']+)["']/i);
        const hrefMatch = rawAttrs.match(/\bhref=["']([^"']+)["']/i);
        const mediaTypeMatch = rawAttrs.match(/\bmedia-type=["']([^"']+)["']/i);
        const propMatch = rawAttrs.match(/\bproperties=["']([^"']+)["']/i);
        if (idMatch && hrefMatch) {
          manifest.push({
            id: idMatch[1],
            href: hrefMatch[1],
            mediaType: mediaTypeMatch ? mediaTypeMatch[1] : '',
            properties: propMatch ? propMatch[1] : undefined,
          });
        }
      }

      // 3. Find cover image
      let coverUrl: string | undefined;
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
      let coverHref: string | null = null;

      // A. Check for <meta name="cover" content="..."/> OR <meta content="..." name="cover"/>
      const metaCoverMatch =
        opfXml.match(/<meta\b[^>]*\bname=["']cover["'][^>]*\bcontent=["']([^"']+)["']/i) ||
        opfXml.match(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']cover["']/i);
      const coverManifestId = metaCoverMatch ? metaCoverMatch[1] : null;

      if (coverManifestId) {
        const item = manifest.find((m) => m.id === coverManifestId);
        if (item) coverHref = item.href;
      }

      // B. EPUB 3 cover-image property
      if (!coverHref) {
        const item = manifest.find((m) => m.properties && m.properties.toLowerCase().includes('cover-image'));
        if (item) coverHref = item.href;
      }

      // C. Manifest item with id "cover" or "cover-image"
      if (!coverHref) {
        const item = manifest.find((m) => {
          const idLower = m.id.toLowerCase();
          return idLower === 'cover' || idLower === 'cover-image' || idLower === 'cover_image';
        });
        if (item) coverHref = item.href;
      }

      // D. Check <guide><reference type="cover" href="..."/></guide>
      if (!coverHref) {
        const guideCoverMatch =
          opfXml.match(/<reference\b[^>]*\btype=["']cover["'][^>]*\bhref=["']([^"']+)["']/i) ||
          opfXml.match(/<reference\b[^>]*\bhref=["']([^"']+)["'][^>]*\btype=["']cover["']/i);
        if (guideCoverMatch) {
          const refHref = guideCoverMatch[1];
          if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(refHref)) {
            coverHref = refHref;
          } else {
            // It references a cover XHTML document. Try to find the image inside it
            const coverDocPath = resolveZipPath(opfDir, refHref);
            const coverDocFile =
              zip.file(coverDocPath) ||
              Object.values(zip.files).find((f) => f.name.toLowerCase() === coverDocPath.toLowerCase());
            if (coverDocFile) {
              const coverDocHtml = await coverDocFile.async('text');
              const docImgMatch = coverDocHtml.match(/<(?:img|image)\b[^>]*\b(?:src|xlink:href|href)=["']([^"']+)["']/i);
              if (docImgMatch) {
                const docDir = coverDocPath.includes('/') ? coverDocPath.substring(0, coverDocPath.lastIndexOf('/') + 1) : '';
                coverHref = resolveZipPath(docDir, docImgMatch[1]);
              }
            }
          }
        }
      }

      // E. Manifest item with href containing "cover" or "titlepage" or "front"
      if (!coverHref) {
        const item = manifest.find((m) => {
          const h = m.href.toLowerCase();
          const mt = (m.mediaType || '').toLowerCase();
          return (
            (mt.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(h)) &&
            (h.includes('cover') || h.includes('titlepage') || h.includes('jacket') || h.includes('front'))
          );
        });
        if (item) coverHref = item.href;
      }

      // F. Fallback: first image item in the manifest
      if (!coverHref) {
        const firstImg = manifest.find((m) => {
          const mt = (m.mediaType || '').toLowerCase();
          const h = m.href.toLowerCase();
          return mt.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(h);
        });
        if (firstImg) coverHref = firstImg.href;
      }

      if (coverHref) {
        const resolvedPath = coverHref.startsWith('/')
          ? coverHref.slice(1)
          : (coverHref.includes('/') && opfDir && coverHref.startsWith(opfDir))
            ? resolveZipPath('', coverHref)
            : resolveZipPath(opfDir, coverHref);

        const coverEntry =
          zip.file(resolvedPath) ||
          Object.values(zip.files).find(
            (f) =>
              f.name.toLowerCase() === resolvedPath.toLowerCase() ||
              f.name.toLowerCase().endsWith(resolvedPath.toLowerCase())
          );

        if (coverEntry) {
          const coverBase64 = await coverEntry.async('base64');
          const ext = (resolvedPath.split('.').pop() || 'jpg').toLowerCase();
          coverUrl = await fileStorage.saveCoverImage(fileId, coverBase64, ext);
        }
      }

      return {
        title,
        author,
        description,
        coverUrl,
        coverColor: getCoverColorForTitle(title),
        chapterCount,
        metadata: {
          language: opfMetadata.language,
          publisher: opfMetadata.publisher,
          publishedDate: opfMetadata.date,
          identifier: opfMetadata.identifier,
          series: opfMetadata.series,
          authors: opfMetadata.authors,
        },
      };
    } catch (err) {
      logger.warn(TAG, `EPUB metadata extraction error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Unknown Author', coverColor };
    }
  }

  // ================= FB2 =================
  private static async extractFb2(
    filePath: string,
    originalName: string,
    fileId: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const xml = await fileStorage.readAsString(filePath);

      // Title
      const titleMatch = xml.match(/<book-title[^>]*>([^<]+)<\/book-title>/i);
      const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;

      // Author (first-name + last-name)
      const firstNameMatch = xml.match(/<first-name[^>]*>([^<]+)<\/first-name>/i);
      const lastNameMatch = xml.match(/<last-name[^>]*>([^<]+)<\/last-name>/i);
      const author = [firstNameMatch?.[1], lastNameMatch?.[1]].filter(Boolean).join(' ') || 'Unknown Author';

      // Annotation
      const annotMatch = xml.match(/<annotation[^>]*>([\s\S]*?)<\/annotation>/i);
      const description = annotMatch ? annotMatch[1].replace(/<[^>]+>/g, '').trim() : undefined;

      // Cover image binary
      let coverUrl: string | undefined;
      const coverpageMatch = xml.match(/<coverpage>[\s\S]*?<image[^>]+href=["']#?([^"']+)["']/i);
      if (coverpageMatch) {
        const coverId = coverpageMatch[1];
        const binaryRegex = new RegExp(`<binary[^>]+id=["']${coverId}["'][^>]*>([\\s\\S]*?)<\\/binary>`, 'i');
        const binaryMatch = xml.match(binaryRegex);
        if (binaryMatch) {
          const base64Data = binaryMatch[1].replace(/\s+/g, '');
          coverUrl = await fileStorage.saveCoverImage(fileId, base64Data, 'jpg');
        }
      }

      // Count sections
      const sections = xml.match(/<section\b[^>]*>/gi) || [];

      return {
        title,
        author,
        description,
        coverUrl,
        coverColor: getCoverColorForTitle(title),
        chapterCount: sections.length || 1,
      };
    } catch (err) {
      logger.warn(TAG, `FB2 metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Unknown Author', coverColor };
    }
  }

  // ================= CBZ =================
  private static async extractCbz(
    filePath: string,
    originalName: string,
    fileId: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const buffer = await fileStorage.readAsArrayBuffer(filePath);
      const zip = await JSZip.loadAsync(buffer);

      const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      const imageFiles = Object.keys(zip.files)
        .filter((name) => {
          const ext = name.split('.').pop()?.toLowerCase();
          return ext && imageExtensions.includes(ext) && !zip.files[name].dir;
        })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      let coverUrl: string | undefined;
      if (imageFiles.length > 0) {
        const firstImage = zip.file(imageFiles[0]);
        if (firstImage) {
          const coverBase64 = await firstImage.async('base64');
          const ext = imageFiles[0].split('.').pop() || 'jpg';
          coverUrl = await fileStorage.saveCoverImage(fileId, coverBase64, ext);
        }
      }

      return {
        title: fallbackTitle,
        author: 'Comic Archive',
        coverUrl,
        coverColor,
        chapterCount: imageFiles.length,
      };
    } catch (err) {
      logger.warn(TAG, `CBZ metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Comic Archive', coverColor };
    }
  }

  // ================= HTML =================
  private static async extractHtml(
    filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const text = await fileStorage.readAsString(filePath);
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;

      const authorMatch = text.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);
      const author = authorMatch ? authorMatch[1].trim() : 'Unknown Author';

      // Count H1 / H2 headings as chapters
      const headings = text.match(/<h[1-3]\b[^>]*>/gi) || [];

      return {
        title,
        author,
        coverColor: getCoverColorForTitle(title),
        chapterCount: headings.length || 1,
      };
    } catch {
      return { title: fallbackTitle, author: 'Unknown Author', coverColor };
    }
  }

  // ================= TXT =================
  private static async extractTxt(
    filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      // Read only the first 1 KB. Reading the whole file here would decode a
      // multi-megabyte book into memory a second time, purely to look at 300
      // characters, and is the reason large TXT imports were slow and memory
      // hungry before the reader was made streaming.
      const head = await fileStorage.readRangeAsString(filePath, 0, 1024);
      const firstLine = head.split(/\r?\n/).find((l) => l.trim().length > 0);
      const title = firstLine && firstLine.length < 80 ? firstLine.trim() : fallbackTitle;

      return {
        title,
        author: 'Plain Text',
        coverColor: getCoverColorForTitle(title),
        chapterCount: 1,
      };
    } catch {
      return { title: fallbackTitle, author: 'Plain Text', coverColor };
    }
  }

  // ================= PDF =================
  private static async extractPdf(
    filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const title = cleanTitleFromFilename(originalName);
    let pageCount = 1;
    let documentTitle: string | undefined;
    let documentAuthor: string | undefined;
    try {
      // A PDF's page tree and Info dictionary live at the END of the file, and a
      // linearised one also puts its first objects at the start. Reading the whole
      // publication as text to regex them meant a 200MB scan could not even be
      // imported; 64KB from each end covers every ordinary file, and pdf.js
      // reports the real count on first open anyway.
      const info = await FileSystem.getInfoAsync(filePath);
      const size = info.exists && typeof info.size === 'number' ? info.size : 0;
      if (size === 0) throw new Error('empty');

      const tailLength = Math.min(64 * 1024, size);
      const headLength = Math.min(4 * 1024, size);
      const readText = async (position: number, length: number) => {
        const base64 = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
          position,
          length,
        });
        return base64ToText(base64);
      };

      const tail = await readText(Math.max(0, size - tailLength), tailLength);
      const head = await readText(0, headLength);
      // The page tree is usually in the tail; a linearised catalog is in the head.
      const window = `${head}\n${tail}`;

      const countMatches = Array.from(window.matchAll(/\/Type\s*\/Pages[\s\S]{0,100}?\/Count\s+(\d+)/gi));
      for (const m of countMatches) {
        const value = parseInt(m[1], 10);
        if (value > pageCount) pageCount = value;
      }
      if (pageCount === 1) {
        for (const m of Array.from(window.matchAll(/\/Count\s+(\d+)[\s\S]{0,100}?\/Type\s*\/Pages/gi))) {
          const value = parseInt(m[1], 10);
          if (value > pageCount) pageCount = value;
        }
      }
      if (pageCount === 1) {
        const pages = window.match(/\/Type\s*\/Page\b/g);
        if (pages && pages.length > 0) pageCount = pages.length;
      }

      documentTitle = readPdfInfoString(window, 'Title');
      documentAuthor = readPdfInfoString(window, 'Author');
    } catch (err) {
      logger.warn(TAG, `Bounded PDF metadata read failed for ${originalName}`, err);
    }

    return {
      // The Info dictionary is the publisher's own title; the file name is the
      // fallback for the many PDFs that carry no metadata at all.
      title: documentTitle || title,
      author: documentAuthor || 'Unknown Author',
      coverColor: getCoverColorForTitle(documentTitle || title),
      chapterCount: pageCount,
    };
  }

  // ================= MOBI / AZW / AZW3 =================
  private static async extractMobi(
    filePath: string,
    originalName: string,
    fileId: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const buffer = await fileStorage.readAsArrayBuffer(filePath);
      const bytes = new Uint8Array(buffer);
      const parsed = MobiParser.parse(bytes);

      let coverUrl: string | undefined;
      if (parsed.metadata.coverImage && parsed.metadata.coverImage.length > 0) {
        const coverB64 = uint8ToBase64(parsed.metadata.coverImage);
        coverUrl = await fileStorage.saveCoverImage(fileId, coverB64, 'jpg');
      }

      const title = parsed.metadata.title || fallbackTitle;
      return {
        title,
        author: parsed.metadata.author || 'Unknown Author',
        description: parsed.metadata.description,
        coverUrl,
        coverColor: getCoverColorForTitle(title),
        chapterCount: 1,
        metadata: {
          publisher: parsed.metadata.publisher,
          publishedDate: parsed.metadata.publishedDate,
          language: parsed.metadata.language,
        },
      };
    } catch (err) {
      logger.warn(TAG, `MOBI metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Kindle Document', coverColor };
    }
  }

  // ================= DOCX =================
  private static async extractDocx(
    filePath: string,
    originalName: string,
    fileId: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const base64 = await fileStorage.readAsBase64(filePath);
      const parsed = await DocxParser.parse(base64);
      const title = parsed.metadata.title && parsed.metadata.title !== 'Untitled Document'
        ? parsed.metadata.title
        : fallbackTitle;

      let coverUrl: string | undefined;
      if (parsed.metadata.coverImage) {
        coverUrl = await fileStorage.saveCoverImage(fileId, parsed.metadata.coverImage, 'png');
      }

      return {
        title,
        author: parsed.metadata.author || 'Word Document',
        description: parsed.metadata.description,
        coverUrl,
        coverColor: getCoverColorForTitle(title),
        chapterCount: 1,
      };
    } catch (err) {
      logger.warn(TAG, `DOCX metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Word Document', coverColor };
    }
  }

  // ================= ODT =================
  private static async extractOdt(
    filePath: string,
    originalName: string,
    fileId: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const base64 = await fileStorage.readAsBase64(filePath);
      const parsed = await OdtParser.parse(base64);
      const title = parsed.metadata.title && parsed.metadata.title !== 'Untitled ODT Document'
        ? parsed.metadata.title
        : fallbackTitle;

      let coverUrl: string | undefined;
      if (parsed.metadata.coverImage) {
        coverUrl = await fileStorage.saveCoverImage(fileId, parsed.metadata.coverImage, 'png');
      }

      return {
        title,
        author: parsed.metadata.author || 'OpenDocument Text',
        description: parsed.metadata.description,
        coverUrl,
        coverColor: getCoverColorForTitle(title),
        chapterCount: 1,
      };
    } catch (err) {
      logger.warn(TAG, `ODT metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'OpenDocument Text', coverColor };
    }
  }

  // ================= RTF =================
  private static async extractRtf(
    filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const text = await fileStorage.readAsString(filePath);
      const parsed = RtfParser.parse(text);
      const title = parsed.metadata.title && parsed.metadata.title !== 'Untitled RTF'
        ? parsed.metadata.title
        : fallbackTitle;

      return {
        title,
        author: parsed.metadata.author || 'Rich Text Format',
        coverColor: getCoverColorForTitle(title),
        chapterCount: 1,
      };
    } catch (err) {
      logger.warn(TAG, `RTF metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Rich Text Format', coverColor };
    }
  }

  // ================= DOC =================
  private static async extractDoc(
    filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const buffer = await fileStorage.readAsArrayBuffer(filePath);
      const bytes = new Uint8Array(buffer);
      const parsed = DocParser.parse(bytes);
      const title = parsed.metadata.title && parsed.metadata.title !== 'Untitled Word Document'
        ? parsed.metadata.title
        : fallbackTitle;

      return {
        title,
        author: parsed.metadata.author || 'Word 97-2003',
        coverColor: getCoverColorForTitle(title),
        chapterCount: 1,
      };
    } catch (err) {
      logger.warn(TAG, `DOC metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Word 97-2003', coverColor };
    }
  }

  // ================= CHM =================
  private static async extractChm(
    filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const buffer = await fileStorage.readAsArrayBuffer(filePath);
      const bytes = new Uint8Array(buffer);
      const parsed = ChmParser.parse(bytes);
      const title = parsed.metadata.title && parsed.metadata.title !== 'Compiled HTML Help'
        ? parsed.metadata.title
        : fallbackTitle;

      return {
        title,
        author: parsed.metadata.author || 'Help Archive',
        coverColor: getCoverColorForTitle(title),
        chapterCount: 1,
      };
    } catch (err) {
      logger.warn(TAG, `CHM metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Help Archive', coverColor };
    }
  }

  // ================= DJVU =================
  private static async extractDjvu(
    filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const buffer = await fileStorage.readAsArrayBuffer(filePath);
      const bytes = new Uint8Array(buffer);
      const parsed = DjvuParser.parse(bytes);
      const title = parsed.metadata.title && parsed.metadata.title !== 'DjVu Document'
        ? parsed.metadata.title
        : fallbackTitle;

      return {
        title,
        author: parsed.metadata.author || 'DjVu Document',
        coverColor: getCoverColorForTitle(title),
        chapterCount: parsed.pages.length || 1,
      };
    } catch (err) {
      logger.warn(TAG, `DjVu metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'DjVu Document', coverColor };
    }
  }

  // ================= CBR =================
  private static async extractCbr(
    filePath: string,
    originalName: string,
    fileId: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const fallbackTitle = cleanTitleFromFilename(originalName);
    try {
      const buffer = await fileStorage.readAsArrayBuffer(filePath);
      const bytes = new Uint8Array(buffer);
      const entries = RarExtractor.inspect(bytes);

      const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      const imageEntries = entries.filter((e) => {
        const ext = e.name.split('.').pop()?.toLowerCase();
        return ext && imageExtensions.includes(ext) && e.isStored && e.data && e.data.length > 0;
      });

      let coverUrl: string | undefined;
      if (imageEntries.length > 0) {
        const first = imageEntries[0];
        const ext = first.name.split('.').pop()?.toLowerCase() || 'jpg';
        const coverB64 = uint8ToBase64(first.data);
        coverUrl = await fileStorage.saveCoverImage(fileId, coverB64, ext);
      }

      return {
        title: fallbackTitle,
        author: 'Comic Archive (RAR)',
        coverUrl,
        coverColor,
        chapterCount: imageEntries.length || 1,
      };
    } catch (err) {
      logger.warn(TAG, `CBR metadata error: ${originalName}`, err);
      return { title: fallbackTitle, author: 'Comic Archive (RAR)', coverColor };
    }
  }
}
