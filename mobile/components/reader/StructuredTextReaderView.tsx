/**
 * Lirune Reader Mobile — Structured Text Reader View Component
 * Supports XML, JSON, YAML/YML, and LOG.
 * Renders syntax-highlighted code lines with line numbers and theme support.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '@/services/storage/FileStorage';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { StructuredTextParser, ParsedStructuredText } from '@/services/structured/StructuredTextParser';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'StructuredTextReaderView';

interface StructuredTextReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function StructuredTextReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: StructuredTextReaderViewProps) {
  const [parsedText, setParsedText] = useState<ParsedStructuredText | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadStructuredText() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = toFileUri(book.filePath || book.uri || '');
        const ext = (book.originalName || book.title || filePath).split('.').pop()?.toLowerCase() || '';

        const content = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        let result: ParsedStructuredText;
        if (ext === 'json') {
          result = StructuredTextParser.parseJson(content, book.title);
        } else if (ext === 'yaml' || ext === 'yml') {
          result = StructuredTextParser.parseYaml(content, book.title);
        } else if (ext === 'log') {
          result = StructuredTextParser.parseLog(content, book.title);
        } else {
          // xml
          result = StructuredTextParser.parseXml(content, book.title);
        }

        if (!active) return;
        setParsedText(result);
        setIsLoading(false);
        onProgressChange(100, 'line:1', `${result.title} (${result.lineCount} lines)`);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse structured text', err);
        if (active) {
          setError(err?.message || 'Could not parse structured text.');
          setIsLoading(false);
        }
      }
    }

    loadStructuredText();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.originalName, book.title, onProgressChange]);

  const cssFont = getCssFontFamily(settings.fontFamily);
  const injectedHtml = parsedText
    ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <style>
    body {
      background-color: ${palette.bg};
      color: ${palette.text};
      font-family: monospace;
      font-size: ${Math.max(12, settings.fontSize * 0.9)}px;
      line-height: 1.5;
      margin: 0;
      padding: 16px;
      overflow-x: auto;
    }
    .lirune-code-view {
      display: table;
      width: 100%;
    }
    .code-line {
      display: table-row;
    }
    .code-line:hover {
      background-color: rgba(128, 128, 128, 0.1);
    }
    .line-no {
      display: table-cell;
      user-select: none;
      padding-right: 16px;
      text-align: right;
      color: ${palette.border};
      width: 40px;
    }
    .line-content {
      display: table-cell;
      white-space: pre;
      word-break: normal;
    }
    .xml-tag { color: ${palette.link}; font-weight: bold; }
    .xml-attr { color: ${palette.link}; }
    .xml-val { color: ${palette.text}; }
    .json-key { color: ${palette.link}; font-weight: bold; }
    .json-str { color: ${palette.text}; }
    .json-num { color: ${palette.link}; }
    .json-bool { color: ${palette.link}; }
    .yaml-key { color: ${palette.link}; font-weight: bold; }
    .yaml-comment { color: ${palette.muted}; font-style: italic; }
    .log-error { background-color: ${palette.muted}; color: ${palette.link}; }
    .log-warn { background-color: rgba(242, 201, 76, 0.15); }
    .log-info { color: ${palette.link}; }
    .log-debug { color: ${palette.muted}; }
  </style>
</head>
<body onclick="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }))">
  ${parsedText.html}
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

  if (isLoading || !parsedText) {
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
