/**
 * Lirune Reader Mobile — Offline PDF Reader
 *
 * The document is streamed into the WebView in chunks instead of being pasted
 * into the HTML as one base64 string: a 60 MB PDF used to exist three times over
 * (base64 string, decoded buffer, pdf.js copy) and the WebView was killed for it.
 *
 * Layout is pushed to the page instead of being baked into the document, so a
 * rotation or a controls toggle re-renders the current page rather than rebuilding
 * the whole viewer.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useStableInsets } from '@/hooks/useStableInsets';
import { useWebViewRecovery } from '@/hooks/useWebViewRecovery';
import { WebView } from 'react-native-webview';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { PDFJS_SOURCE, PDFJS_WORKER } from '@/services/pdf/pdfjsAssets';
import { escapeForInlineScript } from '@/services/pdf/escapeForTemplateLiteral';
import { READER_WEBVIEW_PROPS } from '@/services/security/webviewPolicy';
import { READER_THEMES } from '@/theme/Colors';
import { useLibraryStore } from '@/state/libraryStore';
import { logger } from '@/utils/logger';

const TAG = 'PdfReaderView';

// pdf.js is vendored into the bundle (see scripts/gen-pdfjs.js) and escaped once
// at module load, so opening a PDF requires no network access at all.
const PDFJS_INLINE = escapeForInlineScript(PDFJS_SOURCE);
const PDFJS_WORKER_INLINE = escapeForInlineScript(PDFJS_WORKER);

/** Base64 characters per chunk. 512KB of base64 is ~384KB of file. */
const CHUNK_BASE64_CHARS = 512 * 1024;

/** Canvas pixel budget; past this a page rasterises into a texture Android refuses. */
const MAX_CANVAS_PIXELS = 16_000_000;

/** Above this, opening the document on a low-RAM device is likely to fail. */
const LARGE_FILE_WARNING_BYTES = 150 * 1024 * 1024;

type FitMode = 'width' | 'page';

