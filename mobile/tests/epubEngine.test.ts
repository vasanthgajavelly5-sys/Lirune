/**
 * Lirune Reader Mobile — EPUB engine unit tests
 *
 * Covers the pieces the reader depends on that are not covered by the CSS or
 * regression suites: archive lookup and caching, markup scanning, body
 * extraction, SVG handling, title extraction, reader layout and position
 * restoration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import { EpubArchive, mimeTypeForPath } from '../services/epub/archive.ts';
import { normalizeEntryPath, archiveDirname, resolveZipPath } from '../services/epub/zipPaths.ts';
import {
  convertBareImageElements,
  extractBodyContent,
  extractChapterTitle,
  inlineMarkupResources,
  normalizeSvgCovers,
  parseAttributes,
  scanTokens,
  toPlainText,
} from '../services/epub/markup.ts';
import { computeReaderLayout } from '../services/reader/readerLayout.ts';
import { computeReaderGeometry, decideNavigation, sameGeometry } from '../services/epub/readerGeometry.ts';
import { buildContinuousShell, buildReaderDocument, paginatedColumnGeometry } from '../services/epub/readerDocument.ts';
import {
  isReadingPosition,
  readingPositionScript,
  restorePositionScript,
} from '../services/reader/readingPosition.ts';

async function archiveOf(entries: Record<string, string | Uint8Array>): Promise<EpubArchive> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return EpubArchive.open(await zip.generateAsync({ type: 'arraybuffer' }));
}

/* -------------------------------------------------------------------------- */
/* path normalisation                                                          */
/* -------------------------------------------------------------------------- */

test('normalizeEntryPath canonicalises separators and dot segments', () => {
  assert.equal(normalizeEntryPath('OEBPS/Text/ch1.xhtml'), 'OEBPS/Text/ch1.xhtml');
  assert.equal(normalizeEntryPath('./OEBPS/Text/ch1.xhtml'), 'OEBPS/Text/ch1.xhtml');
  assert.equal(normalizeEntryPath('OEBPS\\Text\\ch1.xhtml'), 'OEBPS/Text/ch1.xhtml');
  assert.equal(normalizeEntryPath('/OEBPS/./Text/ch1.xhtml'), 'OEBPS/Text/ch1.xhtml');
  assert.equal(normalizeEntryPath('OEBPS/Text/../Text/ch1.xhtml'), 'OEBPS/Text/ch1.xhtml');
  assert.equal(normalizeEntryPath('OEBPS/Chapter%201.xhtml'), 'OEBPS/Chapter 1.xhtml');
});

test('archiveDirname returns the containing directory with a trailing slash', () => {
  assert.equal(archiveDirname('OEBPS/Text/ch1.xhtml'), 'OEBPS/Text/');
  assert.equal(archiveDirname('ch1.xhtml'), '');
});

test('resolveZipPath still resolves against a base directory', () => {
  assert.equal(resolveZipPath('OEBPS/Text/', '../Images/a.png'), 'OEBPS/Images/a.png');
});

/* -------------------------------------------------------------------------- */
/* archive lookup + caching                                                    */
/* -------------------------------------------------------------------------- */

test('EpubArchive resolves paths with a normalized index and survives case drift', async () => {
  const archive = await archiveOf({ 'OEBPS/Text/Chapter One.xhtml': '<p>x</p>', './OEBPS/img/a.png': 'x' });

  assert.ok(archive.file('OEBPS/Text/Chapter One.xhtml'));
  assert.ok(archive.file('OEBPS/./Text/Chapter One.xhtml'));
  assert.ok(archive.file('\\OEBPS\\img\\a.png'));
  // Publisher manifests routinely disagree with their own file names.
  assert.ok(archive.file('oebps/text/chapter one.xhtml'));
  assert.equal(archive.file('OEBPS/Text/Missing.xhtml'), null);
});

test('EpubArchive never lets two case-differing paths collapse onto one entry', async () => {
  const archive = await archiveOf({ 'OEBPS/img/A.png': 'upper', 'OEBPS/img/a.png': 'lower' });

  const upper = await archive.dataUri('OEBPS/img/A.png');
  const lower = await archive.dataUri('OEBPS/img/a.png');

  assert.notEqual(upper, lower);
  assert.equal(upper, await archive.dataUri('OEBPS/img/A.png'));
});

test('EpubArchive encodes each resource once and reuses the data URI', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const archive = await archiveOf({ 'OEBPS/img/a.png': bytes });

  const first = await archive.dataUri('OEBPS/img/a.png');
  const second = await archive.dataUri('OEBPS/img/a.png');

  assert.equal(first, second);
  assert.ok(first!.startsWith('data:image/png;base64,'));
  assert.equal(archive.stats().cachedUris, 1);
});

