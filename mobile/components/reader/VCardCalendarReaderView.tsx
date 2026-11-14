/**
 * Lirune Reader Mobile — vCard & iCalendar Reader View Component
 * Supports VCF (Contacts) and ICS (Calendar Events).
 * Renders structured cards with icons, fields, and theme support.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '@/services/storage/FileStorage';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { VCardCalendarParser, ParsedContactOrCalendar } from '@/services/contacts/VCardCalendarParser';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'VCardCalendarReaderView';

interface VCardCalendarReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function VCardCalendarReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: VCardCalendarReaderViewProps) {
  const [parsedData, setParsedData] = useState<ParsedContactOrCalendar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = toFileUri(book.filePath || book.uri || '');
        const ext = (book.originalName || book.title || filePath).split('.').pop()?.toLowerCase() || '';

        const content = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        let result: ParsedContactOrCalendar;
        if (ext === 'ics') {
          result = VCardCalendarParser.parseIcs(content, book.title);
        } else {
          // vcf
          result = VCardCalendarParser.parseVcf(content, book.title);
        }

        if (!active) return;
        setParsedData(result);
        setIsLoading(false);
        onProgressChange(100, 'item:1', `${result.title} (${result.itemCount} items)`);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse contact or calendar file', err);
        if (active) {
          setError(err?.message || 'Could not parse contact or calendar file.');
          setIsLoading(false);
        }
      }
    }

    loadData();
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
      line-height: ${settings.lineHeight};
      margin: 0;
      padding: 16px;
    }
    .lirune-section-title {
      font-size: 1.3em;
      margin-bottom: 20px;
      color: ${palette.text};
    }
    .lirune-contact-card, .lirune-event-card {
      background-color: ${palette.surface || palette.bg};
      border: 1px solid ${palette.border};
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    }
    .lirune-contact-name, .lirune-event-title {
      font-size: 1.15em;
      margin-top: 0;
      margin-bottom: 8px;
      color: ${palette.link || palette.text};
    }
    .lirune-contact-org, .lirune-event-time, .lirune-event-location {
      font-size: 0.9em;
      opacity: 0.8;
      margin-bottom: 8px;
    }
    .lirune-contact-field {
      margin-bottom: 6px;
      font-size: 0.95em;
    }
    .lirune-event-desc pre {
      white-space: pre-wrap;
      font-family: inherit;
      font-size: 0.9em;
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
