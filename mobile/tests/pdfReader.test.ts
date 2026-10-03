/**
 * PDF viewer HTML contract tests.
 *
 * The PDF path had no tests at all, so the regressions below were only ever found
 * on a device: a 100MB file killed the WebView, insets were baked into the
 * document so a rotation never refitted, cancelling a render and immediately
 * starting another threw "Cannot use the same canvas", and a 2x device ratio was
 * forced even on a 1x screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Reads a source file relative to this test, as text. */
function readSource(relativePath: string): string {
  // `import.meta.url` is a DOM URL to the type checker and a Node URL at runtime.
  return readFileSync(fileURLToPath(import.meta.url.replace(/\/[^/]*$/, `/${relativePath}`)), 'utf8');
}

const source = readSource('../components/reader/PdfReaderView.tsx');

test('the document is streamed in chunks instead of pasted into the HTML', () => {
  assert.doesNotMatch(source, /readAsBase64/, 'the whole PDF must not be read as base64');
  assert.match(source, /window\.__pdfChunk\(\$\{index\}/);
  assert.match(source, /readAsStringAsync\(bookPath, \{[\s\S]*position,[\s\S]*length,/);
  // The reassembled buffer is allocated once, not grown chunk by chunk.
  assert.match(source, /chunkBytes = new Uint8Array\(byteLength\)/);
});

test('loading progress is real, not an indefinite spinner', () => {
  assert.match(source, /Loading document…/);
  assert.match(source, /setLoadProgress\(\(index \+ 1\) \/ totalChunks\)/);
});

test('layout is pushed to the page instead of interpolated into the document', () => {
  assert.match(source, /window\.__setLayout\(/);
  assert.match(source, /JSON\.stringify\(\{\s*w: windowWidth,\s*h: windowHeight,\s*top: insets\.top,\s*bottom: insets\.bottom,\s*fit: fitModeRef\.current,/);
  assert.doesNotMatch(source, /padding: \$\{Math\.max\(insets\.top/, 'insets must not be baked into the CSS');
});

test('renders are queued instead of cancelled and restarted on the same canvas', () => {
  assert.match(source, /if \(renderTask\) \{ pendingRender = pageNum; return; \}/);
  assert.doesNotMatch(source, /renderTask\.cancel\(\)/, 'cancelling mid-render throws on a shared canvas');
  assert.match(source, /if \(pendingRender !== null\)/);
});

test('the canvas is capped and the device pixel ratio is not inflated', () => {
  assert.match(source, /MAX_CANVAS_PIXELS = 16_000_000/);
  assert.match(source, /if \(pixels > MAX_CANVAS_PIXELS\)/);
  assert.match(source, /Math\.min\(window\.devicePixelRatio \|\| 1, 3\)/);
  assert.doesNotMatch(source, /Math\.max\(window\.devicePixelRatio \|\| 1, 2\.0\)/);
});

test('fit mode is explicit and remembered per book', () => {
  assert.match(source, /layout\.fit === 'page'/);
  assert.match(source, /metadata: \{ \.\.\.\(book\.metadata \|\| \{\}\), pdfFit: mode \}/);
});

test('zoom re-renders sharply and edge taps stop turning pages while zoomed', () => {
  assert.match(source, /currentZoom > 1\.05/);
  assert.match(source, /bake the zoom into the render/);
  assert.match(source, /panX = startPanX/);
});

test('search is wired end to end and capped', () => {
  assert.match(source, /window\.__search\(/);
  assert.match(source, /pdfPage\.getTextContent\(\)/);
  assert.match(source, /var MAX_RESULTS = 500/);
  assert.match(source, /onSearchResults\?\.\(searchResultsRef\.current\)/);
});

test('the outline becomes a table of contents', () => {
  assert.match(source, /doc\.getOutline\(\)/);
  assert.match(source, /'page:' \+ \(pageIndex \+ 1\)/);
  assert.match(source, /onTOCLoaded\?\.\(data\.toc\)/);
});

test('errors are recoverable and encrypted PDFs ask for a password', () => {
  assert.match(source, /Try again/);
  assert.match(source, /PasswordException/);
  assert.match(source, /type: 'needsPassword'/);
  assert.match(source, /secureTextEntry/);
});

/* -------------------------------------------------------------------------- */
/* Bounded PDF metadata at import                                             */
/* -------------------------------------------------------------------------- */

const extractor = readSource('../services/metadata/MetadataExtractor.ts');

test('PDF import reads the ends of the file, not the whole thing', () => {
  // Only the PDF extractor matters here; FB2 and MOBI legitimately read whole files.
  const pdfSection = extractor.slice(
    extractor.indexOf('private static async extractPdf'),
    extractor.indexOf('// ================= MOBI')
  );
  assert.doesNotMatch(pdfSection, /fileStorage\.readAsString\(/);
  assert.match(pdfSection, /const tailLength = Math\.min\(64 \* 1024, size\)/);
  assert.match(pdfSection, /const headLength = Math\.min\(4 \* 1024, size\)/);
});

test('an unknown PDF author is reported as unknown, not as "PDF Document"', () => {
  assert.match(extractor, /author: documentAuthor \|\| 'Unknown Author'/);
  assert.doesNotMatch(extractor, /author: 'PDF Document'/);
});

test('the Info dictionary is read in both PDF string encodings', () => {
  assert.match(extractor, /readPdfInfoString\(window, 'Title'\)/);
  assert.match(extractor, /readPdfInfoString\(window, 'Author'\)/);
  assert.match(extractor, /0xfe && bytes\[1\] === 0xff/, 'UTF-16BE with a BOM');
  assert.match(extractor, /readAsStringAsync\(filePath, \{/);
});
