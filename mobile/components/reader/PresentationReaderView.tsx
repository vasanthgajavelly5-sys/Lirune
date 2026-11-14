/**
 * Lirune Reader Mobile — Presentation Reader View Component
 * Supports PPTX, PPTM, PPS, PPSX, PPSM, POTX, POTM, and ODP.
 * Renders slides with slide numbers, next/prev slide navigation, zoom and themes.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '@/services/storage/FileStorage';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { PptxParser, ParsedPptx } from '@/services/pptx/PptxParser';
import { OdpParser, ParsedOdp } from '@/services/odp/OdpParser';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'PresentationReaderView';

interface PresentationReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function PresentationReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: PresentationReaderViewProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadPresentation() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = toFileUri(book.filePath || book.uri || '');
        const ext = (book.originalName || book.title || filePath).split('.').pop()?.toLowerCase() || '';

        const base64 = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        let renderedHtml = '';
        let count = 0;

        if (ext === 'odp') {
          const parsed: ParsedOdp = await OdpParser.parse(base64);
          renderedHtml = parsed.html;
          count = parsed.metadata.slideCount;
        } else {
          // PPTX, PPTM, PPS, PPSX, PPSM, POTX, POTM
          const parsed: ParsedPptx = await PptxParser.parse(base64);
          renderedHtml = parsed.html;
          count = parsed.metadata.slideCount;
        }

        if (!active) return;
        setHtmlContent(renderedHtml);
        setSlideCount(count);
        setIsLoading(false);
        onProgressChange(100, 'slide:1', `Presentation (${count} slides)`);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse presentation', err);
        if (active) {
          setError(err?.message || 'Could not parse presentation file.');
          setIsLoading(false);
        }
      }
    }

    loadPresentation();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.originalName, book.title, onProgressChange]);

  const cssFont = getCssFontFamily(settings.fontFamily);
  const injectedHtml = htmlContent
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
    .lirune-slide {
      background-color: ${palette.surface || palette.bg};
      border: 1px solid ${palette.border};
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      position: relative;
    }
    .lirune-slide-number {
      position: absolute;
      top: 12px;
      right: 16px;
      font-size: 0.85em;
      opacity: 0.6;
      font-weight: bold;
    }
    .lirune-slide-title, .lirune-slide-heading {
      font-size: ${settings.fontSize * 1.3}px;
      color: ${palette.text};
      margin-top: 0;
      margin-bottom: 16px;
      line-height: 1.3;
    }
    .lirune-slide-text {
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineHeight};
      color: ${palette.text};
      margin-bottom: 12px;
    }
    .lirune-slide-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin-top: 12px;
      margin-bottom: 12px;
    }
  </style>
</head>
<body onclick="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }))">
  ${htmlContent}
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

  if (isLoading || !htmlContent) {
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
