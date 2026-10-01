/**
 * Lirune Reader Mobile — Offline PDF Reader
 * Renders local PDF documents with page navigation, zoom, and progress tracking.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { PDFJS_SOURCE, PDFJS_WORKER } from '@/services/pdf/pdfjsAssets';
import { escapeForInlineScript } from '@/services/pdf/escapeForTemplateLiteral';
import { READER_WEBVIEW_PROPS } from '@/services/security/webviewPolicy';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'PdfReaderView';

// pdf.js is vendored into the bundle (see scripts/gen-pdfjs.js) and escaped once
// at module load, so opening a PDF requires no network access at all.
const PDFJS_INLINE = escapeForInlineScript(PDFJS_SOURCE);
const PDFJS_WORKER_INLINE = escapeForInlineScript(PDFJS_WORKER);

interface PdfReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  onTotalPagesLoaded?: (pages: number) => void;
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
  targetCfi,
}: PdfReaderViewProps) {
  const insets = useSafeAreaInsets();
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  /** Page to jump to once pdf.js has reported the document is ready. */
  const pendingPageRef = useRef<number | null>(null);
  const currentPageRef = useRef<number>(1);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  // Load PDF base64
  useEffect(() => {
    let active = true;
    const bookPath = book.filePath || book.uri || '';
    async function loadPdf() {
      try {
        const b64 = await fileStorage.readAsBase64(bookPath);
        if (!b64) {
          throw new Error('PDF file could not be read or is empty.');
        }
        if (active) {
          setPdfBase64(b64);
          setIsLoading(false);
        }
      } catch (err: any) {
        logger.error(TAG, `Error loading PDF: ${bookPath}`, err);
        if (active) {
          setRenderError(err?.message || 'Failed to load PDF file.');
          setIsLoading(false);
        }
      }
    }
    loadPdf();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri]);

  const goToPage = useCallback((page: number) => {
    webViewRef.current?.injectJavaScript(`
      if (window.renderPage) window.renderPage(${page});
      true;
    `);
  }, []);

  // Queue a jump to the target page. If pdf.js is not ready yet the page is
  // applied as soon as the document reports itself loaded.
  useEffect(() => {
    if (!targetCfi || (!targetCfi.startsWith('page:') && !targetCfi.startsWith('page_'))) return;
    const p = parseInt(targetCfi.replace(/^page[:_]/, ''), 10);
    if (isNaN(p) || p < 1) return;
    if (totalPages > 0) {
      goToPage(p);
    } else {
      pendingPageRef.current = p;
    }
  }, [targetCfi, totalPages, goToPage]);

  // Self-contained PDF viewer HTML with in-thread pdf.js.
  const pdfViewerHtml = useMemo(
    () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=0.75, maximum-scale=4.0, user-scalable=yes">
      <script>
        window.onerror = function(msg, url, line, col, err) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: String(msg) + ' (' + line + ':' + col + ')'
            }));
          } catch(e) {}
        };
      </script>
      <script>${PDFJS_INLINE}</script>
      <script>${PDFJS_WORKER_INLINE}</script>
      <style>
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body {
          margin: 0;
          padding: 0;
          background-color: ${palette.bg};
          min-height: 100vh;
          overflow-x: auto;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          touch-action: pan-x pan-y pinch-zoom;
        }
        #canvas-container {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          min-height: 100vh;
          padding: ${Math.max(insets.top, 16)}px 8px ${Math.max(insets.bottom, 24) + 48}px 8px;
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
      <div id="canvas-container">
        <canvas id="pdf-canvas"></canvas>
      </div>

      <script>
        // Wire in-thread worker handler from preloaded pdf.worker bundle
        if (window.pdfjsWorker && window.pdfjsWorker.WorkerMessageHandler) {
          try {
            pdfjsLib.PDFWorker._mainThreadWorkerMessageHandler = window.pdfjsWorker.WorkerMessageHandler;
          } catch(e) {}
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';

        var pdfDoc = null;
        var pageNum = 1;
        var canvas = document.getElementById('pdf-canvas');
        var container = document.getElementById('canvas-container');
        var ctx = canvas.getContext('2d');
        var renderTask = null;
        var currentZoom = 1.0;
        var initialPinchDistance = 0;
        var initialZoom = 1.0;

        var rawData = atob("${pdfBase64 || ''}");
        var uint8 = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) {
          uint8[i] = rawData.charCodeAt(i);
        }

        pdfjsLib.getDocument({
          data: uint8,
          isEvalSupported: false,
          disableAutoFetch: true,
          disableStream: true
        }).promise.then(function(doc) {
          pdfDoc = doc;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'meta',
            numPages: doc.numPages
          }));
          if (window.__pendingPage) {
            var p = window.__pendingPage;
            window.__pendingPage = null;
            renderPage(p);
          } else {
            renderPage(1);
          }
        }).catch(function(err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: err.message || 'Unable to open PDF document.'
          }));
        });

        window.renderPage = function(num) {
          if (!pdfDoc) {
            window.__pendingPage = num;
            return;
          }
          if (renderTask) {
            try { renderTask.cancel(); } catch(e) {}
            renderTask = null;
          }
          pageNum = Math.max(1, Math.min(pdfDoc.numPages, num));
          pdfDoc.getPage(pageNum).then(function(page) {
            var availW = Math.max((window.innerWidth || 360) - 16, 260);
            var availH = Math.max((window.innerHeight || 640) - (${insets.top + insets.bottom + 64}), 360);
            var unscaledViewport = page.getViewport({ scale: 1.0 });

            // Fit page cleanly: match width while ensuring high-fidelity aspect preservation
            var scaleX = availW / unscaledViewport.width;
            var scaleY = availH / unscaledViewport.height;
            var targetScale = Math.min(scaleX, Math.max(scaleX * 0.85, scaleY));
            if (!Number.isFinite(targetScale) || targetScale <= 0) targetScale = 1.0;

            var dpr = Math.max(window.devicePixelRatio || 1, 2.0);
            var displayViewport = page.getViewport({ scale: targetScale });
            var renderViewport = page.getViewport({ scale: targetScale * dpr });

            canvas.width = Math.round(renderViewport.width);
            canvas.height = Math.round(renderViewport.height);
            canvas.style.width = Math.round(displayViewport.width) + 'px';
            canvas.style.height = Math.round(displayViewport.height) + 'px';

            var renderContext = {
              canvasContext: ctx,
              viewport: renderViewport
            };
            renderTask = page.render(renderContext);
            renderTask.promise.then(function() {
              renderTask = null;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageChange',
                page: pageNum,
                numPages: pdfDoc.numPages
              }));
            }).catch(function(rErr) {
              if (rErr && rErr.name === 'RenderingCancelledException') return;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: rErr.message
              }));
            });
          }).catch(function(err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: err.message
            }));
          });
        };

        // Touch handling: Tap turns and Pinch Zoom
        var touchStartX = 0;
        var touchStartY = 0;
        var touchStartTime = 0;

        document.addEventListener('touchstart', function(e) {
          if (e.touches.length === 2) {
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            initialPinchDistance = Math.hypot(dx, dy);
            initialZoom = currentZoom;
          } else if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
          }
        }, { passive: true });

        document.addEventListener('touchmove', function(e) {
          if (e.touches.length === 2 && initialPinchDistance > 10) {
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            var dist = Math.hypot(dx, dy);
            var scale = dist / initialPinchDistance;
            currentZoom = Math.max(1.0, Math.min(3.0, initialZoom * scale));
            container.style.transform = 'scale(' + currentZoom + ')';
          }
        }, { passive: true });

        document.addEventListener('touchend', function(e) {
          if (e.changedTouches.length === 1 && initialPinchDistance === 0) {
            var deltaX = e.changedTouches[0].clientX - touchStartX;
            var deltaY = e.changedTouches[0].clientY - touchStartY;
            var elapsed = Date.now() - touchStartTime;

            if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && elapsed < 350) {
              var x = e.changedTouches[0].clientX;
              var width = window.innerWidth;
              var ratio = x / width;
              if (ratio < 0.25) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap', xRatio: 0.1 }));
              } else if (ratio > 0.75) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap', xRatio: 0.9 }));
              } else {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap', xRatio: 0.5 }));
              }
            }
          }
          if (e.touches.length < 2) {
            initialPinchDistance = 0;
          }
        }, { passive: true });
      </script>
    </body>
    </html>
  `,
    [pdfBase64, palette.bg]
  );

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'meta') {
          setTotalPages(data.numPages);
          if (data.numPages && data.numPages > 0) {
            onTotalPagesLoaded?.(data.numPages);
          }
          const pending = pendingPageRef.current;
          if (pending != null) {
            pendingPageRef.current = null;
            goToPage(pending);
          }
        } else if (data.type === 'pageChange') {
          setCurrentPage(data.page);
          currentPageRef.current = data.page;
          const percent = Math.round((data.page / data.numPages) * 100);
          onProgressChange(
            percent,
            `page:${data.page}`,
            `Page ${data.page} of ${data.numPages}`
          );
        } else if (data.type === 'error') {
          logger.error(TAG, `pdf.js reported: ${data.message}`);
          setRenderError(data.message);
        } else if (data.type === 'tap') {
          const ratio = data.xRatio;
          if (ratio < 0.25) {
            goToPage(currentPageRef.current - 1);
          } else if (ratio > 0.75) {
            goToPage(currentPageRef.current + 1);
          } else {
            onToggleControls();
          }
        }
      } catch {
        // ignore
      }
    },
    [goToPage, onProgressChange, onToggleControls]
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.loadingText, { color: palette.muted }]}>
          Loading PDF document...
        </Text>
      </View>
    );
  }

  if (renderError) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg, padding: 32 }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to Render PDF</Text>
        <Text style={[styles.errorMessage, { color: palette.muted }]}>{renderError}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        ref={webViewRef}
        {...READER_WEBVIEW_PROPS}
        source={{ html: pdfViewerHtml }}
        style={{ backgroundColor: palette.bg }}
        onMessage={handleMessage}
        scrollEnabled={true}
        scalesPageToFit={true}
      />

      {/* Floating page indicator */}
      <View style={[styles.floatingPagePill, { bottom: Math.max(insets.bottom, 16) + 12 }]}>
        <Text style={styles.floatingPageText}>
          {currentPage} / {Math.max(1, totalPages)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  floatingPagePill: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
  },
  floatingPageText: {
    color: '#EEEEEE',
    fontSize: 12,
    fontWeight: '600',
  },
});
