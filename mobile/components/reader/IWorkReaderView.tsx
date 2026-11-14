/**
 * Lirune Reader Mobile — Apple iWork Reader View Component
 * Supports Apple Pages (.pages), Numbers (.numbers), and Keynote (.key).
 * Renders embedded QuickLook preview images or document structure.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '@/services/storage/FileStorage';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { IWorkParser, ParsedIWork } from '@/services/iwork/IWorkParser';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'IWorkReaderView';

interface IWorkReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function IWorkReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: IWorkReaderViewProps) {
  const [parsedDoc, setParsedDoc] = useState<ParsedIWork | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadIWork() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = toFileUri(book.filePath || book.uri || '');
        const filename = book.originalName || book.title || filePath;
        const base64 = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const result: ParsedIWork = await IWorkParser.parse(base64, filename);

        if (!active) return;
        setParsedDoc(result);
        setIsLoading(false);
        onProgressChange(100, 'page:1', result.title);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse iWork document', err);
        if (active) {
          setError(err?.message || 'Could not parse Apple iWork document.');
          setIsLoading(false);
        }
      }
    }

    loadIWork();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.originalName, book.title, onProgressChange]);

  const cssFont = getCssFontFamily(settings.fontFamily);
  const injectedHtml = parsedDoc
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
      text-align: center;
    }
    .lirune-iwork-title {
      font-size: 1.3em;
      margin-bottom: 8px;
      color: ${palette.text};
    }
    .lirune-iwork-badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(128, 128, 128, 0.15);
      border-radius: 12px;
      font-size: 0.85em;
      margin-bottom: 20px;
    }
    .lirune-iwork-preview img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }
    .lirune-iwork-notice {
      padding: 32px 16px;
      color: ${palette.text};
      opacity: 0.8;
    }
  </style>
</head>
<body onclick="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }))">
  ${parsedDoc.html}
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

  if (isLoading || !parsedDoc) {
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
