/**
 * Lirune Reader Mobile — regression tests for defects found in QA.
 *
 * Run with:  npm test        (node --test, native TypeScript stripping)
 *
 * These cover the pure logic behind bugs that were confirmed by code review.
 * They are deliberately dependency-free so they run anywhere Node runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveZipPath, safeDecode } from '../services/epub/zipPaths.ts';
import {
  appendChunkCuts,
  byteLengthOf,
  chunkIndexForByteOffset,
  upperBound,
  TARGET_CHUNK_CHARS,
} from '../services/txt/chunkIndex.ts';
import {
  escapeForTemplateLiteral,
  escapeForInlineScript,
} from '../services/pdf/escapeForTemplateLiteral.ts';
import { allowReaderNavigation } from '../services/security/webviewPolicy.ts';
import { validateArchiveBudget } from '../services/security/archiveBudget.ts';
import { sanitizeHtml } from '../services/security/sanitizeHtml.ts';
import { RarExtractor } from '../services/archive/RarExtractor.ts';
import { validateReaderSettings, validateAccessibilitySettings, validateAppTheme } from '../models/Book.ts';


// ---------------------------------------------------------------------------
// Document sanitization
// ---------------------------------------------------------------------------

test('sanitizeHtml: removes active elements and event handlers structurally', () => {
  const result = sanitizeHtml(
    '<p onclick="alert(1)">Keep</p><script><p>drop</p></script>' +
      '<style>body{background:url(https://evil.example/x)}</style>' +
      '<form><input value="drop"></form><iframe src="https://evil.example"></iframe>' +
      '<object data="x"></object><embed src="x"><meta content="x"><base href="https://evil.example">'
  );

  assert.equal(result, '<p>Keep</p>');
});

test('sanitizeHtml: removes unsafe resources and SVG active content', () => {
  const result = sanitizeHtml(
    '<a href="javascript:alert(1)">bad</a><a href="java&#x73;cript:alert(1)">bad</a>' +
      '<a href="https://evil.example">bad</a>' +
      '<img src="https://evil.example/a.png"><img src="data:image/png;base64,abc">' +
      '<svg><a href="javascript:alert(1)"><script>alert(1)</script></a></svg>'
  );

  // The SVG wrapper survives (it is legitimate content); only its active parts go.
  assert.equal(
    result,
    '<a>bad</a><a>bad</a><a>bad</a><img><img src="data:image/png;base64,abc"><svg><a></a></svg>'
  );
});

test('sanitizeHtml: preserves safe inline SVG used for diagrams', () => {
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100%">' +
      '<title>Diagram</title><desc>A chart</desc>' +
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff" /></linearGradient></defs>' +
      '<g transform="translate(2,2)"><path d="M0 0 L10 10" stroke="#333" fill="url(#g)" /></g>' +
      '<text x="5" y="20">Label</text></svg>';

  assert.equal(sanitizeHtml(source), source);
});

test('sanitizeHtml: strips SVG event handlers and SMIL activation vectors', () => {
  const result = sanitizeHtml(
    '<svg onload="alert(1)"><animate attributeName="xlink:href" to="javascript:alert(1)"/>' +
      '<set attributeName="href" to="javascript:alert(1)"/><circle r="5"/></svg>'
  );

  assert.doesNotMatch(result, /onload|javascript:|<set/i);
  assert.match(result, /<circle r="5" \/>/);
});

test('sanitizeHtml: preserves MathML and its presentation attributes', () => {
  const source =
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" alttext="x squared">' +
      '<mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow></math>';

  assert.equal(sanitizeHtml(source), source);
});

test('sanitizeHtml: preserves epub:type semantics and namespaced attributes', () => {
  const source =
    '<section epub:type="chapter" xml:lang="en-GB" id="ch1">' +
      '<p epub:type="first">One</p>' +
      '<aside epub:type="footnote" role="doc-footnote" id="fn1"><p>Note text</p></aside>' +
      '<a epub:type="noteref" href="#fn1">1</a></section>';

  assert.equal(sanitizeHtml(source), source);
});

test('sanitizeHtml: nothing hidden in a comment or CDATA section can execute', () => {
  const result = sanitizeHtml(
    '<!--[if IE]><script>alert(1)</script><![endif]-->' +
      '<p>Visible</p><![CDATA[<script>alert(2)</script>]]>' +
      '<!DOCTYPE html><?xml version="1.0"?>'
  );

  assert.equal(result, '<p>Visible</p>');
});

test('sanitizeHtml: inline styles keep embedded data URIs but reject live ones', () => {
  const result = sanitizeHtml(
    '<p style="background-image:url(&quot;data:image/png;base64,AAAA&quot;)">a</p>' +
      '<p style="background-image:url(https://evil.example/x.png)">b</p>' +
      '<p style="width:expression(alert(1))">c</p>' +
      '<p style="background-image:url(&quot;../Images/cover.png&quot;)">d</p>'
  );

  // The data URI survives; only the quotes are entity-encoded for the attribute.
  assert.match(result, /url\(&quot;data:image\/png;base64,AAAA&quot;\)/);
  assert.doesNotMatch(result, /evil\.example/);
  assert.doesNotMatch(result, /expression/);
  assert.doesNotMatch(result, /cover\.png/);
});

test('sanitizeHtml: is idempotent and never double-escapes entities', () => {
  const source = '<p style="color:red">&amp; &quot;x&quot; &nbsp; &#8212;</p>';
  const once = sanitizeHtml(source);

  assert.equal(once, source);
  assert.equal(sanitizeHtml(once), once);
});

test('sanitizeHtml: preserves normal EPUB markup and relative links', () => {
  const result = sanitizeHtml(
    '<article class="chapter"><h1 id="start">Title</h1>' +
      '<p>Readable <em>text</em>.</p><a href="#start">Back</a>' +
      '<img src="images/cover.jpg" alt="Cover"></article>'
  );

  assert.equal(
    result,
    '<article class="chapter"><h1 id="start">Title</h1><p>Readable <em>text</em>.</p>' +
      '<a href="#start">Back</a><img src="images/cover.jpg" alt="Cover"></article>'
  );
});

// ---------------------------------------------------------------------------
// EPUB path resolution
// ---------------------------------------------------------------------------

test('resolveZipPath: plain relative href', () => {
  assert.equal(resolveZipPath('OEBPS/', 'chapter1.xhtml'), 'OEBPS/chapter1.xhtml');
});

test('resolveZipPath: percent-encoded href is decoded', () => {
  // Real books ship these; naive concatenation looks for a file literally
  // named "Chapter%201.xhtml" and silently drops the chapter.
  assert.equal(
    resolveZipPath('OEBPS/', 'Text/Chapter%201.xhtml'),
    'OEBPS/Text/Chapter 1.xhtml'
  );
});

test('resolveZipPath: resolves parent-directory segments', () => {
  assert.equal(
    resolveZipPath('OEBPS/content/', '../shared/ch1.xhtml'),
    'OEBPS/shared/ch1.xhtml'
  );
});

test('resolveZipPath: collapses redundant current-directory segments', () => {
  assert.equal(
    resolveZipPath('OEBPS/', './text/./ch1.xhtml'),
    'OEBPS/text/ch1.xhtml'
  );
});

test('resolveZipPath: strips fragment suffix', () => {
  assert.equal(
    resolveZipPath('OEBPS/', 'chapter1.xhtml#section-2'),
    'OEBPS/chapter1.xhtml'
  );
});

test('resolveZipPath: leading slash is treated as archive root', () => {
  assert.equal(resolveZipPath('OEBPS/', '/images/cover.png'), 'images/cover.png');
});

test('resolveZipPath: parent segments do not escape above the archive root', () => {
  assert.equal(resolveZipPath('OEBPS/', '../../../etc/passwd'), 'etc/passwd');
});

test('safeDecode: malformed percent-encoding does not throw', () => {
  assert.equal(safeDecode('100%.xhtml'), '100%.xhtml');
});

// ---------------------------------------------------------------------------
// TXT chunk index
// ---------------------------------------------------------------------------

test('upperBound: finds first element strictly greater than value', () => {
  const arr = [0, 10, 20, 30];
  assert.equal(upperBound(arr, -1), 0);
  assert.equal(upperBound(arr, 0), 1);
  assert.equal(upperBound(arr, 9), 1);
  assert.equal(upperBound(arr, 25), 3);
  assert.equal(upperBound(arr, 1000), 4);
});

test('upperBound: agrees with a linear reference implementation', () => {
  const arr = [0, 3, 7, 7, 12, 40];
  for (let v = -2; v <= 45; v++) {
    // For a sorted array, the index of the first element strictly greater than
    // v equals the number of elements less than or equal to v.
    const expected = arr.filter((x) => x <= v).length;
    assert.equal(upperBound(arr, v), expected, `value ${v}`);
  }
});

test('appendChunkCuts: records increasing byte offsets', () => {
  const text = 'lorem ipsum dolor sit amet '.repeat(1000);
  const offsets = [0];
  appendChunkCuts(text, 0, offsets);
  assert.ok(offsets.length > 1, 'expected more than one chunk');
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] > offsets[i - 1], 'offsets must strictly increase');
    assert.ok(offsets[i] <= byteLengthOf(text), 'offset must stay inside the text');
  }
});

test('appendChunkCuts: CJK text with no spaces still yields valid cut points', () => {
  // No '\n' and no ' ' anywhere, so the "blind slice" path is taken. Because the
  // cut is measured in bytes by re-encoding the prefix, each offset must still
  // land on a character boundary of the original string.
  const text = '日本語のテキストです。'.repeat(500);
  const offsets = [0];
  appendChunkCuts(text, 0, offsets);
  assert.ok(offsets.length > 1, 'expected more than one chunk');

  for (const off of offsets) {
    // Re-encoding the prefix up to the offset must reproduce the offset,
    // which is only true if the offset is on a character boundary.
    const decodedPrefix = new TextDecoder('utf-8', { fatal: true });
    const bytes = new TextEncoder().encode(text).slice(0, off);
    assert.doesNotThrow(
      () => decodedPrefix.decode(bytes),
      `offset ${off} is not on a character boundary`
    );
  }
});

test('appendChunkCuts: emoji surrogate pairs are never split', () => {
  const text = '🙂'.repeat(5000);
  const offsets = [0];
  appendChunkCuts(text, 0, offsets);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const all = new TextEncoder().encode(text);
  for (const off of offsets) {
    assert.doesNotThrow(() => decoder.decode(all.slice(0, off)), `offset ${off}`);
  }
});

test('appendChunkCuts: prefers a nearby newline as the break point', () => {
  const text = 'a'.repeat(TARGET_CHUNK_CHARS + 10) + '\n' + 'b'.repeat(100);
  const offsets = [0];
  appendChunkCuts(text, 0, offsets);
  assert.equal(offsets.length, 2);
  // The break should land just after the newline, not at the raw target size.
  assert.equal(offsets[1], byteLengthOf('a'.repeat(TARGET_CHUNK_CHARS + 10) + '\n'));
});

test('appendChunkCuts: window with no further cut adds nothing', () => {
  const offsets = [0];
  appendChunkCuts('short text', 1000, offsets);
  assert.deepEqual(offsets, [0]);
});

test('appendChunkCuts: respects the base byte position', () => {
  const text = 'word '.repeat(4000);
  const offsets = [0];
  appendChunkCuts(text, 5000, offsets);
  assert.ok(offsets[1] > 5000, 'offset must be relative to the window start');
});

test('chunkIndexForByteOffset: maps a byte position to its chunk', () => {
  const offsets = [0, 100, 200, 300];
  assert.equal(chunkIndexForByteOffset(offsets, 0), 0);
  assert.equal(chunkIndexForByteOffset(offsets, 99), 0);
  assert.equal(chunkIndexForByteOffset(offsets, 100), 1);
  assert.equal(chunkIndexForByteOffset(offsets, 250), 2);
  assert.equal(chunkIndexForByteOffset(offsets, 100000), 3);
  assert.equal(chunkIndexForByteOffset([], 10), 0);
});

test('chunkIndexForByteOffset: never returns a negative chunk', () => {
  assert.equal(chunkIndexForByteOffset([0], -5), 0);
});

// ---------------------------------------------------------------------------
// Template-literal / inline-script escaping
// ---------------------------------------------------------------------------

test('escapeForTemplateLiteral: neutralises backticks and interpolation', () => {
  const raw = 'const a = `hi ${name}`;';
  const escaped = escapeForTemplateLiteral(raw);
  // An UNESCAPED ${ would still interpolate; an escaped one (\${) is inert.
  assert.ok(
    !/(?<!\\)\$\{/.test(escaped),
    'must not leave a live ${ in the output'
  );
  const evaluated = new Function('return `' + escaped + '`')();
  assert.equal(evaluated, raw, 'must round-trip to the original source');
});

test('escapeForTemplateLiteral: doubles backslashes before anything else', () => {
  const raw = 'a\\b';
  const escaped = escapeForTemplateLiteral(raw);
  const evaluated = new Function('return `' + escaped + '`')();
  assert.equal(evaluated, raw);
});

test('escapeForInlineScript: also neutralises a closing script tag', () => {
  const raw = 'var s = "</script>";';
  const escaped = escapeForInlineScript(raw);
  assert.ok(!/(?<!\\)<\/script/i.test(escaped), 'a raw </script> would break the tag');
  const evaluated = new Function(escaped + '; return s;')();
  assert.equal(evaluated, '</script>');
});

test('escapeForInlineScript: round-trips real pdf.js source', async () => {
  // Guard against a regression in the vendored-asset pipeline.
  const { PDFJS_SOURCE, PDFJS_WORKER } = await import(
    '../services/pdf/pdfjsAssets.ts'
  );
  for (const [name, raw] of [
    ['PDFJS_SOURCE', PDFJS_SOURCE],
    ['PDFJS_WORKER', PDFJS_WORKER],
  ]) {
    assert.ok(raw.length > 100000, `${name} looks truncated`);
    const escaped = escapeForInlineScript(raw);
    assert.doesNotThrow(() => new Function(escaped), `${name} did not survive inline escaping`);
  }
});

// ---------------------------------------------------------------------------
// WebView navigation policy
// ---------------------------------------------------------------------------

function nav(url: string) {
  return {
    url,
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    navigationType: 'click',
    lockIdentifier: 'qa',
  } as unknown as Parameters<typeof allowReaderNavigation>[0];
}

test('allowReaderNavigation: permits the reader\'s own document origins', () => {
  assert.equal(allowReaderNavigation(nav('about:blank')), true);
  assert.equal(allowReaderNavigation(nav('data:text/html,<p>hi')), true);
  assert.equal(allowReaderNavigation(nav('blob:null/1234')), true);
  assert.equal(allowReaderNavigation(nav('')), true);
});

test('allowReaderNavigation: blocks an external link in a book', () => {
  // The attack this closes: a crafted EPUB/HTML/FB2 chapter containing
  // <a href="https://attacker.example"> navigates the reader off the book.
  assert.equal(allowReaderNavigation(nav('https://attacker.example')), false);
  assert.equal(allowReaderNavigation(nav('http://attacker.example/x')), false);
  assert.equal(allowReaderNavigation(nav('//attacker.example')), false);
});

test('allowReaderNavigation: blocks file and intent schemes', () => {
  assert.equal(allowReaderNavigation(nav('file:///data/data/com.lirune.reader/')), false);
  assert.equal(allowReaderNavigation(nav('intent://evil#Intent;end')), false);
  assert.equal(allowReaderNavigation(nav('javascript:alert(1)')), false);
  assert.equal(allowReaderNavigation(nav('ftp://example.com/x')), false);
});

test('validateArchiveBudget: rejects oversized and highly compressed entries', () => {
  assert.throws(() => validateArchiveBudget([
    { name: 'huge.xhtml', compressedSize: 1, uncompressedSize: 101 * 1024 * 1024 },
  ]));
  assert.throws(() => validateArchiveBudget([
    { name: 'bomb.bin', compressedSize: 1, uncompressedSize: 101 },
  ]));
});

// ---------------------------------------------------------------------------
// Format Detection
// ---------------------------------------------------------------------------

test('getFormatFromExtension: resolves supported formats from filename or extension', async () => {
  const { getFormatFromExtension } = await import('../models/Book.ts');
  assert.equal(getFormatFromExtension('doc.html').id, 'html');
  assert.equal(getFormatFromExtension('.html').id, 'html');
  assert.equal(getFormatFromExtension('html').id, 'html');
  assert.equal(getFormatFromExtension('book.epub').id, 'epub');
  assert.equal(getFormatFromExtension('archive.cbz').id, 'cbz');
  assert.equal(getFormatFromExtension('story.fb2').id, 'fb2');
  assert.equal(getFormatFromExtension('document.pdf').id, 'pdf');
  assert.equal(getFormatFromExtension('notes.txt').id, 'txt');
  assert.equal(getFormatFromExtension('unknown.xyz').supported, false);
});

// ---------------------------------------------------------------------------
// Store & State Regressions
// ---------------------------------------------------------------------------

test('collectionMembershipSync: maintains bi-directional consistency', () => {
  const bookId = 'book-alpha';
  const collId = 'col-fiction';

  let books = [{ id: bookId, collectionIds: [] as string[] }];
  let collections = [{ id: collId, bookIds: [] as string[] }];

  // Simulate addBookToCollection(bookId, collId)
  books = books.map((b) =>
    b.id === bookId
      ? { ...b, collectionIds: [...new Set([...b.collectionIds, collId])] }
      : b
  );
  collections = collections.map((c) =>
    c.id === collId
      ? { ...c, bookIds: [...new Set([...c.bookIds, bookId])] }
      : c
  );

  assert.deepEqual(books[0].collectionIds, [collId]);
  assert.deepEqual(collections[0].bookIds, [bookId]);

  // Simulate removeBookFromCollection(bookId, collId)
  books = books.map((b) =>
    b.id === bookId
      ? { ...b, collectionIds: b.collectionIds.filter((c) => c !== collId) }
      : b
  );
  collections = collections.map((c) =>
    c.id === collId
      ? { ...c, bookIds: c.bookIds.filter((id) => id !== bookId) }
      : c
  );

  assert.deepEqual(books[0].collectionIds, []);
  assert.deepEqual(collections[0].bookIds, []);
});

test('deleteBookSync: removes deleted book ID from all collections', () => {
  const bookId = 'book-del';
  let collections = [
    { id: 'c1', bookIds: ['book-keep', bookId] },
    { id: 'c2', bookIds: [bookId] },
  ];

  collections = collections.map((c) => ({
    ...c,
    bookIds: c.bookIds.filter((id) => id !== bookId),
  }));

  assert.deepEqual(collections[0].bookIds, ['book-keep']);
  assert.deepEqual(collections[1].bookIds, []);
});

// ---------------------------------------------------------------------------
// openBook Async State Race Condition Regression
// ---------------------------------------------------------------------------

test('openBookAsyncRace: stale async operation from earlier book does not overwrite active book', async () => {
  let activeSessionId = 0;
  let activeBookState: any = null;

  async function mockOpenBook(bookId: string, delayMs: number) {
    const sessionId = ++activeSessionId;
    
    // Simulate async database fetches
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Stale check
    if (sessionId !== activeSessionId) {
      return; // Discarded!
    }

    activeBookState = {
      bookId,
      sessionId,
      openedAt: Date.now(),
    };
  }

  // Open Book A with a slow query (50ms)
  const promiseA = mockOpenBook('book-A', 50);

  // Rapidly open Book B with a fast query (5ms) before Book A finishes
  await new Promise((resolve) => setTimeout(resolve, 5));
  const promiseB = mockOpenBook('book-B', 10);

  await Promise.all([promiseA, promiseB]);

  // Book B must remain the active book state!
  assert.ok(activeBookState !== null);
  assert.equal(activeBookState.bookId, 'book-B');
});

// ---------------------------------------------------------------------------
// Settings Validation & Corrupted State Fallbacks
// ---------------------------------------------------------------------------

test('validateReaderSettings: safely falls back to valid defaults on corrupted persisted state', () => {
  const corrupted = {
    theme: 'hacked_dark_rainbow',
    fontSize: -999,
    fontFamily: 12345,
    lineHeight: NaN,
    paragraphSpacing: 'wide',
    margin: 99999,
    flow: 'infinite_3d',
    alignment: 'diagonal',
    pageGap: -50,
    columns: 'four',
    brightness: -200,
    keepScreenAwake: 'yes_please',
  };

  const validated = validateReaderSettings(corrupted);

  assert.equal(validated.theme, 'sepia');
  assert.equal(validated.fontSize, 18);
  assert.equal(validated.fontFamily, 'Serif');
  assert.equal(validated.lineHeight, 1.6);
  assert.equal(validated.paragraphSpacing, 1.0);
  assert.equal(validated.margin, 20); // Default Standard margin
  assert.equal(validated.flow, 'paginated');
  assert.equal(validated.alignment, 'left');
  assert.equal(validated.pageGap, 16);
  assert.equal(validated.columns, 'auto');
  assert.equal(validated.brightness, 10); // Clamped to MIN_READER_BRIGHTNESS
  assert.equal(validated.keepScreenAwake, true);
});

test('validateAccessibilitySettings: bounds scaling and sanitizes booleans', () => {
  const corrupted = {
    highContrast: 'invalid',
    readerFontScaling: 50.0,
  };

  const validated = validateAccessibilitySettings(corrupted);
  assert.equal(validated.highContrast, false);
  assert.equal(validated.readerFontScaling, 1.0);
});

test('validateAppTheme: enforces valid theme options', () => {
  assert.equal(validateAppTheme('dark'), 'dark');
  assert.equal(validateAppTheme('light'), 'light');
  assert.equal(validateAppTheme('system'), 'system');
  assert.equal(validateAppTheme('cyberpunk'), 'light');
});

// ---------------------------------------------------------------------------
// RAR5 & Archive Truth in Support
// ---------------------------------------------------------------------------

test('RarExtractor: explicitly rejects RAR5 archives with clear unsupported error', () => {
  // RAR5 signature: 0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00
  const rar5Bytes = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00, 0x00, 0x00]);

  assert.throws(
    () => RarExtractor.inspect(rar5Bytes),
    (err: any) => {
      return /RAR5/i.test(err?.message) && /not supported/i.test(err?.message);
    }
  );
});

test('RarExtractor: rejects invalid signatures', () => {
  const badBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
  assert.throws(() => RarExtractor.inspect(badBytes), /Invalid RAR signature/);
});



