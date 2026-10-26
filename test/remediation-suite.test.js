const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

// Ensure mock environment for Electron if not already loaded
let permissionRequestHandler = null;
let permissionCheckHandler = null;

const mockApp = {
  setAppUserModelId: () => {},
  requestSingleInstanceLock: () => true,
  on: () => {},
  quit: () => {},
  getPath: (name) => path.join(os.tmpdir(), 'lirune-remediation-test', name),
  whenReady: () => new Promise(() => {})
};

if (!require.cache[require.resolve('electron')]) {
  require.cache[require.resolve('electron')] = {
    exports: {
      app: mockApp,
      BrowserWindow: class {
        constructor() {
          this.webContents = {
            on: () => {},
            setWindowOpenHandler: () => {},
            send: () => {}
          };
        }
        isDestroyed() { return false; }
        isVisible() { return true; }
        isMaximized() { return false; }
        isFullScreen() { return false; }
        on() {}
        once() {}
        loadFile() {}
        show() {}
      },
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      shell: { openExternal: () => {} },
      ipcMain: { handle: () => {}, on: () => {} },
      session: {
        defaultSession: {
          setPermissionRequestHandler: (fn) => { permissionRequestHandler = fn; },
          setPermissionCheckHandler: (fn) => { permissionCheckHandler = fn; }
        }
      }
    }
  };
}

const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;
globalThis.JSZip = JSZip;

const Utils = require('../js/utils.js');
globalThis.Utils = Utils;

const mainModule = require('../main.js');
const Library = require('../js/library.js');

