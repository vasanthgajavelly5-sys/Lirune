/**
 * Lirune Reader Mobile — Format-Specific Metadata Extractor
 * Extracts title, author, description, and cover image for EPUB, PDF, TXT, HTML, FB2, CBZ.
 */

import JSZip from 'jszip';
import { BookFormat } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
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

export function cleanTitleFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  // Replace underscores and extra dashes
  return withoutExt.replace(/[_-]+/g, ' ').trim() || 'Untitled Book';
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
        case 'html':
          return await this.extractHtml(filePath, originalName, coverColor);
        case 'txt':
          return await this.extractTxt(filePath, originalName, coverColor);
        case 'pdf':
          return await this.extractPdf(filePath, originalName, coverColor);
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
      const base64 = await fileStorage.readAsBase64(filePath);
      const zip = await JSZip.loadAsync(base64, { base64: true });

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

      // Extract title
      const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
      const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;

      // Extract author
      const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
      const author = authorMatch ? authorMatch[1].trim() : 'Unknown Author';

      // Extract description
      const descMatch = opfXml.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
      const description = descMatch ? descMatch[1].trim() : undefined;

      // Count chapters/items in spine
      const spineItems = opfXml.match(/<itemref\b[^>]*>/gi) || [];
      const chapterCount = spineItems.length;

      // 3. Find cover image
      let coverUrl: string | undefined;
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

      // Check for <meta name="cover" content="..."/>
      const metaCoverMatch = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i);
      let coverManifestId = metaCoverMatch ? metaCoverMatch[1] : null;

      // Look in manifest for cover item
      let coverHref: string | null = null;
      if (coverManifestId) {
        const itemRegex = new RegExp(`<item[^>]+id=["']${coverManifestId}["'][^>]+href=["']([^"']+)["']`, 'i');
        const itemMatch = opfXml.match(itemRegex);
        if (itemMatch) coverHref = itemMatch[1];
      }

      if (!coverHref) {
        // Fallback: look for item with properties="cover-image" or id="cover" or href containing cover
        const coverItemMatch = opfXml.match(/<item[^>]+href=["']([^"']*(?:cover|titlepage)[^"']*\.(?:jpg|jpeg|png|webp))["']/i);
        if (coverItemMatch) coverHref = coverItemMatch[1];
      }

      if (coverHref) {
        const fullCoverPath = (opfDir + coverHref).replace(/^\//, '');
        // Search in zip with case-insensitivity
        const coverEntry = zip.file(fullCoverPath) || Object.values(zip.files).find((f) => f.name.toLowerCase() === fullCoverPath.toLowerCase());
        if (coverEntry) {
          const coverBase64 = await coverEntry.async('base64');
          const ext = coverHref.split('.').pop() || 'jpg';
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
      const base64 = await fileStorage.readAsBase64(filePath);
      const zip = await JSZip.loadAsync(base64, { base64: true });

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
      const content = await fileStorage.readAsString(filePath);
      const firstLine = content.slice(0, 300).split(/\r?\n/).find((l) => l.trim().length > 0);
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
    _filePath: string,
    originalName: string,
    coverColor: string
  ): Promise<ExtractedMetadata> {
    const title = cleanTitleFromFilename(originalName);
    return {
      title,
      author: 'Document',
      coverColor: getCoverColorForTitle(title),
      chapterCount: 1,
    };
  }
}