interface PdfReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  onTotalPagesLoaded?: (pages: number) => void;
  onTOCLoaded?: (items: { id: string; label: string; href?: string }[]) => void;
  targetCfi?: string | null;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function PdfReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onTotalPagesLoaded,
  onTOCLoaded,
  targetCfi,
  searchQuery,
  onSearchResults,
}: PdfReaderViewProps) {
  const insets = useStableInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const updateBook = useLibraryStore((state) => state.updateBook);

  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [webViewReady, setWebViewReady] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<boolean>(false);
  const [passwordDraft, setPasswordDraft] = useState<string>('');
  const [fitMode, setFitMode] = useState<FitMode>(() =>
    book.metadata?.pdfFit === 'page' ? 'page' : 'width'
  );
  const [attempt, setAttempt] = useState(0);

  const webViewRef = useRef<WebView>(null);
  // A killed renderer must not leave the reader blank: the position is persisted
  // and the viewer is rebuilt from the start of the file.
  const recovery = useWebViewRecovery({
    scope: `pdf-${book.id}`,
    savePosition: () => {
      onProgressChange(
        Math.round((currentPageRef.current / Math.max(1, totalPagesRef.current)) * 100),
        `page:${currentPageRef.current}`,
        `Page ${currentPageRef.current}`
      );
    },
  });
  const totalPagesRef = useRef<number>(0);
  const pendingPageRef = useRef<number | null>(null);
  const currentPageRef = useRef<number>(1);
  const fitModeRef = useRef<FitMode>(fitMode);
  const searchQueryRef = useRef<string>(searchQuery || '');
  const searchResultsRef = useRef<SearchResult[]>([]);
  const [searchCount, setSearchCount] = useState<number>(0);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;
  const bookPath = book.filePath || book.uri || '';

  // Mirrors for values the injected scripts need but must not re-subscribe to.
  useEffect(() => {
    fitModeRef.current = fitMode;
  }, [fitMode]);
  useEffect(() => {
    searchQueryRef.current = searchQuery || '';
  }, [searchQuery]);

  const isLoading = !webViewReady || loadProgress < 1;

  const goToPage = useCallback((page: number) => {
    webViewRef.current?.injectJavaScript(
      `if (window.renderPage) window.renderPage(${page}); true;`
    );
  }, []);

  /**
   * Streams the file into the page.
   *
   * Each chunk is read with an explicit position and length, so RN never holds a
   * base64 string of the whole publication; the page reassembles the bytes into a
   * preallocated buffer and only calls `getDocument` once the last chunk lands.
   */
  const transferDocument = useCallback(async () => {
    const info = await FileSystem.getInfoAsync(bookPath);
    if (!info.exists || info.size === undefined || info.size <= 0) {
      throw new Error('PDF file could not be read or is empty.');
    }
    if (info.size > LARGE_FILE_WARNING_BYTES) {
      logger.warn(TAG, `Large PDF (${Math.round(info.size / 1024 / 1024)}MB) may be slow to open`);
    }

    const bytesPerChunk = Math.floor((CHUNK_BASE64_CHARS / 4) * 3);
    const totalChunks = Math.ceil(info.size / bytesPerChunk);
    for (let index = 0; index < totalChunks; index++) {
      const position = index * bytesPerChunk;
      const length = Math.min(bytesPerChunk, info.size - position);
      const chunk = await FileSystem.readAsStringAsync(bookPath, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length,
      });
      if (!chunk) throw new Error(`Failed reading PDF at byte ${position}.`);
      webViewRef.current?.injectJavaScript(
        `window.__pdfChunk(${index}, ${totalChunks}, ${JSON.stringify(chunk)}); true;`
      );
      setLoadProgress((index + 1) / totalChunks);
    }
  }, [bookPath]);

  const handleRetry = useCallback(() => {
    setRenderError(null);
    setLoadProgress(0);
    setWebViewReady(false);
    pendingPageRef.current = null;
    setAttempt((value) => value + 1);
  }, []);

  /**
   * Pushes the current viewport to the page.
   *
   * Insets are stable (see useStableInsets), so toggling the reader controls does
   * not change this and cannot trigger a re-render; a rotation does, and the page
   * re-rasterises the current page at the new size.
   */
  const pushLayout = useCallback(() => {
    webViewRef.current?.injectJavaScript(
      `window.__setLayout(${JSON.stringify({
        w: windowWidth,
        h: windowHeight,
        top: insets.top,
        bottom: insets.bottom,
        fit: fitModeRef.current,
      })}); true;`
    );
  }, [windowWidth, windowHeight, insets.top, insets.bottom]);

  // Document the page count once pdf.js has the file, then persist it: import
  // cannot know it without reading the whole file.
  useEffect(() => {
    if (!renderError) return;
    setLoadProgress(0);
  }, [renderError]);

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        switch (data.type) {
          case 'ready':
            // The page exists but holds no bytes yet; start streaming into it.
            setWebViewReady(true);
            pushLayout();
            void transferDocument().catch((err: any) => {
              logger.error(TAG, `Error streaming PDF: ${bookPath}`, err);
              setRenderError(err?.message || 'Failed to load PDF file.');
            });
            break;

          case 'meta': {
            setTotalPages(data.numPages);
            totalPagesRef.current = data.numPages;
            if (data.numPages > 0) {
              onTotalPagesLoaded?.(data.numPages);
              const pending = pendingPageRef.current;
              if (pending != null) {
                pendingPageRef.current = null;
                goToPage(pending);
              }
            }
            if (Array.isArray(data.toc)) onTOCLoaded?.(data.toc);
            break;
          }

          case 'pageChange':
            setCurrentPage(data.page);
            currentPageRef.current = data.page;
            onProgressChange(
              Math.round((data.page / Math.max(1, data.numPages)) * 100),
              `page:${data.page}`,
              `Page ${data.page} of ${data.numPages}`
            );
            break;

          case 'needsPassword':
            setPasswordDraft('');
            setPasswordPrompt(true);
            break;

          case 'searchResults':
            searchResultsRef.current = data.results || [];
            setSearchCount(searchResultsRef.current.length);
            onSearchResults?.(searchResultsRef.current);
            break;

          case 'error':
            logger.error(TAG, `pdf.js reported: ${data.message}`);
            setRenderError(data.message);
            break;

          case 'tap': {
            // A zoomed page is panned, not turned: an edge tap would throw the
            // reader to another page while the user is still reading this one.
            if (data.zoomed) {
              onToggleControls();
              break;
            }
            if (data.xRatio < 0.25) goToPage(currentPageRef.current - 1);
            else if (data.xRatio > 0.75) goToPage(currentPageRef.current + 1);
            else onToggleControls();
            break;
          }
        }
      } catch {
        // A malformed message is not worth tearing the reader down for.
      }
    },
    [goToPage, onProgressChange, onSearchResults, onTOCLoaded, onToggleControls, pushLayout, transferDocument, bookPath]
  );

  // Jump to the requested page once the document is open.
  useEffect(() => {
    if (!targetCfi) return;
    const page = parseInt(targetCfi.replace(/^page[:_]/, ''), 10);
    if (Number.isNaN(page) || page < 1) return;
    if (totalPages > 0) goToPage(page);
    else pendingPageRef.current = page;
  }, [targetCfi, totalPages, goToPage]);

  // Search is executed in the page, in batches, and cancelled by a new query.
  useEffect(() => {
    const query = (searchQuery || '').trim();
    if (!query || !webViewReady) {
      if (!query && searchCount > 0) setSearchCount(0);
      return;
    }
    webViewRef.current?.injectJavaScript(
      `if (window.__search) window.__search(${JSON.stringify(query)}); true;`
    );
  }, [searchQuery, webViewReady, searchCount]);

  const setFitModeForBook = useCallback(
    (mode: FitMode) => {
      setFitMode(mode);
      updateBook({ ...book, metadata: { ...(book.metadata || {}), pdfFit: mode } });
      // The page re-rasterises at the new fit; the document itself is untouched.
      webViewRef.current?.injectJavaScript(`window.__refit(); true;`);
    },
    [book, updateBook]
  );

  const providePassword = useCallback((password: string) => {
    setPasswordPrompt(false);
    webViewRef.current?.injectJavaScript(
      `window.__password(${JSON.stringify(password)}); true;`
    );
  }, []);

  // Reader controls do not change these: stable insets plus a stable window size
  // mean toggling the chrome cannot re-render the page.
  const pdfViewerHtml = useMemo(
    () => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=0.75, maximum-scale=4.0, user-scalable=yes">
  <script>
    window.onerror = function(msg, url, line, col) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(msg) + ' (' + line + ':' + col + ')' }));
      } catch (e) {}
    };
  </script>
  <script>(function(){${PDFJS_INLINE}\n}).call(window);</script>
  <script>(function(){${PDFJS_WORKER_INLINE}\n}).call(window);</script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      margin: 0; padding: 0;
      background-color: ${palette.bg};
      min-height: 100vh;
      overflow-x: auto; overflow-y: auto;
      display: flex; flex-direction: column; align-items: center;
      touch-action: pan-x pan-y pinch-zoom;
    }
    #canvas-container {
      display: flex; justify-content: center; align-items: center;
      width: 100%; min-height: 100vh;
      padding: 16px 8px 48px 8px;
      transform-origin: center center;
      transition: transform 0.1s ease-out;
    }
    canvas {
      display: block;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      border-radius: 3px;
      background-color: #FFFFFF;
    }
  </style>
