/**
 * Lirune Reader Mobile — DOC (Word 97-2003) Reader View Component
 * Renders legacy Microsoft Word binary documents in reflowable reader.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { DocParser } from '@/services/doc/DocParser';
import { SELECTION_WATCHER_JS, SelectionPayload } from '@/services/reader/selectionBridge';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { logger } from '@/utils/logger';
import { sanitizeHtml } from '@/services/security/sanitizeHtml';

const TAG = 'DocReaderView';

interface DocReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  targetCfi?: string;
  onSearchResults?: (results: SearchResult[]) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
  searchQuery?: string;
}

export function DocReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  targetCfi,
  onSearchResults,
  onSelectionChange,
  searchQuery,
}: DocReaderViewProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadDoc() {
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

        const parsed = DocParser.parse(bytes);
        if (!active) return;

        setHtmlContent(parsed.html);
        setIsLoading(false);
      } catch (err: any) {
        logger.error(TAG, 'Failed to parse DOC document', err);
        if (active) {
          setError(err?.message || 'Could not parse Word document.');
          setIsLoading(false);
        }
      }
    }

    loadDoc();
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

  useEffect(() => {
    const cssFont = getCssFontFamily(settings.fontFamily);
    const cardBg = palette.surface || palette.bg;
    const cssText = `
      html, body {
        background-color: ${palette.bg} !important;
        color: ${palette.text} !important;
        font-family: ${cssFont} !important;
        font-size: ${settings.fontSize}px !important;
        line-height: ${settings.lineHeight} !important;
        text-align: ${settings.alignment} !important;
      }
      .word-viewport {
        padding-left: ${settings.margin}px !important;
        padding-right: ${settings.margin}px !important;
      }
      .word-page-card {
        background-color: ${cardBg} !important;
        color: ${palette.text} !important;
      }
      .word-page-content, p, div, span, h1, h2, h3, h4, li, blockquote {
        color: ${palette.text} !important;
      }
      p {
        margin-bottom: ${settings.paragraphSpacing || 1.0}em !important;
        text-align: ${settings.alignment} !important;
      }
      a {
        color: ${palette.link} !important;
      }
    `;
    const escaped = cssText.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\n/g, ' ');
    webViewRef.current?.injectJavaScript(`
      (function() {
        var el = document.getElementById('reader-theme-override');
        if (el) {
          el.textContent = \`${escaped}\`;
        }
      })(); true;
    `);
  }, [
    palette.bg,
    palette.surface,
    palette.text,
    palette.link,
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.paragraphSpacing,
    settings.margin,
    settings.alignment,
  ]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.statusText, { color: palette.muted }]}>Reading Word document...</Text>
      </View>
    );
  }

  if (error || !htmlContent) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to open Word document</Text>
        <Text style={[styles.statusText, { color: palette.muted }]}>{error || 'Document is empty.'}</Text>
      </View>
    );
  }

  const cardBg = palette.surface || palette.bg;
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
          font-family: ${getCssFontFamily(settings.fontFamily)};
          font-size: ${settings.fontSize}px;
          line-height: ${settings.lineHeight};
          margin: 0;
          padding: 0;
          text-align: ${settings.alignment};
          overflow-x: hidden;
        }
        .word-viewport {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px ${settings.margin}px 60px ${settings.margin}px;
          width: 100%;
          box-sizing: border-box;
        }
        .word-page-card {
          width: 100%;
          max-width: 816px;
          background-color: ${cardBg};
          color: ${palette.text};
          padding: 28px 20px;
          border-radius: 6px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(128, 128, 128, 0.18);
          box-sizing: border-box;
          overflow: hidden;
        }
        .word-page-content {
          width: 100%;
          overflow-wrap: break-word;
          word-break: break-word;
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
          line-height: 1.25;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        p {
          margin-top: 0;
          margin-bottom: ${settings.paragraphSpacing || 1.0}em;
          text-indent: 1em;
          text-align: ${settings.alignment};
          overflow-wrap: break-word;
          word-break: break-word;
        }
        table {
          max-width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
          overflow-x: auto;
          display: block;
        }
        td, th {
          border: 1px solid rgba(128, 128, 128, 0.3);
          padding: 6px 10px;
        }
        a {
          color: ${palette.link};
          text-decoration: underline;
        }
      </style>
      <style id="reader-theme-override">
        html, body {
          background-color: ${palette.bg} !important;
          color: ${palette.text} !important;
          font-family: ${getCssFontFamily(settings.fontFamily)} !important;
          font-size: ${settings.fontSize}px !important;
          line-height: ${settings.lineHeight} !important;
          text-align: ${settings.alignment} !important;
        }
        .word-viewport {
          padding-left: ${settings.margin}px !important;
          padding-right: ${settings.margin}px !important;
        }
        .word-page-card {
          background-color: ${cardBg} !important;
          color: ${palette.text} !important;
        }
        .word-page-content, p, div, span, h1, h2, h3, h4, li, blockquote {
          color: ${palette.text} !important;
        }
        p {
          margin-bottom: ${settings.paragraphSpacing || 1.0}em !important;
          text-align: ${settings.alignment} !important;
        }
        a {
          color: ${palette.link} !important;
        }
      </style>
    </head>
    <body>
      <div class="word-viewport">
        <article class="word-page-card">
          <div class="word-page-content">
            ${sanitizeHtml(htmlContent)}
          </div>
        </article>
      </div>
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
