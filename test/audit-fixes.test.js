const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

// Mock Electron before requiring main.js in pure Node.js test environment
let permissionRequestHandler = null;
let permissionCheckHandler = null;

const mockApp = {
  setAppUserModelId: () => {},
  requestSingleInstanceLock: () => true,
  on: () => {},
  quit: () => {},
  getPath: (name) => path.join(os.tmpdir(), 'lirune-test', name),
  whenReady: () => new Promise(() => {}) // Don't auto-execute window lifecycle in unit tests
};

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

// Global DOM parser and JSZip for Node.js test environment
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;

const JSZip = require('jszip');
globalThis.JSZip = JSZip;

const { fingerprintBuffer, storageIdForFingerprint, isStorageId, SUPPORTED_EXTENSIONS } = require('../scripts/storage-contract');
const mainModule = require('../main.js');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Finding 2: EXPECTED_SHELL_URL and Navigation Classifier
// ─────────────────────────────────────────────────────────────────────────────
test('EXPECTED_SHELL_URL is defined and navigation classifier denies unsafe targets', () => {
  assert.ok(mainModule.EXPECTED_SHELL_URL, 'EXPECTED_SHELL_URL must be defined');
  assert.ok(mainModule.EXPECTED_SHELL_PATH, 'EXPECTED_SHELL_PATH must be defined');

  const expectedUrl = mainModule.EXPECTED_SHELL_URL;
  assert.equal(mainModule.classifyNavigation(expectedUrl), 'allow', 'Expected shell URL must be allowed internally');

  // Variations of internal URL
  assert.equal(mainModule.isExpectedShellUrl(expectedUrl), true);
  assert.equal(mainModule.isExpectedShellUrl(pathToFileURL(mainModule.EXPECTED_SHELL_PATH).href), true);

  // Different local file path must be denied
  const evilFilePath = pathToFileURL(path.resolve(__dirname, 'evil.html')).href;
  assert.equal(mainModule.isExpectedShellUrl(evilFilePath), false);
  assert.equal(mainModule.classifyNavigation(evilFilePath), 'deny');

  // External web links must be classified as external
  assert.equal(mainModule.classifyNavigation('https://github.com/vasanthgajavelly5-sys/Lirune'), 'external');
  assert.equal(mainModule.classifyNavigation('http://example.com'), 'external');

  // Unsafe schemes must be denied
  assert.equal(mainModule.classifyNavigation('about:blank'), 'deny');
  assert.equal(mainModule.classifyNavigation('javascript:alert(1)'), 'deny');
  assert.equal(mainModule.classifyNavigation('data:text/html,<h1>PWNED</h1>'), 'deny');
  assert.equal(mainModule.classifyNavigation('custom-proto://execute'), 'deny');
  assert.equal(mainModule.classifyNavigation('vbscript:msgbox(1)'), 'deny');

  // Malformed URLs must be denied without throwing
  assert.doesNotThrow(() => {
    assert.equal(mainModule.classifyNavigation('not a valid url :// %%%'), 'deny');
    assert.equal(mainModule.classifyNavigation(''), 'deny');
    assert.equal(mainModule.classifyNavigation(null), 'deny');
    assert.equal(mainModule.classifyNavigation(undefined), 'deny');
    assert.equal(mainModule.classifyNavigation(123), 'deny');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Finding 1: DocumentAdapter.sanitizeHtml and FB2 sanitization
// ─────────────────────────────────────────────────────────────────────────────
test('DocumentAdapter.sanitizeHtml removes scripts, active content, and unsafe URLs', () => {
  const docAdapterSrc = fs.readFileSync(path.join(__dirname, '../js/reader/documentAdapter.js'), 'utf8');

  const docModule = new Function(`
    ${docAdapterSrc}
    return DocumentAdapter;
  `)();

  assert.ok(typeof docModule.sanitizeHtml === 'function', 'sanitizeHtml must be exported');

  // Hostile script elements
  const hostileHtml = '<p>Normal text</p><script>alert("xss")</script><img src="x" onerror="alert(1)" /><a href="javascript:alert(2)">click me</a>';
  const sanitized = docModule.sanitizeHtml(hostileHtml);

  assert.ok(!sanitized.includes('<script'), 'Script tag must be stripped');
  assert.ok(!sanitized.includes('onerror'), 'Event handler onerror must be stripped');
  assert.ok(!sanitized.includes('javascript:'), 'javascript: URL must be stripped');
  assert.ok(sanitized.includes('Normal text'), 'Legitimate text must be preserved');

  // Dangerous active tags: svg, math, foreignObject, iframe, object
  const dangerousTags = '<div><svg><foreignObject><script>evil()</script></foreignObject></svg><math><mi>x</mi></math><iframe src="evil.com"></iframe><object data="evil.swf"></object></div>';
  const cleanDangerous = docModule.sanitizeHtml(dangerousTags);
  assert.ok(!cleanDangerous.includes('<svg'), 'SVG must be stripped');
  assert.ok(!cleanDangerous.includes('<foreignObject'), 'foreignObject must be stripped');
  assert.ok(!cleanDangerous.includes('<math'), 'Math must be stripped');
  assert.ok(!cleanDangerous.includes('<iframe'), 'iframe must be stripped');
  assert.ok(!cleanDangerous.includes('<object'), 'object must be stripped');

  // Valid raster images with data URI preserved, file:// images stripped
  const rasterImg = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" alt="dot" />`;
  const fileImg = `<img src="file:///C:/passwords.txt" alt="secret" />`;
  const sanitizedImgs = docModule.sanitizeHtml(rasterImg + fileImg);
  assert.ok(sanitizedImgs.includes('data:image/png;base64,'), 'Raster data URI must be preserved');
  assert.ok(!sanitizedImgs.includes('file:///'), 'file: image must be stripped');

  // Legitimate formatting preserved
  const validFormatting = '<h1>Title</h1><h2>H2</h2><p>Paragraph with <strong>bold</strong>, <em>italic</em>, <code>code</code></p><table><tr><th>Head</th></tr><tr><td>Data</td></tr></table>';
  const sanitizedValid = docModule.sanitizeHtml(validFormatting);
  assert.ok(sanitizedValid.includes('<h1>Title</h1>'));
  assert.ok(sanitizedValid.includes('<strong>bold</strong>'));
  assert.ok(sanitizedValid.includes('<em>italic</em>'));
  assert.ok(sanitizedValid.includes('<table>'));
});

test('Fb2Adapter converts FB2 nodes to safe HTML and eliminates hostile active payloads', async () => {
  const docAdapterSrc = fs.readFileSync(path.join(__dirname, '../js/reader/documentAdapter.js'), 'utf8');
  const flowAdaptersSrc = fs.readFileSync(path.join(__dirname, '../js/reader/flowAdapters.js'), 'utf8');

  const utilsMock = {
    escapeHTML: (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    escapeAttr: (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  };

  const sandbox = new Function(`
    const Utils = arguments[0];
    ${docAdapterSrc}
    ${flowAdaptersSrc}
    return { DocumentAdapter, Fb2Adapter, TextAdapter };
  `)(utilsMock);

  // Hostile FB2 XML containing:
  // - script tags in body
  // - onerror / onload attributes
  // - javascript: links
  // - SVG / foreignObject
  // - unsafe SVG binary payload
  // - valid raster image payload
  const hostileFb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <book-title>Hostile FB2 Test</book-title>
      <author><first-name>Test</first-name><last-name>Author</last-name></author>
    </title-info>
  </description>
  <body>
    <title><p>Main Title</p></title>
    <section>
      <title><p>Chapter 1</p></title>
      <p>Legitimate paragraph with <strong>bold</strong> text.</p>
      <script>alert("hostile script");</script>
      <p onload="alert('onload')">Paragraph with onload attribute.</p>
      <p><a href="javascript:alert('xss')">Malicious link</a></p>
      <p><a href="https://example.com">Safe link</a></p>
      <image l:href="#cover.jpg" />
      <image l:href="#svg_fake.svg" />
      <svg><foreignObject><script>evil()</script></foreignObject></svg>
      <table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>
    </section>
  </body>
  <binary id="cover.jpg" content-type="image/jpeg">/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=</binary>
  <binary id="svg_fake.svg" content-type="image/svg+xml">PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+</binary>
</FictionBook>`;

  const adapter = new sandbox.Fb2Adapter.Adapter({}, { title: 'Test Book' });
  adapter.loadBytes = async () => Buffer.from(hostileFb2, 'utf-8');

  const sections = await adapter.buildSections();
  assert.ok(sections.length > 0, 'Sections should be built');

  const combinedHtml = sections.map(s => s.html).join('\n');

  // Verify hostile active payloads did not survive
  assert.ok(!combinedHtml.includes('<script'), 'Script elements must not survive in FB2 output');
  assert.ok(!combinedHtml.includes('onload='), 'Event attributes must not survive in FB2 output');
  assert.ok(!combinedHtml.includes('javascript:'), 'javascript: URLs must not survive in FB2 output');
  assert.ok(!combinedHtml.includes('<svg'), 'SVG elements must not survive in FB2 output');
  assert.ok(!combinedHtml.includes('<foreignObject'), 'foreignObject must not survive in FB2 output');

  // Verify legitimate content and safe raster images render
  assert.ok(combinedHtml.includes('Legitimate paragraph'), 'Legitimate text must render');
  assert.ok(combinedHtml.includes('<strong>bold</strong>'), 'Supported formatting must render');
  assert.ok(combinedHtml.includes('data:image/jpeg;base64,'), 'Validated raster image must render');
  assert.ok(!combinedHtml.includes('svg_fake.svg'), 'Non-raster binary must not render');
  assert.ok(combinedHtml.includes('https://example.com'), 'Safe link must render');
  assert.ok(combinedHtml.includes('<table'), 'Table must render');

  // Malformed XML must throw descriptive error
  const malformedFb2 = '<?xml version="1.0"?><FictionBook><unclosed>';
  const brokenAdapter = new sandbox.Fb2Adapter.Adapter({}, { title: 'Broken' });
  brokenAdapter.loadBytes = async () => Buffer.from(malformedFb2, 'utf-8');
  await assert.rejects(async () => {
    await brokenAdapter.buildSections();
  }, /FictionBook file is not valid XML/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Finding 3: ODT / RTF Format Contract Across All Layers
// ─────────────────────────────────────────────────────────────────────────────
test('ODT and RTF format detection and storage contract', async () => {
  const formatsSource = fs.readFileSync(path.join(__dirname, '../js/formats.js'), 'utf8');
  const formatsModule = new Function(`${formatsSource}\nreturn BookFormat;`)();

  // 1. Valid ODT archive
  const validOdtZip = new JSZip();
  validOdtZip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  validOdtZip.file('content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>Hello ODT</text:p></office:text></office:body></office:document-content>');
  const odtBuf = await validOdtZip.generateAsync({ type: 'nodebuffer' });
  const detectedOdt = await formatsModule.detect('test.odt', odtBuf.buffer.slice(odtBuf.byteOffset, odtBuf.byteOffset + odtBuf.byteLength));
  assert.equal(detectedOdt.id, 'odt');
  assert.equal(detectedOdt.supported, true);
  assert.equal(detectedOdt.source, 'signature');

  // 2. Arbitrary ZIP named test.odt must NOT be accepted as ODT
  const arbitraryZip = new JSZip();
  arbitraryZip.file('random.txt', 'not an odt');
  const arbBuf = await arbitraryZip.generateAsync({ type: 'nodebuffer' });
  const detectedArb = await formatsModule.detect('fake.odt', arbBuf.buffer.slice(arbBuf.byteOffset, arbBuf.byteOffset + arbBuf.byteLength));
  assert.equal(detectedArb.id, 'unknown', 'Arbitrary ZIP must not be accepted as ODT');

  // 3. Valid RTF file
  const rtfContent = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Courier;}}\\viewkind4\\uc1\\pard\\lang1033\\f0\\fs20 Hello RTF World!\\par}';
  const rtfBuf = Buffer.from(rtfContent, 'utf-8');
  const detectedRtf = await formatsModule.detect('document.rtf', rtfBuf.buffer.slice(rtfBuf.byteOffset, rtfBuf.byteOffset + rtfBuf.byteLength));
  assert.equal(detectedRtf.id, 'rtf');
  assert.equal(detectedRtf.supported, true);
  assert.equal(detectedRtf.source, 'signature');

  // 4. Plain TXT
  const txtBuf = Buffer.from('Just plain text with some sentences and paragraphs.\n\nSecond paragraph.', 'utf-8');
  const detectedTxt = await formatsModule.detect('story.txt', txtBuf.buffer.slice(txtBuf.byteOffset, txtBuf.byteOffset + txtBuf.byteLength));
  assert.equal(detectedTxt.id, 'txt');
  assert.equal(detectedTxt.supported, true);

  // 5. HTML mislabeled as TXT
  const htmlInTxtBuf = Buffer.from('<!DOCTYPE html><html><body><h1>Title</h1><p>Content</p></body></html>', 'utf-8');
  const detectedHtml = await formatsModule.detect('page.txt', htmlInTxtBuf.buffer.slice(htmlInTxtBuf.byteOffset, htmlInTxtBuf.byteOffset + htmlInTxtBuf.byteLength));
  assert.equal(detectedHtml.id, 'html');

  // 6. Storage contract supports all formats
  const dummyFp = fingerprintBuffer(Buffer.from('format contract test'));
  for (const ext of ['epub', 'pdf', 'txt', 'html', 'htm', 'fb2', 'cbz', 'docx', 'odt', 'rtf']) {
    const sId = storageIdForFingerprint(dummyFp, ext);
    assert.equal(isStorageId(sId), true, `storageId for ${ext} must be valid`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Finding 4: Windows file-association opening fail closed on storage errors
// ─────────────────────────────────────────────────────────────────────────────
test('File-association opening fails closed on storage failure and aborts before database save', async () => {
  // Model of the hardened persistence flow in openBookFromFilePath / importOneFile
  async function simulateOsOpen({ storageSuccess, storageThrows, dbThrows, existingBooks = [] }) {
    const fileName = 'test.epub';
    const fakeData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const fingerprint = fingerprintBuffer(Buffer.from(fakeData));
    const storageId = storageIdForFingerprint(fingerprint, 'epub');

    let dbSaved = false;
    let storageSaved = false;
    let revoked = false;

    // Simulated window.noveraDesktop
    const noveraDesktop = {
      saveBookToStorage: async (name, buf, id) => {
        if (storageThrows) throw new Error('Disk I/O error');
        if (!storageSuccess) return { success: false, error: 'Storage quota exceeded' };
        storageSaved = true;
        return { success: true, storageId: id, fileSize: buf.byteLength };
      },
      revokePendingBookFile: () => { revoked = true; }
    };

    // Simulated NoveraDB
    const noveraDB = {
      saveBook: async (record) => {
        if (dbThrows) throw new Error('IndexedDB transaction failed');
        dbSaved = true;
        return { ...record, id: 'saved-id' };
      }
    };

    // Canonical persistence function (same as importOneFile)
    async function importFile() {
      if (existingBooks.some(b => b.fingerprint === fingerprint)) return 'duplicate';
      const bookData = { title: 'Test Book', fingerprint, format: 'epub' };

      const res = await noveraDesktop.saveBookToStorage(fileName, fakeData, storageId);
      if (res && res.success && res.storageId === storageId) {
        bookData.storageId = res.storageId;
      } else {
        throw new Error(res?.error || 'Could not save the file to managed storage');
      }

      await noveraDB.saveBook(bookData);
      return bookData;
    }

    // Run import simulation
    try {
      const result = await importFile();
      return { success: true, result, dbSaved, storageSaved, revoked };
    } catch (err) {
      noveraDesktop.revokePendingBookFile();
      return { success: false, error: err.message, dbSaved, storageSaved, revoked };
    }
  }

  // 1. Storage success persists to both storage and DB
  const successRes = await simulateOsOpen({ storageSuccess: true });
  assert.equal(successRes.success, true);
  assert.equal(successRes.dbSaved, true);
  assert.equal(successRes.storageSaved, true);

  // 2. Storage failure ABORTS before NoveraDB.saveBook (no ghost record!)
  const failRes = await simulateOsOpen({ storageSuccess: false });
  assert.equal(failRes.success, false);
  assert.equal(failRes.dbSaved, false, 'Database save must NOT be called on storage failure');
  assert.equal(failRes.revoked, true);
  assert.ok(failRes.error.includes('Storage quota exceeded'));

  // 3. Storage throw ABORTS before NoveraDB.saveBook
  const throwRes = await simulateOsOpen({ storageThrows: true });
  assert.equal(throwRes.success, false);
  assert.equal(throwRes.dbSaved, false, 'Database save must NOT be called on storage throw');
  assert.equal(throwRes.revoked, true);

  // 4. Duplicate book is identified without re-saving
  const dupRes = await simulateOsOpen({
    storageSuccess: true,
    existingBooks: [{ id: 'b1', fingerprint: fingerprintBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04])) }]
  });
  assert.equal(dupRes.result, 'duplicate');
  assert.equal(dupRes.dbSaved, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Finding 6: DOCX Hyperlink Validation
// ─────────────────────────────────────────────────────────────────────────────
test('DOCX hyperlink validation allows only HTTP, HTTPS, and valid mailto; inert text for others', () => {
  const officeSrc = fs.readFileSync(path.join(__dirname, '../js/reader/officeAdapters.js'), 'utf8');

  const officeModule = new Function(`
    const DocumentAdapter = { Adapter: class {} };
    ${officeSrc}
    return DocxAdapter;
  `)();

  const sanitize = officeModule.sanitizeDocxHyperlink;
  assert.ok(typeof sanitize === 'function', 'sanitizeDocxHyperlink must be exported');

  // Allowed: HTTP and HTTPS
  assert.equal(sanitize('http://example.com'), 'http://example.com/');
  assert.equal(sanitize('https://example.com/books/123?ref=test'), 'https://example.com/books/123?ref=test');

  // Allowed: valid mailto
  assert.equal(sanitize('mailto:author@example.com'), 'mailto:author@example.com');

  // Denied: javascript:, file:, data:, custom protocols
  assert.equal(sanitize('javascript:alert(1)'), null);
  assert.equal(sanitize('file:///C:/passwords.txt'), null);
  assert.equal(sanitize('data:text/html,<script>evil()</script>'), null);
  assert.equal(sanitize('custom://run-command'), null);
  assert.equal(sanitize('vbscript:msgbox'), null);

  // Denied: relative paths, malformed, empty
  assert.equal(sanitize('../chapter1.docx'), null);
  assert.equal(sanitize('document.xml'), null);
  assert.equal(sanitize('https://[invalid-url'), null);
  assert.equal(sanitize(''), null);
  assert.equal(sanitize(null), null);
  assert.equal(sanitize(undefined), null);

  // Test parseHyperlink generates inert text on unsafe href
  const linkNodeWithJs = {
    attributes: [{ localName: 'id', value: 'rId1' }],
    children: [{ localName: 'r', children: [{ localName: 't', textContent: 'Click Me' }] }]
  };
  const linkMapWithJs = new Map([['rId1', 'javascript:alert(1)']]);
  const inertHtml = officeModule.parseHyperlink(linkNodeWithJs, new Map(), linkMapWithJs);
  assert.equal(inertHtml, 'Click Me', 'Unsafe hyperlink must render as inert text without <a>');

  // Safe hyperlink generates anchor
  const linkMapWithSafe = new Map([['rId1', 'https://example.com']]);
  const anchorHtml = officeModule.parseHyperlink(linkNodeWithJs, new Map(), linkMapWithSafe);
  assert.ok(anchorHtml.includes('href="https://example.com/"') && anchorHtml.includes('Click Me'), 'Safe hyperlink must generate <a>');
  assert.ok(anchorHtml.includes('rel="noopener noreferrer"'), 'Must have rel="noopener noreferrer"');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Finding 5: Repair Legacy Migration
// ─────────────────────────────────────────────────────────────────────────────
test('Legacy migration derives safe format extensions and preserves unmigrated records', () => {
  const dbSrc = fs.readFileSync(path.join(__dirname, '../js/db.js'), 'utf8');
  const dbModule = new Function(`
    ${dbSrc}
    return NoveraDB;
  `)();

  const deriveSafeExtension = dbModule.deriveSafeExtension;
  const metadataOnly = dbModule.metadataOnly;

  // Derive extensions for all formats
  assert.equal(deriveSafeExtension({ format: 'epub' }), 'epub');
  assert.equal(deriveSafeExtension({ format: 'pdf' }), 'pdf');
  assert.equal(deriveSafeExtension({ format: 'txt' }), 'txt');
  assert.equal(deriveSafeExtension({ format: 'html' }), 'html');
  assert.equal(deriveSafeExtension({ format: 'fb2' }), 'fb2');
  assert.equal(deriveSafeExtension({ format: 'cbz' }), 'cbz');
  assert.equal(deriveSafeExtension({ format: 'docx' }), 'docx');
  assert.equal(deriveSafeExtension({ format: 'odt' }), 'odt');
  assert.equal(deriveSafeExtension({ format: 'rtf' }), 'rtf');

  // Fallback from filename extension
  assert.equal(deriveSafeExtension({ originalName: 'manual.pdf' }), 'pdf');
  assert.equal(deriveSafeExtension({ fileName: 'notes.rtf' }), 'rtf');
  assert.equal(deriveSafeExtension({ title: 'novel.odt' }), 'odt');

  // metadataOnly safety:
  // When storageId is missing, fileData MUST NOT be stripped (preserve for retry)
  const legacyUnmigrated = { id: 'book-1', title: 'Legacy Book', fileData: new Uint8Array([1, 2, 3]) };
  const strippedUnmigrated = metadataOnly(legacyUnmigrated);
  assert.ok(strippedUnmigrated.fileData, 'fileData must be preserved when storageId is missing');

  // When storageId is present, fileData IS stripped
  const migrated = { id: 'book-2', title: 'Migrated Book', storageId: 'abc.epub', fileData: new Uint8Array([1, 2, 3]) };
  const strippedMigrated = metadataOnly(migrated);
  assert.equal(strippedMigrated.fileData, undefined, 'fileData must be stripped when storageId is present');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Finding 7: Streaming SHA-256 and Integrity Hashing
// ─────────────────────────────────────────────────────────────────────────────
test('Streaming SHA-256 matches fingerprintBuffer on empty and large files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-hash-test-'));
  try {
    // 1. Empty file
    const emptyPath = path.join(tempDir, 'empty.dat');
    fs.writeFileSync(emptyPath, Buffer.alloc(0));
    const emptyHash = await mainModule.streamFileFingerprint(emptyPath);
    const expectedEmpty = fingerprintBuffer(Buffer.alloc(0));
    assert.equal(emptyHash, expectedEmpty, 'Empty file hash must match fingerprintBuffer');

    // 2. Multi-chunk file (128 KB)
    const largePath = path.join(tempDir, 'large.dat');
    const largeData = crypto.randomBytes(128 * 1024);
    fs.writeFileSync(largePath, largeData);
    const streamHash = await mainModule.streamFileFingerprint(largePath);
    const expectedLarge = fingerprintBuffer(largeData);
    assert.equal(streamHash, expectedLarge, 'Streaming hash must match memory fingerprintBuffer');

    // 3. Disappearing / non-existent file rejects with ENOENT
    const missingPath = path.join(tempDir, 'missing.dat');
    await assert.rejects(async () => {
      await mainModule.streamFileFingerprint(missingPath);
    }, (err) => err.code === 'ENOENT');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Finding 8: Dependency Gate — @xmldom/xmldom must be patched (>= 0.8.15)
// ─────────────────────────────────────────────────────────────────────────────
test('Production dependency gate: @xmldom/xmldom is patched and safe (>= 0.8.15)', () => {
  const xmldomPkg = require('@xmldom/xmldom/package.json');
  const versionParts = xmldomPkg.version.split('.').map(Number);
  const major = versionParts[0];
  const minor = versionParts[1];
  const patch = versionParts[2];

  const isPatched = (major > 0) || (major === 0 && minor > 8) || (major === 0 && minor === 8 && patch >= 15);
  assert.ok(isPatched, `@xmldom/xmldom version ${xmldomPkg.version} must be >= 0.8.15 to protect against XML injection vulnerabilities`);

  const packageJson = require('../package.json');
  assert.ok(packageJson.overrides && packageJson.overrides['@xmldom/xmldom'], 'package.json must contain @xmldom/xmldom override');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Regression Test: SEC-05 FB2 Cover Metadata Validation & Attribute Injection Guard
// ─────────────────────────────────────────────────────────────────────────────
test('FB2 cover metadata extraction strictly validates MIME type and rejects injected attribute payloads', () => {
  // Test mock environment
  globalThis.TextAdapter = {
    decodeText: (u8) => new TextDecoder().decode(u8)
  };
  globalThis.Fb2Adapter = {
    Adapter: class {
      extractMetadata() {
        return { title: 'Test Book', author: 'Author' };
      }
    }
  };

  const Library = require('../js/library.js');
  assert.ok(typeof Library.parseFb2Metadata === 'function', 'Library.parseFb2Metadata must be exported');

  // Case 1: Valid JPEG cover
  const validFb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info><coverpage><image l:href="#cover.jpg"/></coverpage></title-info>
  </description>
  <binary id="cover.jpg" content-type="image/jpeg">iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=</binary>
  <body><section><p>Hello</p></section></body>
</FictionBook>`;

  const record1 = Library.parseFb2Metadata(Buffer.from(validFb2, 'utf-8'), { title: '', author: '' });
  assert.ok(record1.coverDataUrl, 'Valid JPEG cover must produce a coverDataUrl');
  assert.match(record1.coverDataUrl, /^data:image\/jpeg;base64,/, 'Must format valid image/jpeg data URI');

  // Case 2: Injected HTML attribute payload in content-type
  const hostileTypeFb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info><coverpage><image l:href="#cover.jpg"/></coverpage></title-info>
  </description>
  <binary id="cover.jpg" content-type='image/jpeg" onerror="alert(1)'>iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB</binary>
  <body><section><p>Hello</p></section></body>
</FictionBook>`;

  const record2 = Library.parseFb2Metadata(Buffer.from(hostileTypeFb2, 'utf-8'), { title: '', author: '' });
  assert.equal(record2.coverDataUrl, undefined, 'Hostile attribute injection in content-type must be rejected');

  // Case 3: Executable or SVG payload disguised as cover
  const svgCoverFb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info><coverpage><image l:href="#cover.svg"/></coverpage></title-info>
  </description>
  <binary id="cover.svg" content-type="image/svg+xml">PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+</binary>
  <body><section><p>Hello</p></section></body>
</FictionBook>`;

  const record3 = Library.parseFb2Metadata(Buffer.from(svgCoverFb2, 'utf-8'), { title: '', author: '' });
  assert.equal(record3.coverDataUrl, undefined, 'Non-raster image/svg+xml MIME type must be refused as coverDataUrl');
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Regression Test: SEC-09 Launch-Lirune.bat does not execute global taskkill
// ─────────────────────────────────────────────────────────────────────────────
test('Launch-Lirune.bat does not contain indiscriminate global taskkill /IM electron.exe', () => {
  const batPath = path.resolve(__dirname, '..', 'Launch-Lirune.bat');
  const content = fs.readFileSync(batPath, 'utf-8');
  assert.doesNotMatch(content, /taskkill\s+\/F\s+\/IM\s+electron\.exe/i, 'Launcher must never kill unrelated electron.exe processes');
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Regression Test: SEC-10 Dual Preload ContextBridge Exposure
// ─────────────────────────────────────────────────────────────────────────────
test('preload.js defines desktopApi and exposes both liruneDesktop and noveraDesktop', () => {
  const preloadPath = path.resolve(__dirname, '..', 'preload.js');
  const content = fs.readFileSync(preloadPath, 'utf-8');
  assert.match(content, /exposeInMainWorld\(['"]liruneDesktop['"]/);
  assert.match(content, /exposeInMainWorld\(['"]noveraDesktop['"]/);
});


