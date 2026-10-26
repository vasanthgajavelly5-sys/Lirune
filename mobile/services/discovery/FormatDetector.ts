/**
 * Lirune Reader Mobile — Robust Format Detection Service
 * Detects format using binary magic byte signatures, container inspection, and file extension ties.
 */

import { getFormatFromExtension, SUPPORTED_FORMATS, type FormatInfo } from '../../models/Book.ts';

export interface DetectionResult extends FormatInfo {
  confidence: number;
  isDrm?: boolean;
  drmReason?: string;
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

      if (headerSnippet.includes('mimetypeapplication/epub+zip') || headerSnippet.includes('META-INF/container.xml')) {
        const hasRights = headerSnippet.includes('rights.xml');
        const hasEncryption = headerSnippet.includes('encryption.xml');
        return {
          ...SUPPORTED_FORMATS.epub,
          confidence: 1.0,
          isDrm: hasRights,
          drmReason: hasRights ? 'Adobe ADEPT rights.xml detected' : undefined,
        };
      }
      if (headerSnippet.includes('word/') || headerSnippet.includes('[Content_Types].xml')) {
        return { ...SUPPORTED_FORMATS.docx, confidence: 0.98 };
      }
      if (headerSnippet.includes('mimetypeapplication/vnd.oasis.opendocument.text')) {
        return { ...SUPPORTED_FORMATS.odt, confidence: 1.0 };
      }
      if (headerSnippet.includes('ComicInfo.xml')) {
        return { ...SUPPORTED_FORMATS.cbz, confidence: 0.98 };
      }

      if (ext === 'epub') return { ...SUPPORTED_FORMATS.epub, confidence: 0.85 };
      if (ext === 'cbz') return { ...SUPPORTED_FORMATS.cbz, confidence: 0.85 };
      if (ext === 'docx') return { ...SUPPORTED_FORMATS.docx, confidence: 0.85 };
      if (ext === 'odt') return { ...SUPPORTED_FORMATS.odt, confidence: 0.85 };

      return { ...SUPPORTED_FORMATS.cbz, confidence: 0.6 };
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
