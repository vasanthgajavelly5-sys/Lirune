/**
 * Lirune Reader Mobile — RTF Reader View Component
 * Renders Rich Text Format documents in reflowable reader.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { RtfParser } from '@/services/rtf/RtfParser';
import { SELECTION_WATCHER_JS, SelectionPayload } from '@/services/reader/selectionBridge';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';
import { sanitizeHtml } from '@/services/security/sanitizeHtml';

const TAG = 'RtfReaderView';

interface RtfReaderViewProps {
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

export function RtfReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  targetCfi,
  onSearchResults,
  onSelectionChange,
  searchQuery,
}: RtfReaderViewProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadRtf() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = book.filePath || book.uri || '';
        const rawText = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const parsed = RtfParser.parse(rawText);
        if (!active) return;

        setHtmlContent(parsed.html);
        setIsLoading(false);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse RTF document', err);
        if (active) {
          setError(err?.message || 'Could not parse RTF document.');
          setIsLoading(false);
        }
      }
    }

    loadRtf();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri]);

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
        <Text style={[styles.statusText, { color: palette.muted }]}>Reading RTF document...</Text>
      </View>
    );
  }

  if (error || !htmlContent) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to open RTF document</Text>
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
        p {
          margin-top: 0;
          margin-bottom: ${settings.paragraphSpacing || 1.0}em;
          text-indent: 1em;
        }
      </style>
    </head>
    <body>
      ${sanitizeHtml(htmlContent)}
      <script>
        document.body.addEventListener('click', function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
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