test('EpubArchive recovers a book whose relative image paths are broken', async () => {
  // A chapter in OEBPS/text/ referencing images/ch1.jpg when the file actually
  // lives in OEBPS/images/ — common in the wild, and what the old linear scan
  // with a file-name match used to rescue.
  const archive = await archiveOf({
    'OEBPS/text/ch1.xhtml': '<html><body><img src="images/ch1.jpg"/></body></html>',
    'OEBPS/images/ch1.jpg': new Uint8Array([9, 9, 9]),
  });

  const uri = await archive.dataUri('OEBPS/text/images/ch1.jpg');
  assert.ok(uri?.startsWith('data:image/jpeg;base64,'), 'the misplaced image must still resolve');
});

test('EpubArchive refuses an ambiguous file-name fallback', async () => {
  const archive = await archiveOf({
    'OEBPS/a/pic.png': new Uint8Array([1]),
    'OEBPS/b/pic.png': new Uint8Array([2]),
  });

  // Two files share the name, so substituting either would be a guess.
  assert.equal(archive.file('OEBPS/text/images/pic.png'), null);
  // The unambiguous exact and case-insensitive paths still resolve.
  assert.ok(archive.file('OEBPS/a/pic.png'));
  assert.ok(archive.file('OEBPS/b/PIC.PNG'));
});

test('EpubArchive evicts least-recently-used entries instead of growing forever', async () => {
  const zip = new JSZip();
  for (let i = 0; i < 40; i++) zip.file(`OEBPS/img/${i}.png`, new Uint8Array(64 * 1024));
  const archive = await EpubArchive.open(await zip.generateAsync({ type: 'arraybuffer' }), {
    maxCacheBytes: 512 * 1024,
  });

  for (let i = 0; i < 40; i++) await archive.dataUri(`OEBPS/img/${i}.png`);

  const stats = archive.stats();
  assert.ok(stats.cachedUris < 40, `expected eviction, cached ${stats.cachedUris}`);
  assert.ok(stats.cacheBytes <= 512 * 1024, 'cache must stay inside its budget');
});

test('disposing an archive drops every cache and refuses further reads', async () => {
  const archive = await archiveOf({ 'OEBPS/a.xhtml': '<p>x</p>' });
  await archive.dataUri('OEBPS/a.xhtml');
  await archive.readText('OEBPS/a.xhtml');

  archive.dispose();

  assert.deepEqual(archive.stats(), { entries: 0, cachedUris: 0, cacheBytes: 0, cachedTexts: 0 });
  assert.equal(archive.file('OEBPS/a.xhtml'), null);
  assert.throws(() => archive.rawZip());
});

test('mimeTypeForPath covers images and every embedded font format', () => {
  assert.equal(mimeTypeForPath('a.PNG'), 'image/png');
  assert.equal(mimeTypeForPath('a.svg'), 'image/svg+xml');
  assert.equal(mimeTypeForPath('a.woff'), 'font/woff');
  assert.equal(mimeTypeForPath('a.woff2'), 'font/woff2');
  assert.equal(mimeTypeForPath('a.ttf'), 'font/ttf');
  assert.equal(mimeTypeForPath('a.otf'), 'font/otf');
});

/* -------------------------------------------------------------------------- */
/* markup scanning                                                             */
/* -------------------------------------------------------------------------- */

test('parseAttributes tracks the exact source span of each value', () => {
  const attrs = ' src="../Images/a b.png"  width="100" hidden';
  const parsed = parseAttributes(attrs);

  assert.deepEqual(
    parsed.map((a) => [a.name, a.value]),
    [
      ['src', '../Images/a b.png'],
      ['width', '100'],
      ['hidden', null],
    ]
  );
  assert.equal(attrs.slice(parsed[0].valueStart, parsed[0].valueEnd), '../Images/a b.png');
});

test('scanTokens skips comments, CDATA and raw-text element content', () => {
  const tokens = scanTokens(
    '<p>a<!-- <b>hidden</b> --></p><style>p{content:"</p>"}</style><![CDATA[<i>x</i>]]><b>real</b>'
  );

  const names = tokens.filter((t) => !t.closing).map((t) => t.lower);
  assert.deepEqual(names, ['p', 'style', 'b']);
});

