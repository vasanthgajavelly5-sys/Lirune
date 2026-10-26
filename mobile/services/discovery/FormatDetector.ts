/**
 * Lirune Reader Mobile — Robust Format Detection Service
 * Detects format using binary magic byte signatures, container inspection, and file extension ties.
 */

import { getFormatFromExtension, SUPPORTED_FORMATS, type FormatInfo } from '../../models/Book.ts';

export interface DetectionResult extends FormatInfo {
  confidence: number;
  isDrm?: boolean;
  drmReason?: string;
  kind?: 'book' | 'container' | 'blocked';
  needsPassword?: boolean;
}

export class FormatDetector {
  /**
   * Fast extension-based format lookup.
   */
  static fromFilename(filename: string): FormatInfo {
    return getFormatFromExtension(filename);
  }

  /**
   * Detects format from magic bytes (first 16-4096 bytes of a file).
   */
  static fromMagicBytes(bytes: Uint8Array, fallbackFilename?: string): DetectionResult {
    const ext = fallbackFilename ? (fallbackFilename.split('.').pop() || '').toLowerCase() : '';

    if (bytes.length < 4) {
      if (fallbackFilename) {
        const info = getFormatFromExtension(fallbackFilename);
        return { ...info, confidence: 0.5 };
      }
      return {
        id: 'unknown',
        label: 'Unknown Format',
        extensions: [],
        mime: 'application/octet-stream',
        supported: false,
        confidence: 0,
      };
    }

    // 1. PDF: %PDF- (0x25, 0x50, 0x44, 0x46) within first 1024 bytes
    let pdfOffset = -1;
    const maxSearch = Math.min(bytes.length - 4, 1024);
    for (let i = 0; i <= maxSearch; i++) {
      if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46) {
        pdfOffset = i;
        break;
      }
    }
    if (pdfOffset >= 0) {
      const latinSample = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 4096)));
      const isEncrypted = latinSample.includes('/Encrypt');
      return {
        ...SUPPORTED_FORMATS.pdf,
        confidence: 1.0,
        isDrm: isEncrypted,
        drmReason: isEncrypted ? 'PDF file has /Encrypt dictionary' : undefined,
      };
    }

    // 2. RTF: {\rtf (0x7B, 0x5C, 0x72, 0x74, 0x66)
    if (
      bytes.length >= 5 &&
      bytes[0] === 0x7b &&
      bytes[1] === 0x5c &&
      bytes[2] === 0x72 &&
      bytes[3] === 0x74 &&
      bytes[4] === 0x66
    ) {
      return { ...SUPPORTED_FORMATS.rtf, confidence: 1.0 };
    }

    // 3. RAR / CBR: Rar!\x1A\x07 (0x52, 0x61, 0x72, 0x21, 0x1A, 0x07)
    if (
      bytes.length >= 6 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x61 &&
      bytes[2] === 0x72 &&
      bytes[3] === 0x21 &&
      bytes[4] === 0x1a &&
      bytes[5] === 0x07
    ) {
      return { ...SUPPORTED_FORMATS.cbr, confidence: 0.98 };
    }

    // 4. 7z / CB7: 7z\xBC\xAF\x27\x1C (0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C)
    if (
      bytes.length >= 6 &&
      bytes[0] === 0x37 &&
      bytes[1] === 0x7a &&
      bytes[2] === 0xbc &&
      bytes[3] === 0xaf &&
      bytes[4] === 0x27 &&
      bytes[5] === 0x1c
    ) {
      return { ...SUPPORTED_FORMATS.cb7, confidence: 0.98 };
    }

    // 5. CHM: ITSF (0x49, 0x54, 0x53, 0x46)
    if (bytes[0] === 0x49 && bytes[1] === 0x54 && bytes[2] === 0x53 && bytes[3] === 0x46) {
      return { ...SUPPORTED_FORMATS.chm, confidence: 1.0 };
    }

    // 6. DjVu: AT&T (0x41, 0x54, 0x26, 0x54) + FORM
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x41 &&
      bytes[1] === 0x54 &&
      bytes[2] === 0x26 &&
      bytes[3] === 0x54 &&
      bytes[4] === 0x46 &&
      bytes[5] === 0x4f &&
      bytes[6] === 0x52 &&
      bytes[7] === 0x4d
    ) {
      return { ...SUPPORTED_FORMATS.djvu, confidence: 1.0 };
    }

    // 7. Microsoft Compound Document (DOC / OLE2): 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
    if (
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1
    ) {
      return { ...SUPPORTED_FORMATS.doc, confidence: 0.95 };
    }

    // 8. Palm Database / MOBI / AZW / AZW3: Check for "BOOKMOBI" or "TEXtREAd" at offset 60..68
    if (bytes.length >= 68) {
      const mobiTag = String.fromCharCode(
        bytes[60],
        bytes[61],
        bytes[62],
        bytes[63],
        bytes[64],
        bytes[65],
        bytes[66],
        bytes[67]
      );
      if (mobiTag === 'BOOKMOBI' || mobiTag === 'TEXtREAd') {
        const latinSample = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 4096)));
        const isKf8 = latinSample.includes('KF8') || latinSample.includes('FDST') || ext === 'azw3' || ext === 'kf8';

        // Check encryption flag at offset 78..80
        let isDrm = false;
        let drmReason: string | undefined;
        if (bytes.length >= 80) {
          const encryptionType = (bytes[78] << 8) | bytes[79];
          if (encryptionType !== 0) {
            isDrm = true;
            drmReason = `Kindle / MOBI encryption type ${encryptionType}`;
          }
        }

        const format = isKf8 ? SUPPORTED_FORMATS.azw3 : ext === 'azw' ? SUPPORTED_FORMATS.azw : SUPPORTED_FORMATS.mobi;
        return {
          ...format,
          confidence: 0.98,
          isDrm,
          drmReason,
        };
      }
    }

    // 9. ZIP-based containers: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      const headerSnippet = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 4096)));

      // Extract ZIP entry names from local headers or central directory in sample
      interface EntryMeta {
        name: string;
        isEncrypted: boolean;
        isDirectory: boolean;
      }
      const entries: EntryMeta[] = [];

      // Scan for central directory headers (0x02014b50) or local headers (0x04034b50)
      for (let i = 0; i <= bytes.length - 30; i++) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b) {
          // Central directory header: PK\x01\x02
          if (bytes[i + 2] === 0x01 && bytes[i + 3] === 0x02 && i <= bytes.length - 46) {
            const flags = bytes[i + 8] | (bytes[i + 9] << 8);
            const nameLen = bytes[i + 28] | (bytes[i + 29] << 8);
            if (i + 46 + nameLen <= bytes.length) {
              const nameBytes = bytes.slice(i + 46, i + 46 + nameLen);
              const name = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);
              const isEncrypted = (flags & 1) !== 0;
              const isDirectory = name.endsWith('/');
              entries.push({ name, isEncrypted, isDirectory });
              i += 45 + nameLen;
              continue;
            }
          }
          // Local file header: PK\x03\x04
          if (bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
            const flags = bytes[i + 6] | (bytes[i + 7] << 8);
            const nameLen = bytes[i + 26] | (bytes[i + 27] << 8);
            if (i + 30 + nameLen <= bytes.length) {
              const nameBytes = bytes.slice(i + 30, i + 30 + nameLen);
              const name = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);
              const isEncrypted = (flags & 1) !== 0;
              const isDirectory = name.endsWith('/');
              entries.push({ name, isEncrypted, isDirectory });
              i += 29 + nameLen;
            }
          }
        }
      }

      const namesLower = entries.map((e) => e.name.toLowerCase());

      // 1. EPUB
      if (
        headerSnippet.includes('mimetypeapplication/epub+zip') ||
        headerSnippet.includes('META-INF/container.xml') ||
        namesLower.some((n) => n === 'mimetype' || n.includes('meta-inf/container.xml'))
      ) {
        const hasRights = headerSnippet.includes('rights.xml');
        const hasEncryption = headerSnippet.includes('encryption.xml');
        const isDrm = hasRights || hasEncryption;
        return {
          ...SUPPORTED_FORMATS.epub,
          confidence: 1.0,
          kind: 'book',
          isDrm,
          drmReason: hasRights
            ? 'Adobe ADEPT rights.xml detected'
            : hasEncryption
              ? 'EPUB encryption.xml detected'
              : undefined,
        };
      }

      // 2. DOCX & ODT
      if (
        headerSnippet.includes('word/') ||
        headerSnippet.includes('[Content_Types].xml') ||
        namesLower.some((n) => n.startsWith('word/document.xml'))
      ) {
        return { ...SUPPORTED_FORMATS.docx, confidence: 0.98, kind: 'book' };
      }
      if (
        headerSnippet.includes('mimetypeapplication/vnd.oasis.opendocument.text') ||
        namesLower.some((n) => n === 'content.xml' && ext === 'odt')
      ) {
        return { ...SUPPORTED_FORMATS.odt, confidence: 1.0, kind: 'book' };
      }

      // 3. Android/Java packages -> blocked:app-package
      const hasManifest = namesLower.some((n) => n === 'androidmanifest.xml');
      const hasDex = namesLower.some((n) => n === 'classes.dex' || n.endsWith('.dex'));
      const hasArsc = namesLower.some((n) => n === 'resources.arsc');
      const hasCertSig = namesLower.some(
        (n) => n.startsWith('meta-inf/') && (n.endsWith('.rsa') || n.endsWith('.sf') || n.endsWith('.dsa'))
      );
      if (hasManifest && (hasDex || hasArsc || hasCertSig)) {
        return {
          id: 'unknown',
          label: 'Android App Package',
          extensions: ['apk'],
          mime: 'application/vnd.android.package-archive',
          supported: false,
          confidence: 1.0,
          kind: 'blocked',
          reason: 'Android application package (.apk)',
        };
      }

      const hasTopLevelApk = namesLower.some((n) => (n === 'base.apk' || n.endsWith('.apk')) && !n.includes('/'));
      const hasBundlePb = namesLower.some((n) => n === 'bundleconfig.pb' || n === 'toc.pb');
      if (hasTopLevelApk || hasBundlePb) {
        return {
          id: 'unknown',
          label: 'Android App Bundle',
          extensions: ['aab', 'xapk'],
          mime: 'application/octet-stream',
          supported: false,
          confidence: 1.0,
          kind: 'blocked',
          reason: 'Android App Bundle / Split APK container (.aab / .apks)',
        };
      }

      const hasJarManifest = namesLower.some((n) => n === 'meta-inf/manifest.mf');
      const hasClassFiles = namesLower.some((n) => n.endsWith('.class'));
      if (hasJarManifest && hasClassFiles) {
        return {
          id: 'unknown',
          label: 'Java Archive',
          extensions: ['jar'],
          mime: 'application/java-archive',
          supported: false,
          confidence: 1.0,
          kind: 'blocked',
          reason: 'Java archive executable package (.jar)',
        };
      }

      // 4. FB2.ZIP
      const nonDir = entries.filter((e) => !e.isDirectory);
      const fb2Entries = nonDir.filter((e) => e.name.toLowerCase().endsWith('.fb2'));
      const isFb2ZipName = Boolean(fallbackFilename?.toLowerCase().endsWith('.fb2.zip'));
      if (fb2Entries.length === 1 && (nonDir.length === 1 || isFb2ZipName)) {
        return { ...SUPPORTED_FORMATS.fb2, confidence: 0.98, kind: 'book' };
      }

      // 5. CBZ: >= 90% images
      const ignoredCbNames = new Set(['comicinfo.xml', 'thumbs.db', '.ds_store']);
      const contentEntries = nonDir.filter((e) => {
        const l = e.name.toLowerCase();
        const base = l.split('/').pop() || '';
        return !ignoredCbNames.has(base) && !l.startsWith('__macosx/') && !base.endsWith('.txt') && !base.endsWith('.nfo');
      });
      const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);
      const imageEntries = contentEntries.filter((e) => {
        const entryExt = e.name.split('.').pop()?.toLowerCase() || '';
        return imageExts.has(entryExt);
      });
      if (
        (contentEntries.length > 0 && imageEntries.length / contentEntries.length >= 0.9) ||
        headerSnippet.includes('ComicInfo.xml') ||
        ext === 'cbz'
      ) {
        return { ...SUPPORTED_FORMATS.cbz, confidence: 0.95, kind: 'book' };
      }

      // 6. ARCHIVE_CONTAINER: contains >= 1 supported book
      const bookExts = new Set([
        'epub', 'pdf', 'fb2', 'cbz', 'cbr', 'cb7', 'mobi', 'azw', 'azw3', 'kf8',
        'djvu', 'djv', 'doc', 'docx', 'rtf', 'odt', 'chm'
      ]);
      const bookEntries = nonDir.filter((e) => {
        const entryExt = e.name.split('.').pop()?.toLowerCase() || '';
        return bookExts.has(entryExt);
      });
      const hasEncrypted = entries.some((e) => e.isEncrypted);
      if (bookEntries.length > 0) {
        return {
          ...SUPPORTED_FORMATS.zip,
          confidence: 0.95,
          kind: 'container',
          needsPassword: hasEncrypted,
          reason: `ZIP archive with ${bookEntries.length} supported book(s) inside`,
        };
      }

      if (hasEncrypted && entries.length > 0) {
        return {
          ...SUPPORTED_FORMATS.zip,
          confidence: 0.7,
          kind: 'container',
          needsPassword: true,
          reason: 'Password-protected ZIP archive',
        };
      }

      // 7. Otherwise -> unrecognized / blocked
      return {
        id: 'unknown',
        label: 'ZIP Container Archive',
        extensions: ['zip'],
        mime: 'application/zip',
        supported: false,
        confidence: 0,
        kind: 'blocked',
        reason: 'ZIP archive with no supported books inside',
      };
    }

    // 10. XML / FB2 / HTML
    const textHead = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512)).trim();
    if (textHead.includes('<FictionBook')) {
      return { ...SUPPORTED_FORMATS.fb2, confidence: 0.98 };
    }
    if (textHead.toLowerCase().includes('<!doctype html') || textHead.toLowerCase().includes('<html')) {
      return { ...SUPPORTED_FORMATS.html, confidence: 0.95 };
    }

    // 11. Plain Text check: no NUL bytes in sample
    let hasNul = false;
    for (let i = 0; i < Math.min(bytes.length, 1024); i++) {
      if (bytes[i] === 0) {
        hasNul = true;
        break;
      }
    }
    if (!hasNul) {
      if (ext === 'html' || ext === 'htm' || ext === 'xhtml') {
        return { ...SUPPORTED_FORMATS.html, confidence: 0.9 };
      }
      return { ...SUPPORTED_FORMATS.txt, confidence: 0.85 };
    }

    // Fallback to filename extension
    if (fallbackFilename) {
      const info = getFormatFromExtension(fallbackFilename);
      return { ...info, confidence: 0.4 };
    }

    return {
      id: 'unknown',
      label: 'Unknown Format',
      extensions: [],
      mime: 'application/octet-stream',
      supported: false,
      confidence: 0,
      reason: 'No recognized format magic bytes detected',
    };
  }
}
