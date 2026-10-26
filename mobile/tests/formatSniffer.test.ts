/**
 * Unit Tests: Content-based Format Sniffing, DRM Detection, and Container Verification
 * Tests 17+ formats, octet-stream/extensionless files, CB7, CBR, MOBI/KF8, and DRM flags.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormatDetector } from '../services/discovery/FormatDetector.ts';

test('detects PDF from magic bytes %PDF-', () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const res = FormatDetector.fromMagicBytes(bytes);
  assert.equal(res.id, 'pdf');
  assert.equal(res.confidence, 1.0);
  assert.equal(res.isDrm, false);
});

test('detects encrypted PDF DRM flag', () => {
  const latin = '%PDF-1.4\n/Encrypt 12 0 R\ntrailer\n';
  const bytes = new TextEncoder().encode(latin);
  const res = FormatDetector.fromMagicBytes(bytes);
  assert.equal(res.id, 'pdf');
  assert.equal(res.isDrm, true);
  assert.match(res.drmReason || '', /Encrypt/);
});

test('detects EPUB container and mimetype in ZIP stream', () => {
  const zipHeader = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...new TextEncoder().encode('mimetypeapplication/epub+zipMETA-INF/container.xml'),
  ]);
  const res = FormatDetector.fromMagicBytes(zipHeader, 'download.bin');
  assert.equal(res.id, 'epub');
  assert.equal(res.confidence, 1.0);
});

test('detects EPUB Adobe ADEPT DRM rights.xml', () => {
  const zipHeader = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...new TextEncoder().encode('mimetypeapplication/epub+zipMETA-INF/rights.xml'),
  ]);
  const res = FormatDetector.fromMagicBytes(zipHeader, 'sample.epub');
  assert.equal(res.id, 'epub');
  assert.equal(res.isDrm, true);
});

test('detects CBR from RAR signature', () => {
  const bytes = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
  const res = FormatDetector.fromMagicBytes(bytes, 'unknown_file');
  assert.equal(res.id, 'cbr');
  assert.ok(res.confidence >= 0.95);
});

test('detects CB7 from 7z signature', () => {
  const bytes = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04]);
  const res = FormatDetector.fromMagicBytes(bytes, 'archive.bin');
  assert.equal(res.id, 'cb7');
  assert.ok(res.confidence >= 0.95);
});

test('detects MOBI and AZW3/KF8 from PalmDOC BOOKMOBI header', () => {
  const mobiBytes = new Uint8Array(100);
  mobiBytes.set(new TextEncoder().encode('BOOKMOBI'), 60);
  const mobiRes = FormatDetector.fromMagicBytes(mobiBytes);
  assert.equal(mobiRes.id, 'mobi');

  // AZW3 with KF8 flag in header
  const azw3Bytes = new Uint8Array(120);
  azw3Bytes.set(new TextEncoder().encode('BOOKMOBI'), 60);
  azw3Bytes.set(new TextEncoder().encode('KF8'), 85);
  const azw3Res = FormatDetector.fromMagicBytes(azw3Bytes);
  assert.equal(azw3Res.id, 'azw3');
});

test('detects MOBI encryption DRM flag', () => {
  const drmBytes = new Uint8Array(100);
  drmBytes.set(new TextEncoder().encode('BOOKMOBI'), 60);
  drmBytes[78] = 0x00;
  drmBytes[79] = 0x02; // Encryption type 2
  const res = FormatDetector.fromMagicBytes(drmBytes);
  assert.equal(res.isDrm, true);
  assert.match(res.drmReason || '', /encryption type 2/);
});

test('detects FB2 XML root <FictionBook', () => {
  const xml = '<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">';
  const bytes = new TextEncoder().encode(xml);
  const res = FormatDetector.fromMagicBytes(bytes, 'book.bin');
  assert.equal(res.id, 'fb2');
  assert.ok(res.confidence >= 0.95);
});

test('detects HTML document structure', () => {
  const html = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>';
  const bytes = new TextEncoder().encode(html);
  const res = FormatDetector.fromMagicBytes(bytes, 'page.bin');
  assert.equal(res.id, 'html');
  assert.ok(res.confidence >= 0.95);
});

test('detects DjVu from AT&T FORM magic bytes', () => {
  const bytes = new Uint8Array([
    0x41, 0x54, 0x26, 0x54, 0x46, 0x4f, 0x52, 0x4d,
    0x00, 0x00, 0x10, 0x00, 0x44, 0x4a, 0x56, 0x55,
  ]);
  const res = FormatDetector.fromMagicBytes(bytes);
  assert.equal(res.id, 'djvu');
  assert.equal(res.confidence, 1.0);
});

test('detects CHM from ITSF header', () => {
  const bytes = new Uint8Array([0x49, 0x54, 0x53, 0x46, 0x03, 0x00, 0x00, 0x00]);
  const res = FormatDetector.fromMagicBytes(bytes);
  assert.equal(res.id, 'chm');
  assert.equal(res.confidence, 1.0);
});

test('detects RTF from {\\rtf magic bytes', () => {
  const bytes = new Uint8Array([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31, 0x5c, 0x61]);
  const res = FormatDetector.fromMagicBytes(bytes);
  assert.equal(res.id, 'rtf');
  assert.equal(res.confidence, 1.0);
});

test('detects Microsoft DOC from OLE2 Compound Document header', () => {
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const res = FormatDetector.fromMagicBytes(bytes);
  assert.equal(res.id, 'doc');
  assert.ok(res.confidence >= 0.95);
});

test('detects DOCX WordprocessingML package from ZIP header', () => {
  const bytes = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...new TextEncoder().encode('[Content_Types].xml word/document.xml'),
  ]);
  const res = FormatDetector.fromMagicBytes(bytes, 'document.bin');
  assert.equal(res.id, 'docx');
  assert.ok(res.confidence >= 0.95);
});

test('detects ODT OpenDocument package from ZIP header', () => {
  const bytes = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...new TextEncoder().encode('mimetypeapplication/vnd.oasis.opendocument.text'),
  ]);
  const res = FormatDetector.fromMagicBytes(bytes, 'document.bin');
  assert.equal(res.id, 'odt');
  assert.equal(res.confidence, 1.0);
});

test('detects Plain Text without NUL bytes in sample', () => {
  const text = 'Chapter 1: A Long-expected Party\nWhen Mr. Bilbo Baggins of Bag End announced...';
  const bytes = new TextEncoder().encode(text);
  const res = FormatDetector.fromMagicBytes(bytes);
  assert.equal(res.id, 'txt');
  assert.ok(res.confidence >= 0.8);
});

test('reports unknown format for random binary with no known signature and no extension', () => {
  const randomBinary = new Uint8Array([0x00, 0xff, 0xfe, 0x88, 0x12, 0x34, 0x56, 0x78]);
  const res = FormatDetector.fromMagicBytes(randomBinary);
  assert.equal(res.id, 'unknown');
  assert.equal(res.supported, false);
});
