/**
 * Lirune Reader Mobile — XPS & OXPS Reader View Component
 * Supports XPS and OXPS fixed-layout documents.
 * Renders pages with theme styling and page navigation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '@/services/storage/FileStorage';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { XpsParser, ParsedXps } from '@/services/xps/XpsParser';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'XpsReaderView';

interface XpsReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function XpsReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: XpsReaderViewProps) {
  const [parsedXps, setParsedXps] = useState<ParsedXps | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadXps() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = toFileUri(book.filePath || book.uri || '');
        const base64 = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const result: ParsedXps = await XpsParser.parse(base64);

        if (!active) return;
        setParsedXps(result);
        setIsLoading(false);
        onProgressChange(100, 'page:1', `${result.title} (${result.pageCount} pages)`);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse XPS document', err);
        if (active) {
          setError(err?.message || 'Could not parse XPS document.');
          setIsLoading(false);
        }
      }
    }

    loadXps();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.originalName, book.title, onProgressChange]);

  const cssFont = getCssFontFamily(settings.fontFamily);
  const injectedHtml = parsedXps
    ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <style>
    body {
      background-color: ${palette.bg};
      color: ${palette.text};
      font-family: ${cssFont};
      margin: 0;
      padding: 16px;
    }
    .lirune-xps-title {
      font-size: 1.3em;
      margin-bottom: 20px;
      color: ${palette.text};
    }
    .lirune-xps-page {
      background-color: ${palette.surface || palette.bg};
      border: 1px solid ${palette.border};
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      position: relative;
      min-height: 200px;
    }
    .lirune-page-number {
      position: absolute;
      top: 12px;
      right: 16px;
      font-size: 0.85em;
      opacity: 0.6;
      font-weight: bold;
    }
    .lirune-page-content {
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineHeight};
      color: ${palette.text};
      margin-top: 20px;
    }
  </style>
</head>
<body onclick="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }))">
  ${parsedXps.html}
</body>
</html>`
    : '';

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorText, { color: palette.text }]}>{error}</Text>
      </View>
    );
  }

  if (isLoading || !parsedXps) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        ref={webViewRef}
        source={{ html: injectedHtml }}
        {...READER_WEBVIEW_PROPS}
        onShouldStartLoadWithRequest={allowReaderNavigation}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'tap') onToggleControls();
          } catch {
            // ignore
          }
        }}
        style={{ backgroundColor: palette.bg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
