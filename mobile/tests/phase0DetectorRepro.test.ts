import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { getFormatFromExtension, SUPPORTED_FORMATS } from '../models/Book.ts';

// Replicating the current FormatDetector logic exactly:
class CurrentFormatDetector {
  static fromFilename(filename: string) {
    return getFormatFromExtension(filename);
  }

  static fromMagicBytes(bytes: Uint8Array, fallbackFilename?: string) {
    if (bytes.length < 4) {
      return fallbackFilename ? getFormatFromExtension(fallbackFilename) : {
        id: 'unknown',
        label: 'Unknown Format',
        extensions: [],
        mime: 'application/octet-stream',
        supported: false,
      };
    }

    // 1. PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return SUPPORTED_FORMATS.pdf;
    }

    // 2. RTF
    if (bytes.length >= 5 && bytes[0] === 0x7B && bytes[1] === 0x5C && bytes[2] === 0x72 && bytes[3] === 0x74 && bytes[4] === 0x66) {
      return SUPPORTED_FORMATS.rtf;
    }

    // 3. RAR
    if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21) {
      if (fallbackFilename && fallbackFilename.toLowerCase().endsWith('.cbr')) {
        return SUPPORTED_FORMATS.cbr;
      }
      return SUPPORTED_FORMATS.rar;
    }

    // 4. CHM
    if (bytes[0] === 0x49 && bytes[1] === 0x54 && bytes[2] === 0x53 && bytes[3] === 0x46) {
      return SUPPORTED_FORMATS.chm;
    }

    // 5. DjVu
    if (bytes[0] === 0x41 && bytes[1] === 0x54 && bytes[2] === 0x26 && bytes[3] === 0x54) {
      return SUPPORTED_FORMATS.djvu;
    }

    // 6. DOC
    if (
      bytes.length >= 8 &&
      bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 &&
      bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1
    ) {
      return SUPPORTED_FORMATS.doc;
    }

    // 7. MOBI
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

    // 8. ZIP
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
      const headerSnippet = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 2048)));
      if (headerSnippet.includes('word/') || headerSnippet.includes('[Content_Types].xml')) {
        return SUPPORTED_FORMATS.docx;
      }
      if (headerSnippet.includes('mimetypeapplication/epub+zip') || headerSnippet.includes('META-INF/container.xml')) {
        return SUPPORTED_FORMATS.epub;
      }
      if (headerSnippet.includes('mimetypeapplication/vnd.oasis.opendocument.text')) {
        return SUPPORTED_FORMATS.odt;
      }
      if (headerSnippet.includes('ComicInfo.xml')) {
        return SUPPORTED_FORMATS.cbz;
      }
      if (fallbackFilename) {
        const lower = fallbackFilename.toLowerCase();
        if (lower.endsWith('.docx')) return SUPPORTED_FORMATS.docx;
        if (lower.endsWith('.epub')) return SUPPORTED_FORMATS.epub;
        if (lower.endsWith('.cbz')) return SUPPORTED_FORMATS.cbz;
        if (lower.endsWith('.odt')) return SUPPORTED_FORMATS.odt;
        if (lower.endsWith('.zip')) return SUPPORTED_FORMATS.zip;
      }
      return SUPPORTED_FORMATS.zip;
    }

    // 9. XML / FB2 / HTML
    const textHead = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 128)).trim();
    if (textHead.includes('<FictionBook')) {
      return SUPPORTED_FORMATS.fb2;
    }
    if (textHead.toLowerCase().includes('<!doctype html') || textHead.toLowerCase().includes('<html')) {
      return SUPPORTED_FORMATS.html;
    }

    if (fallbackFilename) {
      return getFormatFromExtension(fallbackFilename);
    }

    return SUPPORTED_FORMATS.txt;
  }
}

test('Phase 0 Format Detection Reproduction', () => {
  // Case 1: EPUB served with application/octet-stream and named "download.bin"
  const epubPath = path.resolve('../test-assets/big-epubs/epub_500_chapters.epub');
  let realEpub = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  if (fs.existsSync(epubPath)) {
    realEpub = new Uint8Array(fs.readFileSync(epubPath).subarray(0, 2048));
  }
  const epubOctet = CurrentFormatDetector.fromMagicBytes(realEpub, 'download.bin');
  console.log('EPUB with download.bin / application/octet-stream ->', epubOctet.id, epubOctet.supported);

  // Case 2: Extensionless file "my_novel" containing EPUB
  const epubExtensionless = CurrentFormatDetector.fromMagicBytes(realEpub, 'my_novel');
  console.log('EPUB with extensionless name "my_novel" ->', epubExtensionless.id, epubExtensionless.supported);

  // Case 3: MOBI with download.bin
  const mobiBytes = new Uint8Array(100);
  const tag = 'BOOKMOBI';
  for (let i = 0; i < tag.length; i++) mobiBytes[60 + i] = tag.charCodeAt(i);
  const mobiBin = CurrentFormatDetector.fromMagicBytes(mobiBytes, 'download.bin');
  console.log('MOBI with download.bin ->', mobiBin.id, mobiBin.supported);

  // Case 4: AZW3 with download.bin
  const azw3Bin = CurrentFormatDetector.fromMagicBytes(mobiBytes, 'download.bin');
  console.log('AZW3 with download.bin (no fallback ext) ->', azw3Bin.id); // Resolves as mobi, not azw3!

  // Case 5: FB2
  const fb2Xml = '<?xml version="1.0" encoding="utf-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">';
  const fb2Bytes = new TextEncoder().encode(fb2Xml);
  const fb2Bin = CurrentFormatDetector.fromMagicBytes(fb2Bytes, 'download.bin');
  console.log('FB2 with download.bin ->', fb2Bin.id, fb2Bin.supported);

  // Case 6: CBR (RAR container)
  const rarBytes = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00]);
  const cbrBin = CurrentFormatDetector.fromMagicBytes(rarBytes, 'download.bin');
  console.log('CBR with download.bin ->', cbrBin.id, cbrBin.supported); // Returns 'rar' (supported=false), NOT 'cbr'!

  // Case 7: CB7 (7-Zip container)
  const cb7Bytes = new Uint8Array([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C, 0x00]);
  const cb7Res = CurrentFormatDetector.fromMagicBytes(cb7Bytes, 'comic.cb7');
  console.log('CB7 with comic.cb7 ->', cb7Res.id, cb7Res.supported); // Returns 'txt' because 7z magic isn't handled!

  // Case 8: Extensionless file
  const extless = CurrentFormatDetector.fromFilename('my_document');
  console.log('Extensionless fromFilename ->', extless.id, extless.supported);
});
