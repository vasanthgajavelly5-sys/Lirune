/**
 * Lirune Reader Mobile — Safe Local HTML Reader
 * Sanitizes external calls, applies reader theme styles, and tracks scroll position.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { READER_WEBVIEW_PROPS } from '@/services/security/webviewPolicy';
import { SELECTION_WATCHER_JS, parseSelectionMessage, type SelectionPayload } from '@/services/reader/selectionBridge';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { logger } from '@/utils/logger';

const TAG = 'HtmlReaderView';

interface HtmlReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  onTOCLoaded?: (toc: TOCItem[]) => void;
  targetCfi?: string | null;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
  onSelectionChange?: (selection: SelectionPayload) => void;
}

export function HtmlReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onTOCLoaded,
  targetCfi,
  searchQuery,
  onSearchResults,
  onSelectionChange,
}: HtmlReaderViewProps) {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  useEffect(() => {
    let active = true;
    const bookPath = book.filePath || book.uri || '';
    async function loadHtml() {
      try {
        const raw = await fileStorage.readAsString(bookPath);
        if (active) {
          setHtmlContent(raw);
          setIsLoading(false);
        }
      } catch (err) {
        logger.error(TAG, `Error reading HTML file: ${bookPath}`, err);
        if (active) {
          setHtmlContent('<p>Unable to read HTML file.</p>');
          setIsLoading(false);
        }
      }
    }
    loadHtml();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri]);

  // Generate styled, secure wrapper HTML
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
      <style>
        body {
          background-color: ${palette.bg};
          color: ${palette.text};
          font-family: ${getCssFontFamily(settings.fontFamily)};
          font-size: ${settings.fontSize}px;
          line-height: ${settings.lineHeight};
          padding: 24px ${settings.margin + 4}px 60px ${settings.margin + 4}px;
          margin: 0;
          text-align: ${settings.alignment};
          word-wrap: break-word;
        }
        a {
          color: ${palette.link};
          pointer-events: none; /* disable external clicking */
        }
        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 16px auto;
        }
        h1, h2, h3, h4, h5, h6 {
          color: ${palette.text};
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          line-height: 1.3;
        }
        p {
          margin-top: 0;
          margin-bottom: ${settings.paragraphSpacing || 1.0}em;
          text-indent: 1em;
        }
        hr {
          border: 0;
          border-top: 1px solid ${palette.muted}44;
          margin: 24px 0;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>
        // Track scroll progress and tap zones.
        // Throttled: the native side persists progress with two SQL writes per
        // call, so an unthrottled 'scroll' event (dozens per second) produced
        // heavy DB churn and visible jank.
        var lastSentPercent = -1;
        var lastSentAt = 0;
        window.addEventListener('scroll', function() {
          var total = document.documentElement.scrollHeight - window.innerHeight;
          var current = window.scrollY;
          var percent = total > 0 ? Math.round((current / total) * 100) : 100;
          var now = Date.now();
          if (percent === lastSentPercent) return;
          if (now - lastSentAt < 400 && percent !== 100) return;
          lastSentPercent = percent;
          lastSentAt = now;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'progress',
            percent: percent,
            scrollY: current
          }));
        });

        document.body.addEventListener('click', function(e) {
          const x = e.clientX;
          const width = window.innerWidth;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tap',
            xRatio: x / width
          }));
        });

        // Extract headings for Table of Contents
        window.addEventListener('DOMContentLoaded', function() {
          const headings = document.querySelectorAll('h1, h2, h3');
          const toc = [];
          headings.forEach(function(h, idx) {
            toc.push({
              id: 'heading_' + idx,
              label: h.textContent.trim() || 'Section ' + (idx + 1),
              depth: parseInt(h.tagName.substring(1), 10) - 1
            });
          });
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'toc',
            toc: toc
          }));
        });
      
      ${SELECTION_WATCHER_JS}
      </script>
    </body>
    </html>
  `;

  // Navigate to saved location or target CFI
  useEffect(() => {
    if (targetCfi && targetCfi.startsWith('scroll:')) {
      const y = parseInt(targetCfi.replace('scroll:', ''), 10);
      if (!isNaN(y)) {
        webViewRef.current?.injectJavaScript(`window.scrollTo(0, ${y}); true;`);
      }
    }
  }, [targetCfi]);

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    const sel = parseSelectionMessage(event?.nativeEvent?.data);
    if (sel) {
      onSelectionChange?.(sel);
      return;
    }
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'progress') {
        onProgressChange(data.percent, `scroll:${data.scrollY}`, 'HTML Document');
      } else if (data.type === 'tap') {
        const ratio = data.xRatio;
        if (ratio < 0.25) {
          // Scroll up one viewport
          webViewRef.current?.injectJavaScript(`window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); true;`);
        } else if (ratio > 0.75) {
          // Scroll down one viewport
          webViewRef.current?.injectJavaScript(`window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); true;`);
        } else {
          onToggleControls();
        }
      } else if (data.type === 'toc' && onTOCLoaded && Array.isArray(data.toc)) {
        onTOCLoaded(data.toc);
      }
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        ref={webViewRef}
        {...READER_WEBVIEW_PROPS}
        source={{ html: styledHtml }}
        style={{ backgroundColor: palette.bg }}
        onMessage={handleMessage}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
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
  },
});
