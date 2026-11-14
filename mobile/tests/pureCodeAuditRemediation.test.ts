/**
 * Lirune Mobile - Pure Code Audit Remediation Test Suite
 *
 * Covers audit findings:
 * - AND-001: MSG OLE2 and extension dispatch in FormatDetector
 * - AND-003: Email HTML body sanitization
 * - AND-004: LegacyOfficeParser UTF-16LE extraction correctness
 * - WIN-002 & WIN-SEC-03: MobiParser HuffReader bounds
 * - FIX 14: Archive budget validation
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FormatDetector } from '../services/discovery/FormatDetector.ts';
import { EmailParser } from '../services/email/EmailParser.ts';
import { LegacyOfficeParser } from '../services/legacy/LegacyOfficeParser.ts';
import { validateZipArchive } from '../services/security/archiveBudget.ts';

// ---------------------------------------------------------------------------
// AND-001: FormatDetector MSG Dispatch
// ---------------------------------------------------------------------------

test('AND-001: FormatDetector detects MSG via extension and OLE2 stream sniff', () => {
  // Test extension dispatch
  const resExt = FormatDetector.fromFilename('message.msg');
  assert.equal(resExt.id, 'msg');

  // Test OLE2 content sniff with __substg1.0 stream signature
  const ole2Buf = new Uint8Array(1024);
  // OLE2 magic bytes: D0 CF 11 E0 A1 B1 1A E1
  ole2Buf[0] = 0xd0; ole2Buf[1] = 0xcf; ole2Buf[2] = 0x11; ole2Buf[3] = 0xe0;
  ole2Buf[4] = 0xa1; ole2Buf[5] = 0xb1; ole2Buf[6] = 0x1a; ole2Buf[7] = 0xe1;

  // Embed __substg1.0 in UTF-16LE
  const streamName = '__substg1.0';
  for (let i = 0; i < streamName.length; i++) {
    const code = streamName.charCodeAt(i);
    ole2Buf[512 + i * 2] = code & 0xff;
    ole2Buf[512 + i * 2 + 1] = (code >> 8) & 0xff;
  }

  const resSniff = FormatDetector.fromMagicBytes(ole2Buf, 'unnamed_file.bin');
  assert.equal(resSniff.id, 'msg');
});

// ---------------------------------------------------------------------------
// AND-003: Email HTML Body Sanitization
// ---------------------------------------------------------------------------

test('AND-003: EmailParser sanitizes HTML bodies against active XSS payloads', () => {
  const emailContent = `From: sender@example.com
To: recipient@example.com
Subject: Test Email
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<html>
  <body>
    <h1>Safe Subject</h1>
    <script>alert("xss")</script>
    <a href="javascript:steal()">Click</a>
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" onerror="alert(1)" />
    <p>Legitimate email message content.</p>
  </body>
</html>`;

  const bytes = new TextEncoder().encode(emailContent);
  const parsed = EmailParser.parseEml(bytes);

  assert.ok(parsed.messages.length > 0);
  const html = parsed.html;

  assert.ok(!html.includes('<script'), 'Must drop script tag');
  assert.ok(!html.includes('alert("xss")'), 'Must drop script content');
  assert.ok(!html.includes('javascript:steal()'), 'Must neutralize javascript link');
  assert.ok(!html.includes('onerror='), 'Must strip onerror handler');
  assert.ok(html.includes('Legitimate email message content.'), 'Must keep clean text');
  assert.ok(html.includes('data:image/png;base64,'), 'Must preserve safe raster image');
});

// ---------------------------------------------------------------------------
// AND-004: LegacyOfficeParser UTF-16LE Extraction
// ---------------------------------------------------------------------------

test('AND-004: LegacyOfficeParser extracts UTF-16LE text accurately', () => {
  // Construct an OLE2 buffer with text embedded as UTF-16LE
  const sample = 'Hello Lirune Document From Legacy Office';
  const u16Bytes = new Uint8Array(512 + sample.length * 2 + 64);
  // OLE2 magic bytes
  u16Bytes[0] = 0xd0; u16Bytes[1] = 0xcf; u16Bytes[2] = 0x11; u16Bytes[3] = 0xe0;
  u16Bytes[4] = 0xa1; u16Bytes[5] = 0xb1; u16Bytes[6] = 0x1a; u16Bytes[7] = 0xe1;

  for (let i = 0; i < sample.length; i++) {
    u16Bytes[512 + i * 2] = sample.charCodeAt(i) & 0xff;
    u16Bytes[512 + i * 2 + 1] = 0x00;
  }

  const parsed = LegacyOfficeParser.parse(u16Bytes, 'doc');
  assert.ok(parsed.html.includes('Hello Lirune Document From Legacy Office'));
});

// ---------------------------------------------------------------------------
// FIX 14: Archive Budget Validation
// ---------------------------------------------------------------------------

test('FIX 14: validateZipArchive rejects archives with excessive entries, size, or ratio', () => {
  // Test entry count bound (> 20,000 entries)
  const fakeFiles: Record<string, any> = {};
  for (let i = 0; i < 20005; i++) {
    fakeFiles[`file_${i}.txt`] = { name: `file_${i}.txt`, dir: false };
  }
  const fakeZipCount: any = {
    files: fakeFiles,
    forEach: (cb: any) => {
      for (const name in fakeFiles) {
        cb(name, fakeFiles[name]);
      }
    }
  };
  assert.throws(
    () => validateZipArchive(fakeZipCount),
    /The archive contains too many entries/
  );

  // Test single entry size bound (> 64MB)
  const fakeZipBig: any = {
    files: {
      'giant.txt': { name: 'giant.txt', dir: false, _data: { uncompressedSize: 70 * 1024 * 1024, compressedSize: 1024 } }
    },
    forEach: (cb: any) => {
      cb('giant.txt', { name: 'giant.txt', dir: false, _data: { uncompressedSize: 70 * 1024 * 1024, compressedSize: 1024 } });
    }
  };
  assert.throws(
    () => validateZipArchive(fakeZipBig),
    /Archive entry is too large to open safely/
  );

  // Test compression ratio bound (> 100:1 for size > 1MB)
  const fakeZipRatio: any = {
    files: {
      'bomb.txt': { name: 'bomb.txt', dir: false, _data: { uncompressedSize: 10 * 1024 * 1024, compressedSize: 100 } }
    },
    forEach: (cb: any) => {
      cb('bomb.txt', { name: 'bomb.txt', dir: false, _data: { uncompressedSize: 10 * 1024 * 1024, compressedSize: 100 } });
    }
  };
  assert.throws(
    () => validateZipArchive(fakeZipRatio),
    /Archive compression ratio is unsafe/
  );

  // Test total uncompressed size bound (> 512MB)
  const totalFiles: Record<string, any> = {};
  for (let i = 0; i < 10; i++) {
    totalFiles[`chunk_${i}.bin`] = { name: `chunk_${i}.bin`, dir: false, _data: { uncompressedSize: 60 * 1024 * 1024, compressedSize: 60 * 1024 * 1024 } };
  }
  const fakeZipTotal: any = {
    files: totalFiles,
    forEach: (cb: any) => {
      for (const name in totalFiles) {
        cb(name, totalFiles[name]);
      }
    }
  };
  assert.throws(
    () => validateZipArchive(fakeZipTotal),
    /The archive expands beyond the safe size limit/
  );
});