</head>
<body>
  <div id="canvas-container"><canvas id="pdf-canvas"></canvas></div>

  <script>
    if (window.pdfjsWorker && window.pdfjsWorker.WorkerMessageHandler) {
      try { pdfjsLib.PDFWorker._mainThreadWorkerMessageHandler = window.pdfjsWorker.WorkerMessageHandler; } catch (e) {}
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    var MAX_CANVAS_PIXELS = ${MAX_CANVAS_PIXELS};
    var CHUNK_SIZE = ${Math.floor((CHUNK_BASE64_CHARS / 4) * 3)};

    var pdfDoc = null;
    var pageNum = 1;
    var canvas = document.getElementById('pdf-canvas');
    var container = document.getElementById('canvas-container');
    var ctx = canvas.getContext('2d');
    var renderTask = null;
    var pendingRender = null;
    var currentZoom = 1.0;
    var panX = 0;
    var panY = 0;
    var layout = { w: window.innerWidth || 360, h: window.innerHeight || 640, top: 0, bottom: 0, fit: 'width' };
    var chunks = [];
    var chunkCount = 0;
    var chunkBytes = null;
    var pendingPassword = '';
    var searchToken = 0;

    function post(message) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
    }

    function base64ToBytes(base64) {
      var raw = atob(base64);
      var out = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    }

    /** Receives one slice of the document; opens it once the last one arrives. */
    window.__pdfChunk = function (index, total, base64) {
      if (index === 0) {
        chunkCount = total;
        chunks = new Array(total);
        chunkBytes = null;
      }
      if (!chunks || total !== chunkCount) return;
      chunks[index] = base64;
      for (var i = 0; i < total; i++) if (!chunks[i]) return;

      var byteLength = 0;
      for (var j = 0; j < total; j++) byteLength += Math.floor((chunks[j].length / 4) * 3);
      chunkBytes = new Uint8Array(byteLength);
      var offset = 0;
      for (var k = 0; k < total; k++) {
        var part = base64ToBytes(chunks[k]);
        chunkBytes.set(part, offset);
        offset += part.length;
      }
      chunks = [];
      openDocument(pendingPassword);
    };

    function openDocument(password) {
      var options = { data: chunkBytes, isEvalSupported: false, disableAutoFetch: true, disableStream: true };
      if (password) options.password = password;
      pdfjsLib.getDocument(options).then(function (doc) {
        pdfDoc = doc;
        var toc = [];
        if (typeof doc.getOutline === 'function') {
          doc.getOutline().then(function (outline) {
            (outline || []).slice(0, 400).forEach(function (item, index) {
              var label = typeof item.title === 'string' ? item.title : '';
              if (!label) return;
              var href;
              var dest = item.dest;
              if (typeof dest === 'string') dest = null;
              var resolve = dest
                ? doc.getDestination(dest).then(function (resolved) {
                    var ref = Array.isArray(resolved) ? resolved[0] : null;
                    return ref ? doc.getPageIndex(ref) : null;
                  }).catch(function () { return null; })
                : Promise.resolve(null);
              resolve.then(function (pageIndex) {
                toc.push({
                  id: 'pdf_toc_' + index,
                  label: label,
                  href: pageIndex === null || pageIndex === undefined ? undefined : 'page:' + (pageIndex + 1),
                });
              });
            });
            post({ type: 'meta', numPages: doc.numPages, toc: toc });
          }).catch(function () {
            post({ type: 'meta', numPages: doc.numPages, toc: toc });
          });
        } else {
          post({ type: 'meta', numPages: doc.numPages, toc: toc });
        }

        if (window.__pendingPage) {
          var p = window.__pendingPage;
          window.__pendingPage = null;
          renderPage(p);
        } else {
          renderPage(1);
        }
      }).catch(function (err) {
        if (err && (err.name === 'PasswordException' || err.code === 1 || err.code === 2)) {
          post({ type: 'needsPassword' });
          return;
        }
        post({ type: 'error', message: (err && err.message) || 'Unable to open PDF document.' });
      });
    }

    window.__password = function (password) {
      pendingPassword = password || '';
      openDocument(pendingPassword);
    };

    function fitScale(page) {
      var base = page.getViewport({ scale: 1.0 });
      var padTop = Math.max(layout.top, 8) + 16;
      var padBottom = Math.max(layout.bottom, 8) + 48;
      var availW = Math.max(layout.w - 16, 240);
      var availH = Math.max(layout.h - padTop - padBottom, 240);
      // 'width' fills the reading measure and lets the page be taller than the
      // window (normal reading); 'page' fits the whole sheet on screen.
      return layout.fit === 'page'
        ? Math.min(availW / base.width, availH / base.height)
        : availW / base.width;
    }

    /**
     * Renders a page, one at a time.
     *
     * pdf.js throws if a second render() starts while one is in flight on the same
     * canvas, so a request that arrives mid-render is remembered and served when
     * the current render settles instead of cancelling it.
     */
    window.renderPage = function (num) {
      if (!pdfDoc) { window.__pendingPage = num; return; }
      pageNum = Math.max(1, Math.min(pdfDoc.numPages, num));
      if (renderTask) { pendingRender = pageNum; return; }

      pdfDoc.getPage(pageNum).then(function (page) {
        if (pendingRender !== null) {
          var next = pendingRender;
          pendingRender = null;
          window.renderPage(next);
          return;
        }
        var targetScale = fitScale(page) * currentZoom;
        if (!isFinite(targetScale) || targetScale <= 0) targetScale = 1.0;

        var base = page.getViewport({ scale: targetScale });
        var dpr = Math.min(window.devicePixelRatio || 1, 3);
        var renderViewport = page.getViewport({ scale: targetScale * dpr });

        // A 4K page at dpr 3 is ~100 megapixels; Android refuses the texture and
        // the WebView dies with it.
        var pixels = renderViewport.width * renderViewport.height;
        if (pixels > MAX_CANVAS_PIXELS) {
          var scaleBack = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
          renderViewport = page.getViewport({ scale: targetScale * dpr * scaleBack });
        }

        canvas.width = Math.max(1, Math.round(renderViewport.width));
        canvas.height = Math.max(1, Math.round(renderViewport.height));
        canvas.style.width = Math.round(base.width) + 'px';
        canvas.style.height = Math.round(base.height) + 'px';
        container.style.paddingTop = Math.max(layout.top, 8) + 16 + 'px';
        container.style.paddingBottom = Math.max(layout.bottom, 8) + 48 + 'px';
        container.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + currentZoom + ')';

        var context = renderViewport === base ? { canvasContext: ctx, viewport: base } : { canvasContext: ctx, viewport: renderViewport };
        renderTask = page.render(context);
        renderTask.promise.then(function () {
          renderTask = null;
          post({ type: 'pageChange', page: pageNum, numPages: pdfDoc.numPages });
          if (pendingRender !== null) {
            var next = pendingRender;
            pendingRender = null;
            window.renderPage(next);
          }
        }).catch(function (err) {
          renderTask = null;
          if (err && err.name === 'RenderingCancelledException') return;
          post({ type: 'error', message: (err && err.message) || 'Unable to render this page.' });
        });
      }).catch(function (err) {
        post({ type: 'error', message: (err && err.message) || 'Unable to render this page.' });
      });
    };

    /** Re-rasterises the current page after a resize or a fit-mode change. */
    window.__refit = function () {
      currentZoom = 1.0;
      panX = 0;
      panY = 0;
      container.style.transform = 'scale(1)';
      if (pdfDoc) window.renderPage(pageNum);
    };

    window.__setLayout = function (next) {
      var changed =
        next.w !== layout.w || next.h !== layout.h || next.top !== layout.top ||
        next.bottom !== layout.bottom || next.fit !== layout.fit;
      layout = next;
      if (changed) window.__refit();
    };

    /** Background page-by-page search; hard cap so a huge PDF cannot hang the page. */
    window.__search = function (query) {
      if (!pdfDoc) return;
      var token = ++searchToken;
      var needle = query.toLowerCase();
      var results = [];
      var MAX_RESULTS = 500;
      var page = 1;

      function scanBatch() {
        if (token !== searchToken || results.length >= MAX_RESULTS) return;
        var budget = 5;
        function next() {
          if (token !== searchToken || results.length >= MAX_RESULTS || page > pdfDoc.numPages) {
            post({ type: 'searchResults', results: results });
            return;
          }
          var current = page++;
          pdfDoc.getPage(current).then(function (pdfPage) {
            return pdfPage.getTextContent();
          }).then(function (text) {
            if (token !== searchToken) return;
            var content = '';
            for (var i = 0; i < text.items.length; i++) content += text.items[i].str + ' ';
            var lower = content.toLowerCase();
            var from = 0;
            while (results.length < MAX_RESULTS) {
              var at = lower.indexOf(needle, from);
              if (at === -1) break;
              results.push({
                cfi: 'page:' + current,
                chapter: 'Page ' + current,
                text: content.substr(Math.max(0, at - 40), needle.length + 80).trim(),
              });
              from = at + needle.length;
            }
            if (--budget > 0) next();
            else setTimeout(next, 0);
          }).catch(function () {
            if (--budget > 0) next();
            else setTimeout(next, 0);
          });
        }
        next();
      }

      post({ type: 'searchResults', results: [] });
      setTimeout(scanBatch, 0);
    };

    /* Touch: pan while zoomed, pinch to re-render sharp, tap to turn. */
    var touchStartX = 0, touchStartY = 0, touchStartTime = 0;
    var startPanX = 0, startPanY = 0;
    var initialPinchDistance = 0, initialZoom = 1.0;
    var pinchActive = false;

    function applyTransform() {
      container.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + currentZoom + ')';
    }

    document.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistance = Math.hypot(dx, dy);
        initialZoom = currentZoom;
        pinchActive = true;
      } else if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        startPanX = panX;
        startPanY = panY;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && initialPinchDistance > 10) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        var dist = Math.hypot(dx, dy);
        currentZoom = Math.max(1.0, Math.min(4.0, initialZoom * (dist / initialPinchDistance)));
        applyTransform();
      } else if (e.touches.length === 1 && currentZoom > 1.01) {
        panX = startPanX + (e.touches[0].clientX - touchStartX);
        panY = startPanY + (e.touches[0].clientY - touchStartY);
        applyTransform();
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (pinchActive) {
        pinchActive = false;
        initialPinchDistance = 0;
        // A CSS transform scales the already-rasterised canvas, so it goes blurry
        // after a pinch: bake the zoom into the render instead and reset the CSS.
        var zoomToBake = currentZoom;
        currentZoom = 1.0;
        panX = 0;
        panY = 0;
        applyTransform();
        if (pdfDoc && zoomToBake > 1.01) {
          currentZoom = Math.min(4.0, zoomToBake);
          window.renderPage(pageNum);
          currentZoom = 1.0;
          applyTransform();
        }
        return;
      }
      if (e.changedTouches.length !== 1) return;
      var deltaX = e.changedTouches[0].clientX - touchStartX;
      var deltaY = e.changedTouches[0].clientY - touchStartY;
      var elapsed = Date.now() - touchStartTime;
      if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && elapsed < 350) {
        post({ type: 'tap', xRatio: e.changedTouches[0].clientX / (window.innerWidth || 360), zoomed: currentZoom > 1.05 });
      }
    }, { passive: true });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (pdfDoc) window.renderPage(pageNum);
      }, 180);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { if (pdfDoc) window.renderPage(pageNum); }, 250);
    });

    // The host is told the page exists before any bytes arrive.
    post({ type: 'ready' });
  `,
    [palette.bg]
  );

  if (renderError) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg, padding: 32 }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to Render PDF</Text>
        <Text style={[styles.errorMessage, { color: palette.muted }]}>{renderError}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { borderColor: palette.border }]}
          onPress={handleRetry}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryText, { color: palette.link }]}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        key={`pdf-${book.id}-${attempt}-${recovery.reloadKey}`}
        ref={webViewRef}
        {...READER_WEBVIEW_PROPS}
        {...recovery.recoveryProps}
        source={{ html: pdfViewerHtml }}
        style={{ backgroundColor: palette.bg }}
        onMessage={handleMessage}
        onLoadEnd={() => {
          pushLayout();
        }}
        scrollEnabled={true}
        scalesPageToFit={false}
      />

      {isLoading && (
        <View style={[styles.loadingOverlay, { backgroundColor: palette.bg }]}>
          <ActivityIndicator size="large" color={palette.link} />
          <Text style={[styles.loadingText, { color: palette.muted }]}>
            {loadProgress > 0 && loadProgress < 1
              ? `Loading document… ${Math.round(loadProgress * 100)}%`
              : 'Preparing PDF reader…'}
          </Text>
        </View>
      )}

      {passwordPrompt && (
        <View style={[styles.passwordOverlay, { backgroundColor: palette.bg }]}>
          <Text style={[styles.errorTitle, { color: palette.text }]}>Password required</Text>
          <Text style={[styles.errorMessage, { color: palette.muted }]}>
            This PDF is encrypted. Enter its password to open it.
          </Text>
          <TextInput
            value={passwordDraft}
            onChangeText={setPasswordDraft}
            placeholder="PDF password"
            placeholderTextColor={palette.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.passwordInput, { color: palette.text, borderColor: palette.border }]}
          />
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: palette.border }]}
            onPress={() => providePassword(passwordDraft)}
          >
            <Text style={[styles.retryText, { color: palette.link }]}>Open</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Floating page indicator and fit mode */}
      <View style={[styles.floatingBar, { bottom: Math.max(insets.bottom, 16) + 12 }]}>
        <Text style={styles.floatingPageText}>
          {currentPage} / {Math.max(1, totalPages)}
          {searchCount > 0 ? `  ·  ${searchCount} match${searchCount === 1 ? '' : 'es'}` : ''}
        </Text>
        <TouchableOpacity
          onPress={() => setFitModeForBook(fitMode === 'width' ? 'page' : 'width')}
          activeOpacity={0.7}
          style={styles.fitButton}
        >
          <Text style={styles.fitButtonText}>{fitMode === 'width' ? 'Fit page' : 'Fit width'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  errorMessage: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryText: { fontSize: 14, fontWeight: '600' },
  passwordOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  passwordRow: { flexDirection: 'row', gap: 12 },
  passwordInput: {
    marginTop: 16,
    width: 260,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
  },
  floatingBar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 14,
  },
  floatingPageText: { color: '#EEEEEE', fontSize: 12, fontWeight: '600' },
  fitButton: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  fitButtonText: { color: '#EEEEEE', fontSize: 11.5, fontWeight: '600' },
});
