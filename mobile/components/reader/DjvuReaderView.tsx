/**
 * Lirune Reader Mobile — DjVu Reader View Component
 * Renders DjVu pages and text layers in paginated reader.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { DjvuParser, DjvuPage } from '@/services/djvu/DjvuParser';
import { SELECTION_WATCHER_JS, SelectionPayload } from '@/services/reader/selectionBridge';
import { allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'DjvuReaderView';

interface DjvuReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  onTOCLoaded?: (toc: TOCItem[]) => void;
  targetCfi?: string;
  onSearchResults?: (results: SearchResult[]) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
  searchQuery?: string;
}

export function DjvuReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onTOCLoaded,
  targetCfi,
  onSearchResults,
  onSelectionChange,
  searchQuery,
}: DjvuReaderViewProps) {
  const [pages, setPages] = useState<DjvuPage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadDjvu() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = book.filePath || book.uri || '';
        const base64 = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const parsed = DjvuParser.parse(bytes);
        if (!active) return;

        setPages(parsed.pages);
        setIsLoading(false);

        if (onTOCLoaded) {
          const toc: TOCItem[] = parsed.pages.map((p, i) => ({
            id: `p_${i}`,
            label: `Page ${i + 1}`,
            href: `page:${i + 1}`,
            depth: 0,
          }));
          onTOCLoaded(toc);
        }
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse DjVu file', err);
        if (active) {
          setError(err?.message || 'Could not parse DjVu document.');
          setIsLoading(false);
        }
      }
    }

    loadDjvu();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, onTOCLoaded]);

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data);
        if (data.type === 'toggleControls') {
          onToggleControls();
        } else if (data.type === 'pageTurn') {
          const p = data.page;
          setCurrentPage(p);
          const percent = pages.length > 0 ? Math.round(((p + 1) / pages.length) * 100) : 0;
          onProgressChange(percent, `page:${p + 1}`, `Page ${p + 1} of ${pages.length}`);
        } else if (data.type === 'selection' && onSelectionChange) {
          onSelectionChange(data.payload);
        }
      } catch {
        // Ignore non-json
      }
    },
    [onToggleControls, onProgressChange, onSelectionChange, pages.length]
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.statusText, { color: palette.muted }]}>Reading DjVu document...</Text>
      </View>
    );
  }

  if (error || pages.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to open DjVu</Text>
        <Text style={[styles.statusText, { color: palette.muted }]}>{error || 'No readable pages in document.'}</Text>
      </View>
    );
  }

  const pageHtml = pages[currentPage]?.text
    ? pages[currentPage].text.split('\n\n').map((para) => `<p>${para}</p>`).join('\n')
    : '<p>Page content empty.</p>';

  const injectedHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
      <style>
        * { box-sizing: border-box; }
        body {
          background-color: ${palette.bg};
          color: ${palette.text};
          font-family: ${settings.fontFamily || 'serif'};
          font-size: ${settings.fontSize}px;
          line-height: ${settings.lineHeight};
          padding: 24px ${settings.margin}px 60px ${settings.margin}px;
          margin: 0;
          text-align: ${settings.alignment};
          word-wrap: break-word;
        }
        p {
          margin-top: 0;
          margin-bottom: 1em;
          text-indent: 1em;
        }
        .page-badge {
          text-align: center;
          font-size: 11px;
          color: ${palette.muted};
          margin-bottom: 24px;
        }
      </style>
    </head>
    <body>
      <div class="page-badge">DjVu Page ${currentPage + 1} of ${pages.length}</div>
      ${pageHtml}
      <script>
        document.body.addEventListener('click', function(e) {
          var w = window.innerWidth;
          var x = e.clientX;
          if (x < w * 0.25) {
            var prev = ${currentPage} - 1;
            if (prev >= 0) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageTurn', page: prev }));
          } else if (x > w * 0.75) {
            var next = ${currentPage} + 1;
            if (next < ${pages.length}) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageTurn', page: next }));
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
          }
        });

        ${SELECTION_WATCHER_JS}
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: injectedHtml }}
        style={{ backgroundColor: palette.bg }}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={allowReaderNavigation}
        scrollEnabled={true}
      />
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
    padding: 24,
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
});
