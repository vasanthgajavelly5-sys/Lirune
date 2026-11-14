/**
 * Lirune Reader Mobile — Email & Web Archive Reader View Component
 * Supports EML, MHT, MHTML, MSG, and MBOX.
 * Renders headers, sanitized message body, and attachment badges.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '@/services/storage/FileStorage';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { EmailParser, ParsedEmailArchive } from '@/services/email/EmailParser';
import { PstParser } from '@/services/email/PstParser';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';

const TAG = 'EmailReaderView';

interface EmailReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function EmailReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: EmailReaderViewProps) {
  const [parsedArchive, setParsedArchive] = useState<ParsedEmailArchive | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadEmail() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = toFileUri(book.filePath || book.uri || '');
        const ext = (book.originalName || book.title || filePath).split('.').pop()?.toLowerCase() || '';

        let result: ParsedEmailArchive;
        if (ext === 'pst' || ext === 'ost') {
          const base64 = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const binStr = atob(base64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          result = PstParser.parse(bytes);
        } else if (ext === 'mbox') {
          const content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          result = EmailParser.parseMbox(new TextEncoder().encode(content));
        } else if (ext === 'msg') {
          const base64 = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const binStr = atob(base64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          result = EmailParser.parseMsg(bytes);
        } else if (ext === 'mht' || ext === 'mhtml') {
          const content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          result = EmailParser.parseMhtml(new TextEncoder().encode(content));
        } else {
          // EML
          const content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          result = EmailParser.parseEml(new TextEncoder().encode(content));
        }

        if (!active) return;
        setParsedArchive(result);
        setIsLoading(false);
        onProgressChange(100, 'msg:1', result.title);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse email message', err);
        if (active) {
          setError(err?.message || 'Could not parse email message.');
          setIsLoading(false);
        }
      }
    }

    loadEmail();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.originalName, book.title, onProgressChange]);

  const cssFont = getCssFontFamily(settings.fontFamily);
  const injectedHtml = parsedArchive
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
    .lirune-email-archive-title {
      font-size: 1.3em;
      margin-bottom: 16px;
      color: ${palette.text};
    }
    .lirune-email-message {
      margin-bottom: 24px;
    }
    .lirune-email-headers {
      background-color: ${palette.surface || palette.bg};
      border: 1px solid ${palette.border};
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 0.9em;
    }
    .lirune-email-header-row {
      margin-bottom: 4px;
    }
    .lirune-email-body {
      padding: 4px;
      color: ${palette.text};
    }
    .lirune-email-text {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
    }
    .lirune-email-attachments {
      margin-top: 16px;
      padding: 8px 12px;
      background: rgba(128, 128, 128, 0.1);
      border-radius: 4px;
      font-size: 0.85em;
    }
    .lirune-email-attachments ul {
      margin: 4px 0 0 16px;
      padding: 0;
    }
    .lirune-message-divider {
      border: 0;
      border-top: 1px solid ${palette.border};
      margin: 24px 0;
    }
  </style>
</head>
<body onclick="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }))">
  ${parsedArchive.html}
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

  if (isLoading || !parsedArchive) {
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