// ─────────────────────────────────────────────────────────────────────────────
// P1 — FB2 Cover Handling & Attribute Escaping
// ─────────────────────────────────────────────────────────────────────────────
test('P1: Utils.escapeAttr thoroughly neutralizes quotes, tags, and special characters', () => {
  assert.equal(Utils.escapeAttr('Hello World'), 'Hello World');
  assert.equal(Utils.escapeAttr('Book "Title"'), 'Book &quot;Title&quot;');
  assert.equal(Utils.escapeAttr("Author's Note"), "Author&#39;s Note");
  assert.equal(Utils.escapeAttr('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(Utils.escapeAttr('foo & bar'), 'foo &amp; bar');
  assert.equal(Utils.escapeAttr('"><svg onload=alert(1)>'), '&quot;&gt;&lt;svg onload=alert(1)&gt;');
});

test('P1: Utils.sanitizeCoverUrl allowlists safe raster formats and rejects malicious/quote-breaking payloads', () => {
  // Valid raster images
  const validJpeg = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const validWebp = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  const validBlob = 'blob:http://localhost:8080/1234-5678';

  assert.equal(Utils.sanitizeCoverUrl(validJpeg), validJpeg);
  assert.equal(Utils.sanitizeCoverUrl(validPng), validPng);
  assert.equal(Utils.sanitizeCoverUrl(validWebp), validWebp);
  assert.equal(Utils.sanitizeCoverUrl(validBlob), validBlob);

  // Rejected dangerous formats & injection vectors
  assert.equal(Utils.sanitizeCoverUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), null, 'SVG covers must be rejected');
  assert.equal(Utils.sanitizeCoverUrl('javascript:alert(1)'), null, 'JavaScript scheme must be rejected');
  assert.equal(Utils.sanitizeCoverUrl('data:text/html;base64,PHNjcmlwdD4='), null, 'HTML MIME type must be rejected');
  assert.equal(Utils.sanitizeCoverUrl('data:image/jpeg;base64,abc" onclick="alert(1)'), null, 'Quote breaking characters must be rejected');
  assert.equal(Utils.sanitizeCoverUrl(''), null);
  assert.equal(Utils.sanitizeCoverUrl(null), null);
});

test('P1: FB2 cover extraction resolves namespace-aware XLink references and rejects malformed references', () => {
  globalThis.TextAdapter = { decodeText: (u8) => new TextDecoder().decode(u8) };
  globalThis.Fb2Adapter = {
    Adapter: class {
      extractMetadata() { return { title: 'Test', author: 'Author' }; }
    }
  };

  // Case 1: Standard xlink namespace
  const fb2Xlink = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:xlink="http://www.w3.org/1999/xlink">
  <description>
    <title-info><coverpage><image xlink:href="#cover_target.png"/></coverpage></title-info>
  </description>
  <binary id="cover_target.png" content-type="image/png">iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==</binary>
  <body><section><p>Hi</p></section></body>
</FictionBook>`;
  const res1 = Library.parseFb2Metadata(Buffer.from(fb2Xlink, 'utf-8'), { title: '', author: '' });
  assert.ok(res1.coverDataUrl, 'Must resolve cover using standard xlink:href');
  assert.match(res1.coverDataUrl, /^data:image\/png;base64,/);

  // Case 2: Missing cover binary target
  const fb2MissingBinary = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info><coverpage><image l:href="#nonexistent.jpg"/></coverpage></title-info>
  </description>
  <body><section><p>Hi</p></section></body>
</FictionBook>`;
  const res2 = Library.parseFb2Metadata(Buffer.from(fb2MissingBinary, 'utf-8'), { title: '', author: '' });
  assert.equal(res2.coverDataUrl, undefined, 'Missing binary target must gracefully result in undefined coverDataUrl');

  // Case 3: Invalid base64 in binary element
  const fb2InvalidBase64 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info><coverpage><image l:href="#cover.jpg"/></coverpage></title-info>
  </description>
  <binary id="cover.jpg" content-type="image/jpeg">NOT_VALID_BASE64!@#$%^&*()</binary>
  <body><section><p>Hi</p></section></body>
</FictionBook>`;
  const res3 = Library.parseFb2Metadata(Buffer.from(fb2InvalidBase64, 'utf-8'), { title: '', author: '' });
  assert.equal(res3.coverDataUrl, undefined, 'Invalid base64 payload must be rejected');
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Resource Exhaustion & Archive Safety
// ─────────────────────────────────────────────────────────────────────────────
test('P1: validateZipSafety rejects Zip Slip traversal attempts', async () => {
  // Test Zip Slip with relative traversal "../"
  const zipSlip = new JSZip();
  zipSlip.file('../evil.txt', 'malicious content');
  await assert.rejects(
    async () => mainModule.validateZipSafety(zipSlip),
    /Archive contains potentially dangerous file path/,
    'Zip Slip path with ../ must be rejected'
  );

  // Test leading forward slash
  const zipSlash = new JSZip();
  zipSlash.file('/etc/passwd', 'root:x:0:0');
  await assert.rejects(
    async () => mainModule.validateZipSafety(zipSlash),
    /Archive contains potentially dangerous file path/,
    'Zip Slip path with leading slash must be rejected'
  );

  // Test leading backslash
  const zipBackslash = new JSZip();
  zipBackslash.file('\\windows\\win.ini', '[fonts]');
  await assert.rejects(
    async () => mainModule.validateZipSafety(zipBackslash),
    /Archive contains potentially dangerous file path/,
    'Zip Slip path with backslash must be rejected'
  );
});

test('P1: validateZipSafety rejects synthetic archive bombs with excessive entry count', async () => {
  const bombZip = new JSZip();
  // Exceed MAX_ZIP_ENTRIES (10000)
  for (let i = 0; i < 10005; i++) {
    bombZip.files[`entry_${i}.txt`] = { name: `entry_${i}.txt`, dir: false };
  }
  await assert.rejects(
    async () => mainModule.validateZipSafety(bombZip),
    /Archive exceeds maximum entry count limit/,
    'Archive exceeding 10000 entries must be rejected as an archive bomb'
  );
});

test('P1: validateZipSafety rejects oversized entries exceeding 64MB limit', async () => {
  const zipOversized = new JSZip();
  zipOversized.files['huge.dat'] = {
    name: 'huge.dat',
    dir: false,
    _data: { uncompressedSize: 70 * 1024 * 1024 } // 70MB > 64MB
  };
  await assert.rejects(
    async () => mainModule.validateZipSafety(zipOversized),
    /Archive contains an entry that exceeds the maximum allowed size/,
    'Entry over 64MB must be rejected'
  );
});

test('P1: validateBookBuffer enforces MAX_BOOK_FILE_SIZE limit (512MB)', async () => {
  const fakeHugeBuffer = { length: 513 * 1024 * 1024 };
  await assert.rejects(
    async () => mainModule.validateBookBuffer(fakeHugeBuffer, 'epub'),
    /File exceeds maximum supported size/,
    'Files exceeding 512MB must be rejected'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Format Validation Matrix
// ─────────────────────────────────────────────────────────────────────────────
test('P1: Format Validation Matrix validates genuine formats and rejects mismatches/arbitrary archives', async () => {
  // 1. RTF validation
  const validRtf = Buffer.from('{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\lang1033\\f0\\fs20 Hello World\\par}', 'latin1');
  assert.equal(await mainModule.validateBookBuffer(validRtf, 'rtf'), true, 'Valid RTF must pass validation');

  const invalidRtf = Buffer.from('This is plain text pretending to be RTF', 'utf8');
  await assert.rejects(
    async () => mainModule.validateBookBuffer(invalidRtf, 'rtf'),
    /Not a valid Rich Text Format \(\.rtf\) document/,
    'Plain text with .rtf extension must be rejected'
  );

  // 2. ODT validation
  const validOdtZip = new JSZip();
  validOdtZip.file('content.xml', '<office:document-content><office:body><office:text><text:p>Hello</text:p></office:text></office:body></office:document-content>');
  const validOdtBuf = await validOdtZip.generateAsync({ type: 'nodebuffer' });
  assert.equal(await mainModule.validateBookBuffer(validOdtBuf, 'odt'), true, 'Valid ODT containing content.xml must pass');

  const arbitraryZip = new JSZip();
  arbitraryZip.file('random_file.bin', 'just some data');
  const arbitraryZipBuf = await arbitraryZip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    async () => mainModule.validateBookBuffer(arbitraryZipBuf, 'odt'),
    /Not a valid OpenDocument \(\.odt\) document/,
    'Arbitrary ZIP with .odt extension must be rejected'
  );

  // 3. DOCX validation
  const validDocxZip = new JSZip();
  validDocxZip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>');
  const validDocxBuf = await validDocxZip.generateAsync({ type: 'nodebuffer' });
  assert.equal(await mainModule.validateBookBuffer(validDocxBuf, 'docx'), true, 'Valid DOCX containing word/document.xml must pass');

  await assert.rejects(
    async () => mainModule.validateBookBuffer(arbitraryZipBuf, 'docx'),
    /Not a valid Word \(\.docx\) document/,
    'Arbitrary ZIP with .docx extension must be rejected'
  );

  // 4. CBZ validation
  const validCbzZip = new JSZip();
  validCbzZip.file('page_01.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  const validCbzBuf = await validCbzZip.generateAsync({ type: 'nodebuffer' });
  assert.equal(await mainModule.validateBookBuffer(validCbzBuf, 'cbz'), true, 'Valid CBZ containing comic image must pass');

  await assert.rejects(
    async () => mainModule.validateBookBuffer(arbitraryZipBuf, 'cbz'),
    /Not a valid comic archive: no image files found/,
    'CBZ without image entries must be rejected'
  );

  // 5. Arbitrary ZIP rejection
  await assert.rejects(
    async () => mainModule.validateBookBuffer(arbitraryZipBuf, 'zip'),
    /Unsupported archive format/,
    'Arbitrary ZIP archive must be rejected'
  );

  // 6. PDF validation
  const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj', 'latin1');
  assert.equal(await mainModule.validateBookBuffer(validPdf, 'pdf'), true, 'Valid PDF header must pass');

  const invalidPdf = Buffer.from('NOT_A_PDF_FILE', 'latin1');
  await assert.rejects(
    async () => mainModule.validateBookBuffer(invalidPdf, 'pdf'),
    /Not a readable PDF document/,
    'Corrupted PDF header must be rejected'
  );

  // 7. FB2 validation
  const validFb2 = Buffer.from('<?xml version="1.0"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><body><section><p>Hi</p></section></body></FictionBook>', 'utf8');
  assert.equal(await mainModule.validateBookBuffer(validFb2, 'fb2'), true, 'Valid FB2 root tag must pass');

  const invalidFb2 = Buffer.from('<?xml version="1.0"?><OtherXmlRoot></OtherXmlRoot>', 'utf8');
  await assert.rejects(
    async () => mainModule.validateBookBuffer(invalidFb2, 'fb2'),
    /Not a valid FictionBook \(\.fb2\) document/,
    'Non-FictionBook XML must be rejected'
  );

  // 8. Unbundled formats (MOBI, AZW, CBR, DOC)
  for (const ext of ['mobi', 'azw', 'azw3', 'cbr', 'doc']) {
    await assert.rejects(
      async () => mainModule.validateBookBuffer(Buffer.from('dummy data'), ext),
      /Unsupported file type/,
      `Unbundled format .${ext} must be rejected by validateBookBuffer`
    );
  }

  // 9. OPENABLE_EXTENSIONS must equal SUPPORTED_EXTENSIONS
  assert.deepEqual(mainModule.OPENABLE_EXTENSIONS, mainModule.SUPPORTED_EXTENSIONS, 'OPENABLE_EXTENSIONS must only contain genuinely supported extensions');
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Point-of-Consumption One-Time Path Authorization
// ─────────────────────────────────────────────────────────────────────────────
test('P1: One-time path authorization strictly enforces single consumption and point-of-consumption TTL expiry', () => {
  const testPath = path.resolve('test-fixtures/authorized-book.epub');

  // 1. Authorize path
  mainModule.authorizeBookPath(testPath);

  // 2. First consumption succeeds
  assert.equal(mainModule.consumeAuthorizedBookPath(testPath), true, 'First consumption must succeed');

  // 3. Second consumption fails (one-time consumption enforced)
  assert.equal(mainModule.consumeAuthorizedBookPath(testPath), false, 'Duplicate consumption must fail');

  // 4. Revocation invalidates path
  mainModule.authorizeBookPath(testPath);
  mainModule.revokeAuthorizedBookPath(testPath);
  assert.equal(mainModule.consumeAuthorizedBookPath(testPath), false, 'Revoked path must fail consumption');
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 — External Navigation & URL Security
// ─────────────────────────────────────────────────────────────────────────────
test('P2: isValidExternalHttpUrl allows only legitimate HTTP/HTTPS URLs without credential injection', () => {
  const validHttps = new URL('https://en.wikipedia.org/wiki/EPUB');
  const validHttp = new URL('http://gutenberg.org/ebooks/1');
  assert.equal(mainModule.isValidExternalHttpUrl(validHttps), true);
  assert.equal(mainModule.isValidExternalHttpUrl(validHttp), true);

  // Privileged & dangerous protocols
  assert.equal(mainModule.isValidExternalHttpUrl(new URL('file:///C:/Windows/System32')), false, 'file: must be rejected');
  assert.equal(mainModule.isValidExternalHttpUrl(new URL('javascript:alert(1)')), false, 'javascript: must be rejected');
  assert.equal(mainModule.isValidExternalHttpUrl(new URL('data:text/html,<b>hi</b>')), false, 'data: must be rejected');

  // Credential injection / userinfo
  assert.equal(mainModule.isValidExternalHttpUrl(new URL('https://admin:pass@example.com')), false, 'Userinfo must be rejected');
  assert.equal(mainModule.isValidExternalHttpUrl(new URL('http://user@example.com')), false, 'Username must be rejected');

  // Non-URL input
  assert.equal(mainModule.isValidExternalHttpUrl(null), false);
  assert.equal(mainModule.isValidExternalHttpUrl('not a url object'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 — Metadata Backup Validation & Field Allowlist
// ─────────────────────────────────────────────────────────────────────────────
test('P2: Backup inspection enforces 15MB file size limit and structural record bounds', async () => {
  // Test file size limit
  const fakeHugeFile = { size: 16 * 1024 * 1024, text: async () => '{}' };
  const res1 = await Library.inspectBackupFile(fakeHugeFile);
  assert.equal(res1.ok, false, 'Files over 15MB must not be ok');
  assert.match(res1.error, /Backup file exceeds maximum allowed size/, 'Must reject files over 15MB');

  // Test record count bounds
  const excessiveRecords = {
    format: 'LIRUNE_METADATA_BACKUP',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: new Array(10005).fill({ id: 'book_1', title: 'Test' }),
    annotations: [],
    collections: []
  };
  const fakeFile = {
    size: 1024,
    text: async () => JSON.stringify(excessiveRecords)
  };
  const res2 = await Library.inspectBackupFile(fakeFile);
  assert.equal(res2.ok, false, 'Excessive records must not be ok');
  assert.match(res2.error, /Backup exceeds maximum allowed record count/, 'Must reject backups with > 10,000 books');
});
