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
      /* Snappier than a 300ms ease: a page turn should feel like a sheet being
         pushed, not like a carousel settling. The decelerating curve starts fast
         and stops hard, which is what reads as "responsive" here. */
      transition: transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1);
      will-change: transform;
    }
    /* Applied for any transform change the reader did not ask to animate
       (a re-measure after a font swap, a pinch zoom). Animating those is what
       made the page appear to lag behind the gesture. */
    #book-content.no-anim {
      transition: none;
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
    var measureScheduled = false;
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
      // ceil, not round: rounding can drop the last, partially filled page and
      // leave the reader stuck one screen short of the end of the chapter.
      totalPages = Math.max(1, Math.ceil((flowWidth - 1) / colStepPx));
      return totalPages;
    }

    /**
     * Re-measures once the document has settled.
     *
     * Measuring 60ms after load catches the CSS but not the fonts, the images or
     * a late publisher stylesheet, so the reported page count could be wrong for the
     * rest of the session. Every settle signal funnels through one animation
     * frame, and the host is only told when the count actually changed.
     */
    function scheduleMeasure() {
      if (measureScheduled) return;
      measureScheduled = true;
      window.requestAnimationFrame(function () {
        measureScheduled = false;
        var previous = totalPages;
        measurePages();
        if (previous !== totalPages) {
          currentPage = Math.max(0, Math.min(totalPages - 1, currentPage));
          updateTransform(false);
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageCount', totalPages: totalPages }));
        }
      });
    }

    function watchSettledLayout() {
      var content = document.getElementById('book-content');
      if (!content) return;

      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(scheduleMeasure).catch(function () {});
      }

      // Images change the column width as they resolve; a data-URI image is
      // already decoded, but a lazily attached one is not.
      var images = content.getElementsByTagName('img');
      for (var i = 0; i < images.length; i++) {
        if (images[i].complete) continue;
        images[i].addEventListener('load', scheduleMeasure, { once: true });
        images[i].addEventListener('error', scheduleMeasure, { once: true });
      }

      if (typeof ResizeObserver === 'function') {
        var observer = new ResizeObserver(scheduleMeasure);
        observer.observe(content);
      }
      window.addEventListener('resize', scheduleMeasure);
      window.addEventListener('orientationchange', scheduleMeasure);
    }

    function updateTransform(animate) {
      var content = document.getElementById('book-content');
      if (content) {
        // A non-animated change (zoom, re-measure) must not queue behind a turn
        // that is still easing, or the page visibly trails the finger.
        if (animate === false) content.classList.add('no-anim');
        content.style.transform = 'translateX(-' + (currentPage * colStepPx) + 'px)';
        if (animate === false) {
          window.requestAnimationFrame(function () {
            if (content) content.classList.remove('no-anim');
          });
        }
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
        updateTransform(false);
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
      updateTransform(true);
    }

    window.__lirunePager = {
      getPage: function () { return currentPage; },
      setPage: function (p) {
        measurePages();
        currentPage = Math.max(0, Math.min(totalPages - 1, p));
        updateTransform(false);
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
        updateTransform(false);
        watchSettledLayout();
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

      // Raised threshold: 55px minimum horizontal, must be 2x more horizontal than
      // vertical to avoid accidental page turns on diagonal scrolls.
      if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 2.0 && elapsed < 500) {
        goToPage(currentPage + (deltaX < 0 ? 1 : -1));
        return;
      }

      // Tap: small movement within a short time window
      if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12 && elapsed < 350) {
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
    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartTime = 0;
    var touchStartScrollY = 0;
    var lastHydrateRequest = 0;

    function applyContinuousZoom() {
      var container = document.getElementById('continuous-container') || document.body;
      container.style.fontSize = Math.round(baseFontSize * currentZoom) + 'px';
    }

    /**
     * Asks the host to hydrate the chapters the reader can see.
     *
     * Continuous mode used to inline every chapter before revealing the first
     * frame, so a 400-chapter book opened onto a screen of placeholders for as
     * long as the whole archive took to extract — and any chapter that failed to
     * extract stayed a "Loading chapter…" placeholder for good. Hydration is
     * now demand-driven: the document reports which unloaded sections are near
     * the viewport and the host fills exactly those.
     */
    function scanPendingChapters(force) {
      var now = Date.now();
      if (!force && now - lastHydrateRequest < 120) return;
      lastHydrateRequest = now;
      var sections = document.querySelectorAll('.chapter-section[data-loaded="false"]');
      var pending = [];
      for (var i = 0; i < sections.length; i++) {
        var rect = sections[i].getBoundingClientRect();
        if (rect.bottom < -window.innerHeight) continue;
        // Document order, so the first section past the window ends the scan.
        if (rect.top > window.innerHeight * 1.5) break;
        pending.push(Number(sections[i].getAttribute('data-chapter-index')));
        if (pending.length >= 6) break;
      }
      if (!pending.length) return;
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'hydrateRequest',
          indices: pending
        }));
      } catch (e) {}
    }
    window.__liruneScanPending = scanPendingChapters;

    document.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = currentZoom;
        return;
      }
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        touchStartScrollY = window.pageYOffset;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && initialPinchDist > 24) {
        var currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        var scale = currentDist / initialPinchDist;
        var newZoom = Math.max(0.8, Math.min(2.5, initialZoom * scale));
        // One font-size change relayouts the whole document, so the step is wide
        // on purpose: a fine-grained threshold turned a pinch into a stutter.
        if (Math.abs(newZoom - currentZoom) > 0.08) {
          currentZoom = newZoom;
          applyContinuousZoom();
        }
      }
    }, { passive: true });

    /**
     * A tap, not a scroll.
     *
     * The reader turns chapters from the screen edges and toggles the controls
     * from the middle, so a gesture that actually moved the page must never
     * reach this handler. Movement, duration and the scroll offset at touch
     * start are all checked: a fling that ends with the finger back near where
     * it started still moved the page, and the offset is the only honest signal.
     */
    document.addEventListener('touchend', function (e) {
      if (e.changedTouches.length !== 1) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      var elapsed = Date.now() - touchStartTime;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
      if (elapsed > 320) return;
      if (Math.abs(window.pageYOffset - touchStartScrollY) > 4) return;

      var now = Date.now();
      if (now - lastTapTime < 320 && currentZoom !== 1.0) {
        currentZoom = 1.0;
        applyContinuousZoom();
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;

      var ratio = e.changedTouches[0].clientX / (window.innerWidth || 1);
      if (ratio < 0.18) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prevChapter' }));
      else if (ratio > 0.82) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nextChapter' }));
      else window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
    }, { passive: true });

    window.addEventListener('scroll', function () {
      scanPendingChapters(false);
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

    window.addEventListener('load', function () {
      window.setTimeout(function () { scanPendingChapters(true); }, 0);
    });

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

/**
 * Tells the host the document has actually painted.
 *
 * `onLoadEnd` fires when the load finished, which on Android is before the
 * compositor has put a frame on screen — revealing the WebView on it is what
 * produced the flash of unstyled, half-laid-out content on open. Two animation
 * frames after `load` is the earliest point at which the first real frame is on
 * screen. If anything goes wrong the host still reveals the view on its own
 * timer, so this is an optimisation of timing and never a gate.
 */
const FIRST_PAINT_JS = `
(function () {
  function announce() {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'readerReady' }));
        } catch (e) {}
      });
    });
  }
  if (document.readyState === 'complete') announce();
  else window.addEventListener('load', announce, { once: true });
})();
`;

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
    ${FIRST_PAINT_JS}
  </script>
</body>
</html>`;
}