/**
 * Pagination measurement tests.
 *
 * The reader measured 60ms after `load` and rounded the page count, so a chapter
 * could report a page count measured before the fonts and images settled and, on a
 * flow that did not divide evenly, silently drop the last partial page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildReaderDocument, paginatedColumnGeometry } from '../../services/epub/readerDocument.ts';
import { computeReaderGeometry } from '../../services/epub/readerGeometry.ts';
import { computeReaderLayout } from '../../services/reader/readerLayout.ts';

const PALETTE = { bg: '#ffffff', text: '#111111', link: '#3333ff', border: '#cccccc', muted: '#888888' };

function layoutFor(width: number, height: number) {
  return computeReaderLayout({
    containerWidth: width,
    containerHeight: height,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    fontSize: 18,
    userMargin: 12,
    pageGap: 16,
    fontScale: 1,
  });
}

function documentFor(width = 412, height = 915) {
  return buildReaderDocument({
    mode: 'paginated',
    bookCss: '',
    body: '<p>Once upon a time.</p>',
    palette: PALETTE,
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    alignment: 'left',
    paragraphSpacing: 1,
    layout: layoutFor(width, height),
    twoColumn: false,
    startAtEnd: false,
    initialScrollY: 0,
  });
}

test('the page count is rounded up so the last page is never dropped', () => {
  const html = documentFor();
  assert.match(
    html,
    /totalPages = Math\.max\(1, Math\.ceil\(\(flowWidth - 1\) \/ colStepPx\)\)/,
    'pagination must ceil, never round'
  );
  assert.doesNotMatch(html, /Math\.round\(flowWidth \/ colStepPx\)/);
});

test('pagination re-measures once the document has settled', () => {
  const html = documentFor();
  // Every settle signal the reader needs: fonts, images, resize, rotation.
  assert.match(html, /document\.fonts\.ready/);
  assert.match(html, /addEventListener\('load', scheduleMeasure/);
  assert.match(html, /new ResizeObserver\(scheduleMeasure\)/);
  assert.match(html, /addEventListener\('resize', scheduleMeasure\)/);
  assert.match(html, /addEventListener\('orientationchange', scheduleMeasure\)/);
});

test('re-measuring is collapsed into one frame and only reports real changes', () => {
  const html = documentFor();
  assert.match(html, /if \(measureScheduled\) return;/);
  assert.match(html, /window\.requestAnimationFrame/);
  assert.match(html, /if \(previous !== totalPages\)/);
});

test('a changed page count is reported to the host and clamps the current page', () => {
  const html = documentFor();
  assert.match(html, /currentPage = Math\.max\(0, Math\.min\(totalPages - 1, currentPage\)\)/);
  assert.match(html, /type: 'pageCount'/);
});

test('the column step still derives from the measured column', () => {
  const layout = layoutFor(1024, 768);
  const single = paginatedColumnGeometry(layout, false);
  const twin = paginatedColumnGeometry(layout, true);
  assert.equal(single.columnStep, layout.viewportWidth);
  assert.equal(twin.columnStep, Math.floor(layout.viewportWidth / 2));
  assert.ok(single.sideInset > 0);
});

test('a document still builds for a tablet with two columns', () => {
  const settings = {
    flow: 'paginated' as const,
    theme: 'day',
    fontFamily: 'system',
    fontSize: 18,
    lineHeight: 1.6,
    margin: 12,
    pageGap: 16,
    alignment: 'left',
    paragraphSpacing: 1,
  };
  const geometry = computeReaderGeometry(settings, layoutFor(1024, 768));
  assert.equal(geometry.twoColumn, true);
  assert.doesNotThrow(() => documentFor(1024, 768));
});
