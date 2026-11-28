const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;
globalThis.JSZip = JSZip;

// Load DocumentAdapter
const docAdapterSrc = fs.readFileSync(path.join(__dirname, '../../js/reader/documentAdapter.js'), 'utf8');
const DocumentAdapter = new Function(`
  const DOMParser = globalThis.DOMParser;
  const XMLSerializer = globalThis.XMLSerializer;
  const JSZip = globalThis.JSZip;
  ${docAdapterSrc}
  return DocumentAdapter;
`)();
globalThis.DocumentAdapter = DocumentAdapter;

// Load Formats
const BookFormat = require('../../js/formats.js');

// Load MobiAdapter
const mobiSrc = fs.readFileSync(path.join(__dirname, '../../js/reader/mobiAdapter.js'), 'utf8');
const MobiAdapter = new Function(`
  const DocumentAdapter = globalThis.DocumentAdapter;
  ${mobiSrc}
  return MobiAdapter;
`)();

// Load LegacySpreadsheetAdapter
const xlsSrc = fs.readFileSync(path.join(__dirname, '../../js/reader/legacySpreadsheetAdapter.js'), 'utf8');
const xlsModule = new Function(`
  ${xlsSrc}
  return LegacySpreadsheetAdapter;
`)();

// ─────────────────────────────────────────────────────────────────────────────
// WIN-SEC-01 & WIN-SEC-02: HTML Sanitization & Remote Resource Blocking
// ─────────────────────────────────────────────────────────────────────────────
test('WIN-SEC-01 & WIN-SEC-02: DocumentAdapter.sanitizeHtml with allowRemote: false', () => {
  const dirty = `
    <html>
      <head>
        <script>alert("exploit")</script>
        <style>body { background: url('https://evil.com/leak.png'); behavior: url(x); }</style>
      </head>
      <body>
        <a href="javascript:alert(1)" onclick="steal()">Click me</a>
        <a href="file:///etc/passwd">Local file link</a>
        <a href="https://example.com/legit">External link</a>
        <img src="https://tracking.com/beacon.gif" onerror="evil()" />
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" />
        <iframe src="https://evil.com"></iframe>
        <object data="evil.swf"></object>
        <embed src="evil.pdf"></embed>
        <form action="https://evil.com"><input type="text" /></form>
        <p style="color: red; expression(alert(1));">Safe text content</p>
      </body>
    </html>
  `;

  const cleaned = DocumentAdapter.sanitizeHtml(dirty, { allowRemote: false });

  assert.ok(!cleaned.includes('<script'), 'Must drop script tag');
  assert.ok(!cleaned.includes('alert("exploit")'), 'Must drop script body');
  assert.ok(!cleaned.includes('<iframe'), 'Must drop iframe tag');
  assert.ok(!cleaned.includes('<object'), 'Must drop object tag');
  assert.ok(!cleaned.includes('<embed'), 'Must drop embed tag');
  assert.ok(!cleaned.includes('<form'), 'Must drop form tag');
  assert.ok(!cleaned.includes('onclick='), 'Must strip onclick attribute');
  assert.ok(!cleaned.includes('onerror='), 'Must strip onerror attribute');
  assert.ok(!cleaned.includes('javascript:'), 'Must strip javascript: URI');
  assert.ok(!cleaned.includes('file:///etc/passwd'), 'Must strip file: URI');
  assert.ok(!cleaned.includes('https://tracking.com/beacon.gif'), 'Must strip remote image URL when allowRemote is false');
  assert.ok(cleaned.includes('href="https://example.com/legit"'), 'Must keep safe external link target');
  assert.ok(cleaned.includes('rel="noopener noreferrer"'), 'Must add noopener noreferrer to external link');
  assert.ok(!cleaned.includes('expression('), 'Must strip CSS expression');
  assert.ok(!cleaned.includes('behavior:'), 'Must strip CSS behavior');
  assert.ok(cleaned.includes('Safe text content'), 'Must preserve safe paragraph text');
  assert.ok(cleaned.includes('data:image/png;base64,'), 'Must preserve safe raster data URI');
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 14: ZIP Archive Budget & Decompression Bomb Protection
// ─────────────────────────────────────────────────────────────────────────────
test('FIX 14: validateZipBudget enforces entry count, size, and ratio bounds', () => {
  // Test entry count bound (> 20,000 entries)
  const fakeFiles = {};
  for (let i = 0; i < 20005; i++) {
    fakeFiles[`file_${i}.txt`] = { dir: false };
  }
  const fakeZipManyEntries = { files: fakeFiles };
  assert.throws(
    () => DocumentAdapter.validateZipBudget(fakeZipManyEntries),
    /The archive contains too many entries/
  );

  // Test single entry size bound (> 64MB)
  const fakeZipBigEntry = {
    files: {
      'giant.txt': { name: 'giant.txt', dir: false, _data: { uncompressedSize: 70 * 1024 * 1024, compressedSize: 1024 } }
    }
  };
  assert.throws(
    () => DocumentAdapter.validateZipBudget(fakeZipBigEntry),
    /too large to open safely/
  );

  // Test compression ratio bound (> 100:1 for size > 1MB)
  const fakeZipHighRatio = {
    files: {
      'bomb.txt': { name: 'bomb.txt', dir: false, _data: { uncompressedSize: 10 * 1024 * 1024, compressedSize: 100 } }
    }
  };
  assert.throws(
    () => DocumentAdapter.validateZipBudget(fakeZipHighRatio),
    /Archive compression ratio is unsafe/
  );

  // Test total uncompressed size bound (> 512MB)
  const totalFiles = {};
  for (let i = 0; i < 10; i++) {
    totalFiles[`chunk_${i}.bin`] = { name: `chunk_${i}.bin`, dir: false, _data: { uncompressedSize: 60 * 1024 * 1024, compressedSize: 60 * 1024 * 1024 } };
  }
  const fakeZipTotalHuge = { files: totalFiles };
  assert.throws(
    () => DocumentAdapter.validateZipBudget(fakeZipTotalHuge),
    /The archive expands beyond the safe memory limit/
  );

  // Normal safe zip passes
  const fakeSafeZip = {
    files: {
      'doc.xml': { dir: false, _data: { uncompressedSize: 5000, compressedSize: 1000 } },
      'img.png': { dir: false, _data: { uncompressedSize: 50000, compressedSize: 45000 } }
    }
  };
  assert.doesNotThrow(() => DocumentAdapter.validateZipBudget(fakeSafeZip));
});

// ─────────────────────────────────────────────────────────────────────────────
// WIN-001: Legacy XLS CFB Container Handling
// ─────────────────────────────────────────────────────────────────────────────
test('WIN-001: LegacySpreadsheetAdapter.parseWorkbook does not crash when cfb.find is a module function', () => {
  // Mock CFB container and module
  const mockContainer = {
    FileIndex: [
      { name: 'Root Entry', type: 5 },
      { name: 'Workbook', type: 2, content: new Uint8Array([0x09, 0x08, 0x08, 0x00]) }
    ]
  };
  const mockCfbModule = {
    find: (container, name) => {
      const entry = container.FileIndex.find((e) => e.name === name || e.name === name.replace('/', ''));
      return entry || null;
    }
  };

  const parsed = xlsModule.parseWorkbook(new Uint8Array(100), mockContainer, mockCfbModule);
  assert.ok(parsed, 'Workbook should parse successfully without cfb.find is not a function TypeError');
  assert.equal(Array.isArray(parsed), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// WIN-002 & WIN-SEC-03: MOBI HUFF Recursion and Decompression Limit
// ─────────────────────────────────────────────────────────────────────────────
test('WIN-002 & WIN-SEC-03: HuffReader.unpack enforces max recursion depth (64) and byte budget (64MB)', () => {
  const huffReader = Object.create(MobiAdapter.HuffReader.prototype);

  assert.throws(
    () => huffReader.unpack(new Uint8Array(10), 65),
    /recursion depth limit exceeded/
  );

  // Exceeded total uncompressed bytes
  huffReader.dict1 = new Array(256).fill({ terminal: true, codeLength: 8, maxCode: 255 });
  huffReader.dictionary = [{ bytes: new Uint8Array(100), isReference: false }];
  assert.throws(
    () => huffReader.unpack(new Uint8Array(10), 0, { totalBytes: 65 * 1024 * 1024 }),
    /decompressed size limit exceeded/
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// WIN-007 & WIN-008: Format Detection for OLE2 Subtypes and ZIP Containers
// ─────────────────────────────────────────────────────────────────────────────
test('WIN-007: OLE2 subtype sniffing correctly classifies msg, doc, xls, ppt, wps', async () => {
  // Helper to build OLE2 buffer with UTF-16LE stream name embedded
  function createOle2WithStream(streamName) {
    const buf = new Uint8Array(1024);
    // OLE2 header: D0 CF 11 E0 A1 B1 1A E1
    buf[0] = 0xD0; buf[1] = 0xCF; buf[2] = 0x11; buf[3] = 0xE0;
    buf[4] = 0xA1; buf[5] = 0xB1; buf[6] = 0x1A; buf[7] = 0xE1;
    // Embed stream name as UTF-16LE at offset 512
    const offset = 512;
    for (let i = 0; i < streamName.length; i++) {
      const code = streamName.charCodeAt(i);
      buf[offset + i * 2] = code & 0xFF;
      buf[offset + i * 2 + 1] = (code >> 8) & 0xFF;
    }
    return buf;
  }

  const msgRes = await BookFormat.detect('sample.bin', createOle2WithStream('__substg1.0').buffer);
  assert.equal(msgRes.id, 'msg');

  const docRes = await BookFormat.detect('sample.bin', createOle2WithStream('WordDocument').buffer);
  assert.equal(docRes.id, 'doc');

  const xlsRes = await BookFormat.detect('sample.bin', createOle2WithStream('Workbook').buffer);
  assert.equal(xlsRes.id, 'xls');

  const pptRes = await BookFormat.detect('sample.bin', createOle2WithStream('PowerPoint Document').buffer);
  assert.equal(pptRes.id, 'ppt');

  const wpsRes = await BookFormat.detect('sample.bin', createOle2WithStream('WPS Office Doc').buffer);
  assert.equal(wpsRes.id, 'wps');
});
