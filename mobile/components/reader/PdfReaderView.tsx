/**
 * Lirune Reader Mobile — Offline PDF Reader
 * Renders local PDF documents with page navigation, zoom, and progress tracking.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'PdfReaderView';

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

  const goToPage = (page: number) => {
    webViewRef.current?.injectJavaScript(`
      if (window.renderPage) window.renderPage(${page});
      true;
    `);
  };

  // Jump to target page
  useEffect(() => {
    if (targetCfi && targetCfi.startsWith('page:')) {
      const p = parseInt(targetCfi.replace('page:', ''), 10);
      if (!isNaN(p) && p >= 1) {
        goToPage(p);
      }
    }
  }, [targetCfi]);

  // Self-contained PDF viewer HTML with pdf.js
  const pdfViewerHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
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
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        var pdfDoc = null;
        var pageNum = ${currentPage};
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
          renderPage(pageNum);
        }).catch(function(err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: err.message
          }));
        });

        window.renderPage = function(num) {
          if (!pdfDoc) return;
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
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'meta') {
        setTotalPages(data.numPages);
      } else if (data.type === 'pageChange') {
        setCurrentPage(data.page);
        const percent = Math.round((data.page / data.numPages) * 100);
        onProgressChange(percent, `page:${data.page}`, `Page ${data.page} of ${data.numPages}`);
      } else if (data.type === 'tap') {
        const ratio = data.xRatio;
        if (ratio < 0.25) {
          goToPage(currentPage - 1);
        } else if (ratio > 0.75) {
          goToPage(currentPage + 1);
        } else {
          onToggleControls();
        }
      }
    } catch {
      // ignore
    }
  };

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
        originWhitelist={['*']}
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
