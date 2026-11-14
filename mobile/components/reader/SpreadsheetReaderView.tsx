/**
 * Lirune Reader Mobile — Spreadsheet Reader View Component
 * Supports CSV, TSV, XLSX, XLS, ODS, XLSM, XLSB, XLTX, XLTM.
 * Renders structured table with sheet tabs, theme support, and text search.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '@/services/storage/FileStorage';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { SpreadsheetParser, ParsedSpreadsheet } from '@/services/spreadsheet/SpreadsheetParser';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'SpreadsheetReaderView';

interface SpreadsheetReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function SpreadsheetReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: SpreadsheetReaderViewProps) {
  const [parsedData, setParsedData] = useState<ParsedSpreadsheet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadSpreadsheet() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = toFileUri(book.filePath || book.uri || '');
        const ext = (book.originalName || book.title || filePath).split('.').pop()?.toLowerCase() || '';

        let result: ParsedSpreadsheet;
        if (ext === 'xlsb') {
          const base64 = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const binStr = atob(base64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          result = await SpreadsheetParser.parseXlsb(bytes);
        } else if (ext === 'ods') {
          const base64 = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          result = await SpreadsheetParser.parseOds(base64);
        } else if (ext === 'csv' || ext === 'tsv') {
          const content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          const bytes = new TextEncoder().encode(content);
          result = SpreadsheetParser.parseCsv(bytes, ext === 'tsv' ? '\t' : undefined);
        } else if (ext === 'xls') {
          const base64 = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const binStr = atob(base64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          result = SpreadsheetParser.parseXls(bytes);
        } else {
          // XLSX, XLSM, XLTX, XLTM
          const base64 = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          result = await SpreadsheetParser.parseXlsx(base64);
        }

        if (!active) return;
        setParsedData(result);
        setIsLoading(false);
        onProgressChange(100, 'sheet:1', result.title);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse spreadsheet', err);
        if (active) {
          setError(err?.message || 'Could not parse spreadsheet.');
          setIsLoading(false);
        }
      }
    }

    loadSpreadsheet();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.originalName, book.title, onProgressChange]);

  const cssFont = getCssFontFamily(settings.fontFamily);
  const injectedHtml = parsedData
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
      font-size: ${settings.fontSize}px;
      margin: 0;
      padding: 16px;
      overflow-x: auto;
    }
    .lirune-spreadsheet-title {
      font-size: 1.4em;
      margin-bottom: 12px;
      color: ${palette.text};
    }
    .lirune-sheet-name {
      font-size: 1.1em;
      margin-top: 24px;
      margin-bottom: 8px;
      color: ${palette.link};
    }
    .lirune-table-wrapper {
      overflow-x: auto;
      max-width: 100%;
      border: 1px solid ${palette.border};
      border-radius: 6px;
    }
    .lirune-table {
      border-collapse: collapse;
      width: 100%;
      min-width: 400px;
    }
    .lirune-table th {
      background-color: ${palette.surface || palette.bg};
      color: ${palette.text};
      font-weight: bold;
      border: 1px solid ${palette.border};
      padding: 8px 12px;
      text-align: left;
    }
    .lirune-table td {
      border: 1px solid ${palette.border};
      padding: 6px 12px;
      color: ${palette.text};
    }
    .lirune-table tr:nth-child(even) {
      background-color: rgba(128, 128, 128, 0.05);
    }
  </style>
</head>
<body onclick="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }))">
  ${parsedData.html}
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

  if (isLoading || !parsedData) {
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
