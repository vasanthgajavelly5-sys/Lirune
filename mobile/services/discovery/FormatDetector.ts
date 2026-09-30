/**
 * Lirune Reader Mobile — Robust Format Detection Service
 * Detects format using file extension, MIME types, and binary magic bytes signatures.
 */

import { BookFormat, FormatInfo, getFormatFromExtension, SUPPORTED_FORMATS } from '@/models/Book';

export class FormatDetector {
  /**
   * Fast extension-based format lookup.
   */
  static fromFilename(filename: string): FormatInfo {
    return getFormatFromExtension(filename);
  }

  /**
   * Detects format from magic bytes (first 16-68 bytes of a file).
   */
  static fromMagicBytes(bytes: Uint8Array, fallbackFilename?: string): FormatInfo {
    if (bytes.length < 4) {
      return fallbackFilename ? getFormatFromExtension(fallbackFilename) : {
        id: 'unknown',
        label: 'Unknown Format',
        extensions: [],
        mime: 'application/octet-stream',
        supported: false,
      };
    }

    // 1. PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return SUPPORTED_FORMATS.pdf;
    }

    // 2. RTF: {\rtf (0x7B, 0x5C, 0x72, 0x74, 0x66)
    if (bytes.length >= 5 && bytes[0] === 0x7B && bytes[1] === 0x5C && bytes[2] === 0x72 && bytes[3] === 0x74 && bytes[4] === 0x66) {
      return SUPPORTED_FORMATS.rtf;
    }

    // 3. RAR: Rar! (0x52, 0x61, 0x72, 0x21)
    if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21) {
      if (fallbackFilename && fallbackFilename.toLowerCase().endsWith('.cbr')) {
        return SUPPORTED_FORMATS.cbr;
      }
      return SUPPORTED_FORMATS.rar;
    }

    // 4. CHM: ITSF (0x49, 0x54, 0x53, 0x46)
    if (bytes[0] === 0x49 && bytes[1] === 0x54 && bytes[2] === 0x53 && bytes[3] === 0x46) {
      return SUPPORTED_FORMATS.chm;
    }

    // 5. DjVu: AT&T (0x41, 0x54, 0x26, 0x54)
    if (bytes[0] === 0x41 && bytes[1] === 0x54 && bytes[2] === 0x26 && bytes[3] === 0x54) {
      return SUPPORTED_FORMATS.djvu;
    }

    // 6. Microsoft Compound Document (DOC / OLE2): 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
    if (
      bytes.length >= 8 &&
      bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 &&
      bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1
    ) {
      return SUPPORTED_FORMATS.doc;
    }

    // 7. Palm Database / MOBI / AZW / AZW3: Check for "BOOKMOBI" at offset 60..68
    if (bytes.length >= 68) {
      const mobiTag = String.fromCharCode(bytes[60], bytes[61], bytes[62], bytes[63], bytes[64], bytes[65], bytes[66], bytes[67]);
      if (mobiTag === 'BOOKMOBI') {
        if (fallbackFilename) {
          const lower = fallbackFilename.toLowerCase();
          if (lower.endsWith('.azw3') || lower.endsWith('.kf8')) return SUPPORTED_FORMATS.azw3;
          if (lower.endsWith('.azw')) return SUPPORTED_FORMATS.azw;
        }
        return SUPPORTED_FORMATS.mobi;
      }
    }

    // 8. ZIP-based containers: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
      if (fallbackFilename) {
        const lower = fallbackFilename.toLowerCase();
        if (lower.endsWith('.epub')) return SUPPORTED_FORMATS.epub;
        if (lower.endsWith('.cbz')) return SUPPORTED_FORMATS.cbz;
        if (lower.endsWith('.docx')) return SUPPORTED_FORMATS.docx;
        if (lower.endsWith('.odt')) return SUPPORTED_FORMATS.odt;
        if (lower.endsWith('.zip')) return SUPPORTED_FORMATS.zip;
      }
      return SUPPORTED_FORMATS.zip;
    }

    // 9. XML / FB2 / HTML detection
    const textHead = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 128)).trim();
    if (textHead.includes('<FictionBook')) {
      return SUPPORTED_FORMATS.fb2;
    }
    if (textHead.toLowerCase().includes('<!doctype html') || textHead.toLowerCase().includes('<html')) {
      return SUPPORTED_FORMATS.html;
    }

    // Fallback to filename extension
    if (fallbackFilename) {
      return getFormatFromExtension(fallbackFilename);
    }

    return SUPPORTED_FORMATS.txt;
  }
}
