/**
 * Lirune Reader Mobile — MOBI / AZW / AZW3 Reader View Component
 * Renders decoded MOBI HTML through WebView with theme synchronization,
 * search, TOC, and pagination/scroll support.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { MobiParser } from '@/services/mobi/MobiParser';
import { SELECTION_WATCHER_JS, SelectionPayload } from '@/services/reader/selectionBridge';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';
import { sanitizeHtml } from '@/services/security/sanitizeHtml';

const TAG = 'MobiReaderView';

interface MobiReaderViewProps {
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

export function MobiReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onTOCLoaded,
  targetCfi,
  onSearchResults,
  onSelectionChange,
  searchQuery,
}: MobiReaderViewProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadMobi() {
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

        const parsed = MobiParser.parse(bytes);
        if (!active) return;

        setHtmlContent(parsed.html);
        setIsLoading(false);

        // Extract TOC headings
        if (onTOCLoaded) {
          const headings = parsed.html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi) || [];
          const toc: TOCItem[] = headings.map((h, i) => {
            const cleanText = h.replace(/<[^>]+>/g, '').trim();
            return {
              id: `sec_${i}`,
              label: cleanText || `Section ${i + 1}`,
              href: `#sec_${i}`,
              depth: 0,
            };
          });
          onTOCLoaded(toc);
        }
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse MOBI document', err);
        if (active) {
          setError(err?.message || 'Could not parse MOBI content.');
          setIsLoading(false);
        }
      }
    }

    loadMobi();
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
        } else if (data.type === 'progress') {
          onProgressChange(data.percent || 0, data.cfi, data.chapter);
        } else if (data.type === 'selection' && onSelectionChange) {
          onSelectionChange(data.payload);
        }
      } catch {
        // Ignore non-json
      }
    },
    [onToggleControls, onProgressChange, onSelectionChange]
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.statusText, { color: palette.muted }]}>Reading MOBI content...</Text>
      </View>
    );
  }

  if (error || !htmlContent) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to render MOBI</Text>
        <Text style={[styles.statusText, { color: palette.muted }]}>{error || 'Document is empty.'}</Text>
      </View>
    );
  }

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
        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 12px auto;
        }
        h1, h2, h3, h4 {
          color: ${palette.text};
          margin-top: 1.4em;
          margin-bottom: 0.6em;
        }
        p {
          margin-top: 0;
          margin-bottom: ${settings.paragraphSpacing || 1.0}em;
          text-indent: 1em;
        }
        a {
          color: ${palette.link};
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      ${sanitizeHtml(htmlContent)}
      <script>
        document.body.addEventListener('click', function(e) {
          if (e.target.tagName !== 'A') {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
          }
        });

        window.addEventListener('scroll', function() {
          var total = document.documentElement.scrollHeight - window.innerHeight;
          var percent = total > 0 ? Math.min(100, Math.round((window.scrollY / total) * 100)) : 0;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'progress',
            percent: percent,
            cfi: 'scroll:' + window.scrollY
          }));
        }, { passive: true });

        ${SELECTION_WATCHER_JS}
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        ref={webViewRef}
        {...READER_WEBVIEW_PROPS}
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
