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
  targetCfi?: string | null;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function PdfReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  targetCfi,
}: PdfReaderViewProps) {
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const webViewRef = useRef<WebView>(null);
  /** Page to jump to once pdf.js has reported the document is ready. */
  const pendingPageRef = useRef<number | null>(null);
  const currentPageRef = useRef<number>(1);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  // Load PDF base64
  useEffect(() => {
    let active = true;
    async function loadPdf() {
      try {
        const b64 = await fileStorage.readAsBase64(book.filePath);
        if (active) {
          setPdfBase64(b64);
          setIsLoading(false);
        }
      } catch (err) {
        logger.error(TAG, `Error loading PDF: ${book.filePath}`, err);
        if (active) setIsLoading(false);
      }
    }
    loadPdf();
    return () => {
      active = false;
    };
  }, [book.filePath]);

  const goToPage = useCallback((page: number) => {
    webViewRef.current?.injectJavaScript(`
      if (window.renderPage) window.renderPage(${page});
      true;
    `);
  }, []);

  // Queue a jump to the target page. If pdf.js is not ready yet the page is
  // applied as soon as the document reports itself loaded.
  useEffect(() => {
    if (!targetCfi || !targetCfi.startsWith('page:')) return;
    const p = parseInt(targetCfi.replace('page:', ''), 10);
    if (isNaN(p) || p < 1) return;
    if (totalPages > 0) {
      goToPage(p);
    } else {
      pendingPageRef.current = p;
    }
  }, [targetCfi, totalPages, goToPage]);

  // Self-contained PDF viewer HTML with pdf.js.
  //
  // CRITICAL: this string must be STABLE across page changes. It is memoised on
  // the document bytes alone, and the current page is deliberately NOT baked in.
  // Previously `pageNum` was interpolated from React state, so every page turn
  // produced a new `source` prop, which made react-native-webview tear down and
  // reload the whole document — re-running atob() and getDocument() on the
  // entire PDF for every single page.
  const pdfViewerHtml = useMemo(
    () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes">
      <script>${PDFJS_INLINE}</script>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          background-color: ${palette.bg};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          overflow-x: hidden;
        }
        #canvas-container {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          padding: 10px 0;
        }
        canvas {
          max-width: 98%;
          height: auto;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div id="canvas-container">
        <canvas id="pdf-canvas"></canvas>
      </div>

      <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
          new Blob(["${PDFJS_WORKER_INLINE}"], { type: 'application/javascript' })
        );

        var pdfDoc = null;
        var pageNum = 1;
        var canvas = document.getElementById('pdf-canvas');
        var ctx = canvas.getContext('2d');
        var rawData = atob("${pdfBase64 || ''}");
        var uint8 = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) {
          uint8[i] = rawData.charCodeAt(i);
        }

        pdfjsLib.getDocument({ data: uint8 }).promise.then(function(doc) {
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
            message: err.message
          }));
        });

        window.renderPage = function(num) {
          if (!pdfDoc) {
            window.__pendingPage = num;
            return;
          }
          pageNum = Math.max(1, Math.min(pdfDoc.numPages, num));
          pdfDoc.getPage(pageNum).then(function(page) {
            var viewport = page.getViewport({ scale: 1.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            var renderContext = {
              canvasContext: ctx,
              viewport: viewport
            };
            page.render(renderContext).promise.then(function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageChange',
                page: pageNum,
                numPages: pdfDoc.numPages
              }));
            });
          });
        };

        document.body.addEventListener('click', function(e) {
          var x = e.clientX;
          var width = window.innerWidth;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tap',
            xRatio: x / width
          }));
        });
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
      <View style={styles.floatingPagePill}>
        <Text style={styles.floatingPageText}>
          {currentPage} / {totalPages}
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
