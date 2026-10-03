/**
 * Lirune Reader Mobile — reader WebView document
 *
 * Builds the HTML the reader WebView renders. It is deliberately free of React
 * Native imports so the automated EPUB harness can render the exact same document
 * in Node and assert on it.
 *
 * Cascade order matters: book CSS is emitted FIRST, reader CSS second. That way a
 * publisher's `body { background: #fff }` is overridden by the reader's own rule
 * without needing `!important` against every book in the world — while the book
 * still keeps all of its typography (drop caps, indents, floats, blockquotes,
 * small caps, page-break hints).
 */

import type { ReaderLayout } from '../reader/readerLayout.ts';
import { SELECTION_WATCHER_JS } from '../reader/selectionBridge.ts';
import { readingPositionScript, type ReaderMode } from '../reader/readingPosition.ts';

export interface ReaderPalette {
  bg: string;
  text: string;
  muted: string;
  link: string;
  border?: string;
}

export interface ReaderDocumentInput {
  mode: ReaderMode;
  /** Book CSS, already resource-inlined. Emitted before the reader stylesheet. */
  bookCss: string;
  /** Body markup for the chapter, or the full continuous document shell. */
  body: string;
  palette: ReaderPalette;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  alignment: string;
  paragraphSpacing: number;
  layout: ReaderLayout;
  /** Two reading columns side by side (tablet, paginated mode). */
  twoColumn: boolean;
  /** Open the chapter on its last column (used by "previous chapter" paging). */
  startAtEnd: boolean;
  /** Initial vertical offset for a continuous-mode restore from a saved CFI. */
  initialScrollY: number;
  /** Chapter titles keyed by index, used by the continuous chapter headers. */
  chapterTitles?: string[];
  chapterCount?: number;
  currentChapterIndex?: number;
  /** Id of the chapter the continuous shell should render content into. */
  activeChapterBodyId?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

const VIEWPORT_META =
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes, viewport-fit=cover">';

/**
 * Reader-owned safety and typography rules.
 *
 * These never remove book styling wholesale — they bound it. Publisher CSS is
 * free to set indents, line-height, text-align, floats, drop caps and margins on
 * content elements; it just cannot make a 900px-wide `div` overflow the reading
 * column or paint over the page indicator.
 */
/**
 * Horizontal geometry for the paginated column.
 *
 * The multicol container is exactly one viewport wide and carries NO horizontal
 * padding: in CSS multicol, padding separates the whole flow, not neighbouring
 * columns, so a padded container leaves the next column peeking into the right
 * edge of the current one. The reading margin is therefore applied to the content
 * *inside* each column fragment, and one page is one full viewport width.
 *
 * Getting this wrong is what produced left/right clipping (a `content-box`
 * container whose `width: 100vw` plus padding overflowed the viewport) and the
 * one-character column sliver on the right edge.
 */
export function paginatedColumnGeometry(
  layout: ReaderLayout,
  twoColumn: boolean
): { columnStep: number; columnWidth: number; sideInset: number } {
  const columnStep = twoColumn
    ? Math.max(1, Math.floor(layout.viewportWidth / 2))
    : Math.max(1, layout.viewportWidth);
  // In single-column mode the inset is the centred reading margin. In two-column
  // mode each column is much narrower than the viewport, so the margin computed
  // for one wide centred column would leave no room for text — it is capped to a
  // small fraction of the column instead.
  const sideInset = twoColumn
    ? Math.min(layout.sideOffset, Math.max(4, Math.floor(columnStep * 0.08)))
    : layout.sideOffset;
  return { columnStep, columnWidth: columnStep, sideInset };
}

function readerCss(input: ReaderDocumentInput): string {
  const { palette, layout } = input;
  const border = palette.border || 'rgba(128,128,128,0.2)';
  const { columnStep, sideInset } = paginatedColumnGeometry(layout, input.twoColumn);

  return `
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html {
      width: 100%;
      max-width: 100%;
      height: ${input.mode === 'paginated' ? '100%' : 'auto'};
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      background-color: ${palette.bg};
      color: ${palette.text};
      ${input.mode === 'paginated' ? 'overflow: hidden;' : 'overflow-x: hidden;'}
      word-wrap: break-word;
      overflow-wrap: break-word;
      -webkit-text-size-adjust: 100%;
    }
    body {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      background-color: ${palette.bg} !important;
      color: ${palette.text} !important;
      font-family: ${input.fontFamily};
      font-size: ${input.fontSize}px;
      line-height: ${input.lineHeight};
      text-align: ${input.alignment};
      ${input.mode === 'paginated' ? 'height: 100%; overflow: hidden; user-select: none; -webkit-user-select: none;' : 'overflow-x: hidden;'}
    }

    /* --- reading column -------------------------------------------------- */
    #viewport {
      width: 100%;
      height: 100%;
      overflow: hidden;
      position: relative;
      box-sizing: border-box;
    }
    #book-content {
      width: 100%;
      max-width: 100%;
      height: 100%;
      margin: 0;
      box-sizing: border-box;
      column-width: ${columnStep}px;
      column-gap: 0px;
      column-fill: auto;
      /* No horizontal padding here: in multicol it would only inset the whole
         flow and let the neighbouring column show through on the right. */
      padding: ${layout.padTop}px 0 ${layout.padBottom}px 0;
      overflow: visible;
      transition: transform 0.22s cubic-bezier(0.25, 1, 0.5, 1);
      will-change: transform;
    }
    /* The reading margin lives on the content inside each column fragment, so
       every column gets its own inset and no column can overlap the next. */
    #book-content > * {
      box-sizing: border-box;
      padding-left: ${sideInset}px;
      padding-right: ${sideInset}px;
      max-width: 100%;
      min-width: 0;
    }
    #continuous-container {
      width: 100%;
      max-width: 100%;
      margin: 0;
      box-sizing: border-box;
      padding: ${layout.padTop}px ${layout.sideOffset}px ${layout.padBottom}px ${layout.sideOffset}px;
      overflow-x: hidden;
    }
    .epub-chapter-content, .epub-content, .chapter-body {
      box-sizing: border-box;
      max-width: 100%;
      min-width: 0;
    }

    /* --- publisher typography is preserved -------------------------------- */
    p, div, li, blockquote, dd, dt, td, th, figcaption, aside, section {
      max-width: 100%;
      min-width: 0;
    }
    p {
      margin-top: 0;
      margin-bottom: ${input.paragraphSpacing}em;
      orphans: 2;
      widows: 2;
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${palette.text};
      line-height: 1.28;
      margin-top: 1.35em;
      margin-bottom: 0.55em;
      break-after: avoid;
      page-break-after: avoid;
      max-width: 100%;
    }
    img, svg, image, canvas, video {
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain;
    }
    table {
      max-width: 100% !important;
      box-sizing: border-box;
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    pre, code, kbd, samp {
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
      max-width: 100%;
    }
    blockquote {
      margin-left: 0;
      margin-right: 0;
      padding-left: 1em;
      border-left: 3px solid ${border};
      color: ${palette.text};
      max-width: 100%;
    }
    a {
      color: ${palette.link};
      text-decoration: none;
      pointer-events: none;
    }

    /* --- MathML ----------------------------------------------------------
     * MathML is preserved end to end (the sanitiser has no tag allowlist, so
     * <math> and its presentation attributes reach the WebView intact) because
     * Chromium — and therefore Android System WebView — has shipped MathML Core
     * since Chrome 109. On an older WebView <math> renders as an unknown element
     * and is effectively invisible; that is a platform limitation, and the
     * reader deliberately does not ship a third-party math renderer for it.
     * These rules only make sure an equation can never widen the column.
     */
    math, mrow, mfrac, msqrt, mroot, msub, msup, msubsup, munderover, mtable, semantics, annotation {
      max-width: 100%;
      overflow: hidden;
    }
    math {
      display: inline-block;
      vertical-align: middle;
      overflow-x: auto;
    }
    annotation {
      display: none;
    }

    /* --- pagination hints stay, but never on the reader container --------- */
    #book-content, #continuous-container, .epub-content, body, html {
      break-before: auto;
      page-break-before: auto;
      break-after: auto;
      page-break-after: auto;
      max-width: 100%;
    }
    .chapter-section {
      break-inside: auto;
      page-break-inside: auto;
    }

    /* --- EPUB semantics: footnotes / endnotes ---------------------------- */
    aside[epub\\:type~="footnote"],
    aside[epub\\:type~="endnote"],
    aside[role~="doc-footnote"],
    aside[role~="doc-endnote"],
    div[epub\\:type~="footnote"],
    section[epub\\:type~="footnote"] {
      margin-top: 1.6em;
      padding-top: 0.8em;
      border-top: 1px solid ${border};
      font-size: 0.92em;
      color: ${palette.text};
      break-inside: avoid;
      page-break-inside: avoid;
    }
    aside[epub\\:type~="footnote"] > p:first-child,
    aside[epub\\:type~="endnote"] > p:first-child {
      text-indent: 0;
    }
    a[epub\\:type~="noteref"],
    a[epub\\:type~="notereference"],
    a[role~="doc-noteref"] {
      vertical-align: super;
      font-size: 0.8em;
      color: ${palette.link};
    }

    /* --- continuous-mode chapter chrome ----------------------------------- */
    .chapter-section {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      margin-bottom: 32px;
      overflow-x: hidden;
    }
    .chapter-header {
      margin-top: 1.8em;
      margin-bottom: 0.8em;
      border-bottom: 1px solid ${border};
      padding-bottom: 6px;
    }
    /* The chapter already opens with its own heading, so the injected header
       would print the same title twice. */
    .chapter-section[data-has-heading="true"] > .chapter-header {
      display: none;
    }
    .chapter-marker {
      color: ${palette.text};
      font-size: 1.35em;
      margin: 0;
      text-indent: 0;
    }
    .chapter-placeholder {
      padding: 32px 0;
      text-align: center;
      color: ${palette.muted};
      font-style: italic;
    }
    .chapter-divider {
      border: none;
      height: 1px;
      background-color: ${border};
      margin: 40px 0 20px 0;
    }
    .epub-cover-container {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto;
      max-width: 100%;
      min-height: 40vh;
    }
    [data-lirune-hidden] { display: none !important; }
  `;
}

function paginatedScript(input: ReaderDocumentInput): string {
  const { columnStep } = paginatedColumnGeometry(input.layout, input.twoColumn);
  return `
    var currentPage = 0;
    var totalPages = 1;
    var startAtEnd = ${input.startAtEnd ? 'true' : 'false'};
    var initialScrollY = ${input.initialScrollY};
    var currentZoom = 1.0;
    var baseFontSize = ${input.fontSize};
    var initialPinchDist = 0;
    var initialZoom = 1.0;
    var lastTapTime = 0;
    var colStepPx = ${columnStep};
    var isTwoCol = ${input.twoColumn ? 'true' : 'false'};

    /**
     * Column count from the measured flow.
     *
     * The container has no horizontal padding, so scrollWidth is exactly the
     * summed column width: the page count is that divided by one column step.
     */
    function measurePages() {
      var content = document.getElementById('book-content');
      if (!content) return 1;
      var style = window.getComputedStyle(content);
      var padLeft = parseFloat(style.paddingLeft) || 0;
      var padRight = parseFloat(style.paddingRight) || 0;
      var flowWidth = Math.max(1, content.scrollWidth - padLeft - padRight);
      totalPages = Math.max(1, Math.round(flowWidth / colStepPx));
      return totalPages;
    }

    function updateTransform() {
      var content = document.getElementById('book-content');
      if (content) {
        content.style.transform = 'translateX(-' + (currentPage * colStepPx) + 'px)';
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pageTurn',
        currentPage: currentPage,
        totalPages: totalPages
      }));
    }

    function applyZoom() {
      var content = document.getElementById('book-content');
      if (content) {
        content.style.fontSize = Math.round(baseFontSize * currentZoom) + 'px';
        measurePages();
        updateTransform();
      }
    }

    function goToPage(p) {
      measurePages();
      if (p < 0) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageBoundary', boundary: 'prev' }));
        return;
      }
      if (p >= totalPages) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageBoundary', boundary: 'next' }));
        return;
      }
      currentPage = p;
      updateTransform();
    }

    window.__lirunePager = {
      getPage: function () { return currentPage; },
      setPage: function (p) {
        measurePages();
        currentPage = Math.max(0, Math.min(totalPages - 1, p));
        updateTransform();
      },
      getPageCount: function () { return measurePages(); },
      getPageRatio: function () { return totalPages > 1 ? currentPage / (totalPages - 1) : 0; },
      getColumnStep: function () { return colStepPx; },
      measure: measurePages
    };

    window.addEventListener('load', function () {
      window.setTimeout(function () {
        if (initialScrollY > 0) window.scrollTo(0, initialScrollY);
        measurePages();
        currentPage = startAtEnd ? Math.max(0, totalPages - 1) : 0;
        updateTransform();
      }, 60);
    });

    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartTime = 0;

    document.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = currentZoom;
      } else if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && initialPinchDist > 10) {
        var currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        var scale = currentDist / initialPinchDist;
        var newZoom = Math.max(0.8, Math.min(2.5, initialZoom * scale));
        if (Math.abs(newZoom - currentZoom) > 0.04) {
          currentZoom = newZoom;
          applyZoom();
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (e.changedTouches.length !== 1) return;
      var deltaX = e.changedTouches[0].clientX - touchStartX;
      var deltaY = e.changedTouches[0].clientY - touchStartY;
      var elapsed = Date.now() - touchStartTime;

      if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 600) {
        goToPage(currentPage + (deltaX < 0 ? 1 : -1));
        return;
      }

      if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && elapsed < 400) {
        var now = Date.now();
        if (now - lastTapTime < 320) {
          if (currentZoom !== 1.0) {
            currentZoom = 1.0;
            applyZoom();
            lastTapTime = 0;
            return;
          }
        }
        lastTapTime = now;

        var x = e.changedTouches[0].clientX;
        var ratio = x / (window.innerWidth || 1);
        var prevZone = isTwoCol ? 0.2 : 0.28;
        var nextZone = isTwoCol ? 0.8 : 0.72;
        if (ratio < prevZone) goToPage(currentPage - 1);
        else if (ratio > nextZone) goToPage(currentPage + 1);
        else window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
      }
    }, { passive: true });
  `;
}

function continuousScript(input: ReaderDocumentInput): string {
  return `
    window.__epubHydrating = true;
    var currentZoom = 1.0;
    var baseFontSize = ${input.fontSize};
    var initialPinchDist = 0;
    var initialZoom = 1.0;
    var lastTapTime = 0;

    function applyContinuousZoom() {
      var container = document.getElementById('continuous-container') || document.body;
      container.style.fontSize = Math.round(baseFontSize * currentZoom) + 'px';
    }

    document.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = currentZoom;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && initialPinchDist > 10) {
        var currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        var scale = currentDist / initialPinchDist;
        var newZoom = Math.max(0.8, Math.min(2.5, initialZoom * scale));
        if (Math.abs(newZoom - currentZoom) > 0.04) {
          currentZoom = newZoom;
          applyContinuousZoom();
        }
      }
    }, { passive: true });

    document.body.addEventListener('click', function (e) {
      var now = Date.now();
      if (now - lastTapTime < 320 && currentZoom !== 1.0) {
        currentZoom = 1.0;
        applyContinuousZoom();
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;

      var ratio = e.clientX / (window.innerWidth || 1);
      if (ratio < 0.22) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prevChapter' }));
      else if (ratio > 0.78) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nextChapter' }));
      else window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
    });

    window.addEventListener('scroll', function () {
      if (window.__epubHydrating) return;
      var doc = document.documentElement;
      var total = doc.scrollHeight - window.innerHeight;
      var percent = total > 0 ? Math.min(100, Math.round((window.pageYOffset / total) * 100)) : 0;
      var markers = Array.prototype.slice.call(document.querySelectorAll('[data-chapter-index]'));
      var chapterIndex = 0;
      for (var i = 0; i < markers.length; i++) {
        if (markers[i].getBoundingClientRect().top <= window.innerHeight * 0.4) {
          chapterIndex = Number(markers[i].getAttribute('data-chapter-index')) || 0;
        }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'scrollProgress',
        percent: percent,
        scrollY: window.pageYOffset,
        chapterIndex: chapterIndex
      }));
    }, { passive: true });

    window.__lirunePager = null;
  `;
}

export interface ContinuousShellOptions {
  /**
   * Whether the active chapter's own body opens with a heading. The active
   * section is rendered from a document we already hold, so the answer is known
   * before the WebView exists; every other section is corrected later by
   * `__liruneChapterHeader` once its chapter is hydrated.
   */
  activeHasLeadingHeading?: boolean;
}

/**
 * Renders the continuous-mode chapter shell: one `<section>` per spine item, with
 * the active chapter's content already inlined so the first meaningful text paint
 * does not wait for a hydration round trip.
 *
 * A section with no navigation title gets no marker text at all: `Chapter 5` for a
 * document that is really chapter three is worse than no header, and the real
 * title is substituted as soon as the chapter has been loaded.
 */
export function buildContinuousShell(
  chapterCount: number,
  chapterTitles: string[],
  activeIndex: number,
  activeBodyHtml: string,
  options: ContinuousShellOptions = {}
): string {
  const sections: string[] = [];
  for (let index = 0; index < chapterCount; index++) {
    const isActive = index === activeIndex;
    const title = chapterTitles[index] || '';
    const hasHeading = isActive && options.activeHasLeadingHeading === true;
    const header =
      `<div class="chapter-header"${title ? '' : ' style="display:none"'}>${
        title ? `<h2 class="chapter-marker">${escapeHtml(title)}</h2>` : ''
      }</div>`;
    sections.push(
      `<section id="chapter-${index}" data-chapter-index="${index}" class="chapter-section" data-loaded="${isActive ? 'true' : 'false'}" data-has-heading="${hasHeading ? 'true' : 'false'}">` +
        header +
        `<div class="chapter-body" id="chapter-body-${index}">${isActive ? activeBodyHtml : '<div class="chapter-placeholder"><p class="loading-hint">Loading chapter…</p></div>'}</div>` +
        `</section>`
    );
  }
  return `<div id="continuous-container">${sections.join('<hr class="chapter-divider" />')}</div>`;
}

/** Builds the complete reader document for either mode. */
export function buildReaderDocument(input: ReaderDocumentInput): string {
  const bookCss = input.bookCss ? `<style id="book-css">${input.bookCss}</style>` : '';
  const script =
    input.mode === 'paginated' ? paginatedScript(input) : continuousScript(input);

  return `<!DOCTYPE html>
<html>
<head>
  ${VIEWPORT_META}
  ${bookCss}
  <style id="reader-css">${readerCss(input)}</style>
</head>
<body>
  ${
    input.mode === 'paginated'
      ? `<div id="viewport"><div id="book-content" class="epub-content">${input.body}</div></div>`
      : input.body
  }
  <script>
    ${script}
    ${readingPositionScript(input.mode)}
    ${SELECTION_WATCHER_JS}
  </script>
</body>
</html>`;
}