test('extractBodyContent ignores a </body> hidden in a comment or script string', () => {
  const document =
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head>' +
    '<body epub:type="bodymatter"><!-- </body> --><p>One</p><script>var s="</body>";</script><p>Two</p></body></html>';

  const result = extractBodyContent(document);

  assert.equal(result.found, true);
  assert.match(result.bodyAttrs, /epub:type="bodymatter"/);
  assert.match(result.content, /<p>One<\/p>/);
  // The `</body>` inside the comment and inside the script string must not have
  // ended the body early: the paragraph after the script is still included.
  assert.match(result.content, /<p>Two<\/p>/);
});

test('extractBodyContent tolerates unusual whitespace and a missing body', () => {
  const spaced = '<html>\n  <head>\n  </head>\n\n<body\n  class="x"\n>\n<p>A</p>\n</body >\n</html>';
  const withBody = extractBodyContent(spaced);
  assert.equal(withBody.found, true);
  assert.match(withBody.content, /<p>A<\/p>/);
  assert.doesNotMatch(withBody.content, /<\/body/i);

  const headless = extractBodyContent('<p>No wrapper at all</p>');
  assert.equal(headless.found, false);
  assert.match(headless.content, /No wrapper/);
});

test('inline style url() references resolve against the chapter directory', async () => {
  const archive = await archiveOf({
    'OEBPS/Images/paper.png': new Uint8Array([7, 7, 7]),
    'OEBPS/Text/ch1.xhtml': '',
  });
  const html =
    '<div style="background-image:url(../Images/paper.png)"></div>' +
    '<div style=\'background: url("../Images/paper.png") no-repeat\'></div>' +
    '<div style="list-style-image:url(&quot;../Images/paper.png&quot;)"></div>' +
    '<div style="background-image:url(../Images/paper.png);color:red"></div>';

  const result = await inlineMarkupResources(html, 'OEBPS/Text/', archive);

  // Each reference is embedded once and quoted for its own attribute delimiter.
  assert.equal((result.match(/url\((?:&quot;|")data:image\/png;base64,/g) ?? []).length, 4);
  assert.doesNotMatch(result, /paper\.png/);
  assert.match(result, /color:red/);
  assert.match(result, /no-repeat/);
});

test('an inline style url() that resolves to nothing is dropped, not left broken', async () => {
  const archive = await archiveOf({ 'OEBPS/a.xhtml': '' });
  const result = await inlineMarkupResources(
    '<p style="background:url(missing.png)"></p>',
    'OEBPS/',
    archive
  );
  assert.doesNotMatch(result, /missing\.png/);
});

test('inline style url() never rewrites remote, blob or fragment references', async () => {
  const archive = await archiveOf({ 'OEBPS/a.xhtml': '' });
  const html =
    '<p style="background:url(https://cdn.example/a.png)"></p>' +
    '<p style="background:url(//cdn.example/a.png)"></p>' +
    '<p style="background:url(blob:null/1234)"></p>' +
    '<p style="fill:url(#gradient)"></p>' +
    '<p style="background:url(&quot;data:image/png;base64,AAAA&quot;)"></p>';

  const result = await inlineMarkupResources(html, 'OEBPS/', archive);

  assert.doesNotMatch(result, /cdn\.example/);
  assert.doesNotMatch(result, /blob:/);
  assert.match(result, /fill:url\(&quot;#gradient&quot;\)/);
  assert.match(result, /data:image\/png;base64,AAAA/);
});

test('SVG covers become an <img> while inline SVG diagrams survive untouched', async () => {
  const cover = '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><image xlink:href="cover.png" width="100" height="100"/></svg></div>';
  const diagram =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><path d="M0 0L1 1"/><circle r="2"/></g></svg>';

  const result = normalizeSvgCovers(cover + diagram);

  assert.match(result, /<div class="epub-cover-container"><img src="cover\.png"/);
  assert.doesNotMatch(result, /<image/);
  assert.match(result, /<path d="M0 0L1 1"\/>/);
  assert.match(result, /<circle r="2"\/>/);
});

test('a large or hostile SVG is skipped rather than scanned', () => {
  const filler = '<rect x="1" y="1" width="2" height="2"/>'.repeat(6000);
  const huge = `<svg xmlns="http://www.w3.org/2000/svg">${filler}</svg>`;

  const started = Date.now();
  const result = normalizeSvgCovers(huge);
  assert.ok(Date.now() - started < 2000, 'the transform must stay bounded');
  assert.equal(result, huge);
});

test('malformed SVG cannot hang the transform', () => {
  const hostile = '<svg><image xlink:href="a.png">' + '<g>'.repeat(4000) + '</svg>';

  const started = Date.now();
  const result = normalizeSvgCovers(hostile);
  assert.ok(Date.now() - started < 2000, 'malformed SVG must not stall the JS thread');
  assert.equal(typeof result, 'string');
});

test('bare <image> elements become <img>, elements inside SVG do not', () => {
  const result = convertBareImageElements(
    '<image src="a.png" alt="x"/><svg><image xlink:href="b.png"/></svg>'
  );

  assert.match(result, /<img src="a\.png" alt="x"/);
  assert.match(result, /<svg><image xlink:href="b\.png"\/><\/svg>/);
});

test('chapter title prefers a body heading over a repeated document title', () => {
  const publisherLogo = '<html><head><title>The Book</title></head><body>' +
    '<h1 class="logo"><img src="logo.png" alt="Publisher"/></h1>' +
    '<h2>The Drowned World</h2><p>Body text</p></body></html>';
  assert.equal(extractChapterTitle(publisherLogo).title, 'The Drowned World');

  const headingFirst = '<html><head><title>The Book</title></head><body><h1>Chapter Three</h1></body></html>';
  assert.equal(extractChapterTitle(headingFirst).title, 'Chapter Three');

  const documentTitleOnly = '<html><head><title>Chapter Nine</title></head><body><p>x</p></body></html>';
  assert.equal(extractChapterTitle(documentTitleOnly).title, 'Chapter Nine');

  const h1BeatsH2 = '<body><h2>Section</h2><h1>Chapter</h1></body>';
  assert.equal(extractChapterTitle(h1BeatsH2).title, 'Chapter');

  const nestedHeading = '<body><section><h3>Deep heading</h3></section></body>';
  assert.equal(extractChapterTitle(nestedHeading).title, 'Deep heading');

  const navHeading = '<body><nav><h1>Contents</h1></nav><h1>Real Chapter</h1></body>';
  assert.equal(extractChapterTitle(navHeading).title, 'Real Chapter');

  assert.equal(extractChapterTitle('<body><p>no title</p></body>').source, 'none');
});

test('toPlainText produces speakable text without markup', () => {
  assert.equal(toPlainText('<p>Hello&nbsp;<em>world</em>&amp;all</p>'), 'Hello world &all');
});

/* -------------------------------------------------------------------------- */
/* reader layout                                                               */
/* -------------------------------------------------------------------------- */

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

function layoutFor(width: number, height: number, fontSize = 18, margin = 12) {
  return computeReaderLayout({
    containerWidth: width,
    containerHeight: height,
    insets: NO_INSETS,
    fontSize,
    userMargin: margin,
    pageGap: 16,
    fontScale: 1,
  });
}

test('reader layout derives everything from the measured container', () => {
  const phone = layoutFor(360, 640);
  const landscape = layoutFor(640, 360);
  const tablet = layoutFor(800, 1280);
  const foldable = layoutFor(1024, 600);

  assert.equal(phone.viewportWidth, 360);
  assert.equal(phone.columnCount, 1);
  assert.equal(landscape.viewportWidth, 640);
  assert.equal(landscape.isLandscape, true);
  assert.equal(tablet.columnCount, 2);
  assert.equal(foldable.isLandscape, true);
  assert.notEqual(phone.contentWidth, landscape.contentWidth);
});

test('reader layout never lets the column leave the container', () => {
  for (const width of [280, 320, 360, 412, 600, 800, 1024, 1600]) {
    for (const fontSize of [10, 16, 24, 48, 96]) {
      const layout = layoutFor(width, 800, fontSize, 40);
      assert.ok(layout.contentWidth <= width, `column ${layout.contentWidth} > ${width}`);
      assert.ok(layout.sideOffset >= 0, `negative side offset at ${width}`);
      assert.ok(
        layout.sideOffset * 2 + layout.contentWidth <= width + 1,
        `column overflows horizontally at width ${width} / size ${fontSize}`
      );
      assert.ok(layout.padTop > 0 && layout.padBottom > 0);
    }
  }
});

test('reader layout accounts for real safe-area insets', () => {
  const layout = computeReaderLayout({
    containerWidth: 400,
    containerHeight: 800,
    insets: { top: 44, bottom: 34, left: 0, right: 0 },
    fontSize: 18,
    userMargin: 10,
    pageGap: 16,
    fontScale: 2,
  });

  assert.ok(layout.padTop >= 44, 'top inset must be respected');
  assert.ok(layout.bottomSafe >= 34, 'bottom inset must be respected');
});

/* -------------------------------------------------------------------------- */
/* reader document                                                             */
/* -------------------------------------------------------------------------- */

const PALETTE = { bg: '#FFFFFF', text: '#111111', muted: '#777777', link: '#2255AA' };

function documentFor(mode: 'paginated' | 'continuous', overrides: Record<string, unknown> = {}) {
  return buildReaderDocument({
    mode,
    bookCss: '.x{color:#123456}',
    body: '<p>Body</p>',
    palette: PALETTE,
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    alignment: 'left',
    paragraphSpacing: 1,
    layout: layoutFor(360, 640),
    twoColumn: false,
    startAtEnd: false,
    initialScrollY: 0,
    ...overrides,
  });
}

test('book CSS is emitted before the reader stylesheet so the reader wins ties', () => {
  const html = documentFor('paginated');
  const bookAt = html.indexOf('<style id="book-css">');
  const readerAt = html.indexOf('<style id="reader-css">');

  assert.ok(bookAt > 0 && readerAt > bookAt, 'book CSS must come first');
});

test('the reader document reflects measured geometry, not hardcoded sizes', () => {
  const wide = buildReaderDocument({
    mode: 'paginated',
    bookCss: '',
    body: '<p>x</p>',
    palette: PALETTE,
    fontFamily: 'serif',
    fontSize: 20,
    lineHeight: 1.5,
    alignment: 'left',
    paragraphSpacing: 1,
    layout: layoutFor(1024, 768, 20, 24),
    twoColumn: true,
    startAtEnd: false,
    initialScrollY: 0,
  });

  assert.match(wide, /column-width: \d+px/);
  assert.match(wide, /padding: \d+px \d+px/);
  // The measured 1024px column must not be silently replaced by a phone width.
  assert.doesNotMatch(wide, /width: 360px|translateX\(-360/);
  assert.match(wide, /isTwoCol = true/);
});

test('the reader document keeps every pagination and interaction control', () => {
  const html = documentFor('paginated');

  for (const token of [
    'toggleControls',
    'pageBoundary',
    'goToPage',
    'applyZoom',
    'touchstart',
    'touchmove',
    'touchend',
    '__lirunePager',
  ]) {
    assert.match(html, new RegExp(token.replace(/[$]/g, '\\$')), `missing ${token}`);
  }

  const continuous = documentFor('continuous');
  for (const token of ['scrollProgress', 'prevChapter', 'nextChapter', '__epubHydrating', 'chapterIndex']) {
    assert.match(continuous, new RegExp(token), `missing ${token}`);
  }
});

test('footnote and endnote semantics get reader styling without extra markup', () => {
  const html = documentFor('paginated');
  assert.match(html, /aside\[epub\\:type~="footnote"\]/);
  assert.match(html, /doc-endnote/);
  assert.match(html, /doc-noteref/);
});

test('MathML reaches the WebView with its presentation attributes and cannot widen the column', () => {
  const html = documentFor('paginated');
  // Preserved content (asserted on the sanitiser suite) plus layout containment.
  assert.match(html, /math, mrow, mfrac, msqrt/);
  assert.match(html, /max-width: 100%/);
  // The annotation (an alternative, non-visual representation) stays hidden.
  assert.match(html, /annotation \{\s*display: none;/);
});

test('buildContinuousShell renders one section per chapter with only the active one loaded', () => {
  const shell = buildContinuousShell(3, ['One', 'Two', 'Three'], 1, '<p>Second</p>');

  assert.equal((shell.match(/data-chapter-index="/g) ?? []).length, 3);
  assert.equal((shell.match(/data-loaded="true"/g) ?? []).length, 1);
  assert.match(shell, /id="chapter-body-1"><p>Second<\/p>/);
  assert.match(shell, /id="chapter-body-0"><div class="chapter-placeholder">/);
});

test('continuous chapter titles are escaped', () => {
  const shell = buildContinuousShell(1, ['<script>alert(1)</script>'], 0, '<p>x</p>');
  assert.doesNotMatch(shell, /<script>/);
});

/* -------------------------------------------------------------------------- */
/* responsive layout                                                          */
/* -------------------------------------------------------------------------- */

const VIEWPORTS: [string, number, number, boolean][] = [
  ['small phone portrait', 320, 568, false],
  ['phone portrait', 360, 800, false],
  ['phone landscape', 800, 360, false],
  ['foldable open', 673, 841, false],
  ['tablet portrait', 800, 1280, true],
  ['tablet landscape', 1280, 800, true],
];

function paddingOf(css: string, selector: string): { top: number; right: number; bottom: number; left: number } {
  const rule = new RegExp(`${selector.replace(/[.#]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(rule, `${selector} rule is missing`);
  // Units are optional so a bare `0` is accepted.
  const padding = /padding:\s*([\d.]+)(?:px)?\s+([\d.]+)(?:px)?\s+([\d.]+)(?:px)?\s+([\d.]+)(?:px)?/.exec(rule[1]);
  assert.ok(padding, `${selector} has no four-sided padding`);
  return { top: Number(padding[1]), right: Number(padding[2]), bottom: Number(padding[3]), left: Number(padding[4]) };
}

for (const [label, width, height, twoColumn] of VIEWPORTS) {
  test(`responsive layout: ${label} (${width}x${height}) has no clipping`, () => {
    const layout = computeReaderLayout({
      containerWidth: width,
      containerHeight: height,
      insets: { top: 24, bottom: 16, left: 0, right: 0 },
      fontSize: 18,
      userMargin: 12,
      pageGap: 16,
      fontScale: 1,
    });
    const html = buildReaderDocument({
      mode: 'paginated',
      bookCss: '',
      body: '<div class="epub-chapter-content"><p>Readable text.</p></div>',
      palette: PALETTE,
      fontFamily: 'serif',
      fontSize: 18,
      lineHeight: 1.6,
      alignment: 'left',
      paragraphSpacing: 1,
      layout,
      twoColumn,
      startAtEnd: false,
      initialScrollY: 0,
    });

    // The measured column drives the pagination, not a hardcoded device width.
    const { columnStep, sideInset } = paginatedColumnGeometry(layout, twoColumn);
    assert.match(html, new RegExp(`column-width: ${columnStep}px`));
    // One page is exactly one viewport wide (or two half-width columns), and the
    // reading margin is carved out of that same width.
    assert.equal(columnStep, twoColumn ? Math.floor(layout.viewportWidth / 2) : layout.viewportWidth);
    assert.ok(sideInset * 2 < columnStep, 'the text measure must leave room for both margins');

    // The multicol container itself must carry NO horizontal padding: in CSS
    // multicol that padding only insets the whole flow, which lets the next
    // column show through at the right edge of the current page.
    const pad = paddingOf(html, '#book-content');
    assert.equal(pad.left, 0, 'the column container must not pad horizontally');
    assert.equal(pad.right, 0, 'the column container must not pad horizontally');
    assert.ok(pad.bottom >= layout.progressBarHeight + layout.bottomSafe, 'progress overlay collision');
    assert.match(
      html,
      new RegExp(`#book-content > \\* \\{[\\s\\S]*?padding-left: ${sideInset}px;[\\s\\S]*?padding-right: ${sideInset}px;`),
      'the reading margin must be applied inside each column fragment'
    );

    const continuous = buildReaderDocument({
      mode: 'continuous',
      bookCss: '',
      body: buildContinuousShell(2, ['A', 'B'], 0, '<p>Text</p>'),
      palette: PALETTE,
      fontFamily: 'serif',
      fontSize: 18,
      lineHeight: 1.6,
      alignment: 'left',
      paragraphSpacing: 1,
      layout,
      twoColumn: false,
      startAtEnd: false,
      initialScrollY: 0,
    });
    const scrollPad = paddingOf(continuous, '#continuous-container');
    assert.equal(scrollPad.top, pad.top);
    assert.equal(scrollPad.bottom, pad.bottom);
    // Continuous mode centres the same reading measure with the same insets, so
    // it must fit exactly as the paginated column does.
    assert.ok(scrollPad.left + layout.contentWidth + scrollPad.right <= layout.viewportWidth);
    assert.ok(scrollPad.left >= layout.sideOffset - 1 && scrollPad.right >= layout.sideOffset - 1);
  });
}

test('responsive layout: a notch inset shifts the column instead of clipping it', () => {
  const withoutInset = layoutFor(360, 800);
  const withInset = computeReaderLayout({
    containerWidth: 360,
    containerHeight: 800,
    insets: { top: 44, bottom: 34, left: 0, right: 0 },
    fontSize: 18,
    userMargin: 12,
    pageGap: 16,
    fontScale: 1,
  });

  assert.ok(withInset.padTop > withoutInset.padTop, 'top inset must push content down');
  assert.ok(withInset.bottomSafe >= 34, 'gesture bar must stay clear');
  assert.ok(withInset.contentWidth <= withoutInset.contentWidth, 'insets must not widen the column');
});

test('responsive layout: publisher CSS cannot make the column overflow', () => {
  const html = buildReaderDocument({
    mode: 'paginated',
    // A publisher trying to force a fixed 900px layout.
    bookCss: '.wide{width:900px}.fixed{position:fixed;top:0}',
    body: '<div class="epub-chapter-content"><p class="wide">Wide</p></div>',
    palette: PALETTE,
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    alignment: 'left',
    paragraphSpacing: 1,
    layout: layoutFor(360, 800),
    twoColumn: false,
    startAtEnd: false,
    initialScrollY: 0,
  });

  assert.match(html, /img, svg, image, canvas, video \{\s*max-width: 100% !important/);
  assert.match(html, /p, div, li, blockquote[\s\S]*?max-width: 100%/);
  assert.match(html, /overflow-x: hidden/);
  assert.doesNotMatch(html, /width: 900px/, 'publisher fixed widths must not reach the reader');
});

/* -------------------------------------------------------------------------- */
/* reader geometry identity (reading-position preservation)                   */
/* -------------------------------------------------------------------------- */

const BASE_SETTINGS = {
  flow: 'paginated' as 'paginated' | 'scrolled',
  theme: 'day',
  fontFamily: 'system',
  fontSize: 18,
  lineHeight: 1.6,
  margin: 12,
  pageGap: 16,
  alignment: 'left',
  paragraphSpacing: 1,
};

function geometryFor(
  overrides: Partial<typeof BASE_SETTINGS> = {},
  width = 360,
  height = 640
) {
  const settings = { ...BASE_SETTINGS, ...overrides };
  return computeReaderGeometry(settings, layoutFor(width, height, settings.fontSize, settings.margin), width);
}

test('every reflowing change produces a new document identity', () => {
  const base = geometryFor();

  // These are exactly the changes that would otherwise lose the reading position.
  for (const [label, changed] of [
    ['font size', geometryFor({ fontSize: 22 })],
    ['line height', geometryFor({ lineHeight: 1.9 })],
    ['margin', geometryFor({ margin: 32 })],
    ['font family', geometryFor({ fontFamily: 'serif' })],
    ['alignment', geometryFor({ alignment: 'justify' })],
    ['theme', geometryFor({ theme: 'night' })],
    ['paragraph spacing', geometryFor({ paragraphSpacing: 1.6 })],
    ['page gap', geometryFor({ pageGap: 40 })],
    ['flow mode', geometryFor({ flow: 'scrolled' })],
    ['rotation', geometryFor({}, 640, 360)],
    ['tablet width', geometryFor({}, 1024, 768)],
  ] as [string, ReturnType<typeof geometryFor>][]) {
    assert.notEqual(changed.key, base.key, `${label} must re-render the document`);
  }
});

test('an identical configuration keeps the same document identity', () => {
  const first = geometryFor();
  const second = geometryFor();
  assert.equal(first.key, second.key);
  assert.equal(sameGeometry(first, second), true);
  assert.equal(sameGeometry(first, geometryFor({ fontSize: 20 })), false);
  assert.equal(sameGeometry(null, second), false);
});

test('the column count follows the measured width, not a device guess', () => {
  assert.equal(geometryFor({}, 360, 640).twoColumn, false);
  assert.equal(geometryFor({}, 599, 900).twoColumn, false);
  assert.equal(geometryFor({}, 600, 900).twoColumn, true);
  assert.equal(geometryFor({}, 1024, 768).twoColumn, true);
  // Continuous mode is always single-column, whatever the width.
  assert.equal(geometryFor({ flow: 'scrolled' }, 1024, 768).twoColumn, false);
});

test('continuous mode is selected by the flow setting', () => {
  assert.equal(geometryFor().mode, 'paginated');
  assert.equal(geometryFor({ flow: 'scrolled' }).mode, 'continuous');
});

/* -------------------------------------------------------------------------- */
/* CFI navigation guard (infinite-render regression)                          */
/* -------------------------------------------------------------------------- */

test("the reader ignores its own progress echo, which used to loop forever", () => {
  // Turning a page at the end of chapter 1 moves the reader to chapter 2 and
  // publishes `spine:1`; the host echoes that back. Acting on the echo pulls the
  // reader back to chapter 1, which publishes `spine:2`, and the loop never ends.
  const echo = decideNavigation({
    targetCfi: 'spine:1',
    lastPublishedCfi: 'spine:1',
    lastAppliedCfi: null,
    spineIndex: 1,
    chapterCount: 15,
    currentChapterIndex: 2,
  });
  assert.equal(echo, 'ignore-progress-echo');

  const continuousEcho = decideNavigation({
    targetCfi: 'spine:2:scroll:412',
    lastPublishedCfi: 'spine:2:scroll:412',
    lastAppliedCfi: null,
    spineIndex: 2,
    chapterCount: 15,
    currentChapterIndex: 3,
  });
  assert.equal(continuousEcho, 'ignore-progress-echo');
});

test('one navigation request is acted on exactly once', () => {
  const request = decideNavigation({
    targetCfi: 'spine:6',
    lastPublishedCfi: 'spine:2',
    lastAppliedCfi: null,
    spineIndex: 6,
    chapterCount: 15,
    currentChapterIndex: 2,
  });
  assert.equal(request, 'navigate');

  const repeat = decideNavigation({
    targetCfi: 'spine:6',
    lastPublishedCfi: 'spine:6',
    lastAppliedCfi: 'spine:6',
    spineIndex: 6,
    chapterCount: 15,
    currentChapterIndex: 6,
  });
  // The reader now reports chapter 6 itself, so this is a progress echo first and
  // an already-honoured request second. Either way it must not move the reader.
  assert.ok(repeat === 'ignore-progress-echo' || repeat === 'ignore-already-applied');

  const staleRepeat = decideNavigation({
    targetCfi: 'spine:6',
    lastPublishedCfi: 'spine:7',
    lastAppliedCfi: 'spine:6',
    spineIndex: 6,
    chapterCount: 15,
    currentChapterIndex: 6,
  });
  assert.equal(staleRepeat, 'ignore-already-applied');
});

test('navigation targets are validated before they move the reader', () => {
  const base = { lastPublishedCfi: null, lastAppliedCfi: null, chapterCount: 15, currentChapterIndex: 2 };

  assert.equal(decideNavigation({ ...base, targetCfi: '', spineIndex: null }), 'ignore-unparseable');
  assert.equal(decideNavigation({ ...base, targetCfi: 'not-a-cfi', spineIndex: null }), 'ignore-unparseable');
  assert.equal(decideNavigation({ ...base, targetCfi: 'spine:99', spineIndex: 99 }), 'ignore-out-of-range');
  assert.equal(decideNavigation({ ...base, targetCfi: 'spine:2', spineIndex: 2 }), 'ignore-same-chapter');
  // A same-chapter target that names an element is still actionable.
  assert.equal(
    decideNavigation({ ...base, targetCfi: 'spine:2:anchor:s2', spineIndex: 2, anchor: 's2' }),
    'anchor-only'
  );
  assert.equal(
    decideNavigation({ ...base, targetCfi: 'spine:4:anchor:s4', spineIndex: 4, anchor: 's4' }),
    'navigate'
  );
});

/* -------------------------------------------------------------------------- */
/* reading position                                                            */
/* -------------------------------------------------------------------------- */

test('reading position helpers are installed for both reader modes', () => {
  for (const mode of ['paginated', 'continuous'] as const) {
    const script = readingPositionScript(mode);
    assert.match(script, new RegExp(`mode === '${mode}'`));
    assert.match(script, /__liruneCapturePosition/);
    assert.match(script, /__liruneRequestPosition/);
    assert.match(script, /__liruneRestoreTextOffset/);
    assert.match(script, /__liruneFindTextElement/);
  }
});

test('position restore prefers element anchors over pixel offsets', () => {
  const paginated = restorePositionScript('paginated', { anchorId: 'sec-3', page: 7 }, 0);
  // The id travels as JSON data, never as interpolated code.
  assert.match(paginated, /getElementById\(position\.anchorId\)/);
  assert.match(paginated, /offsetLeft/);
  assert.match(paginated, /getColumnStep/);

  const continuous = restorePositionScript('continuous', { chapterIndex: 4, anchorId: 'p12' }, 0);
  assert.match(continuous, /getElementById\('chapter-' \+ position\.chapterIndex\)/);
  assert.match(continuous, /getElementById\(position\.anchorId\)/);
  assert.match(continuous, /dispatchEvent\(new Event\('scroll'\)\)/);
});

test('position restore falls back to a scroll ratio when no anchor exists', () => {
  const script = restorePositionScript('continuous', { chapterIndex: 2, ratio: 0.75 }, 0);
  assert.match(script, /scrollHeight/);
  assert.match(script, /0\.75/);
});

test('position payloads are validated before they are applied', () => {
  assert.equal(isReadingPosition({ anchorId: 'x' }), true);
  assert.equal(isReadingPosition({ textOffset: 12 }), true);
  assert.equal(isReadingPosition({ ratio: 0.5 }), true);
  assert.equal(isReadingPosition(null), false);
  assert.equal(isReadingPosition('spine:1'), false);
  assert.equal(restorePositionScript('continuous', null), '');
});

test('a position payload containing "$" survives serialisation', () => {
  const script = restorePositionScript('continuous', { anchorId: 'a$&b', chapterIndex: 0 }, 0);
  assert.match(script, /a\$&b/);
  assert.doesNotMatch(script, /undefined/);
});