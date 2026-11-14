/**
 * Lirune Reader Mobile — Safe Local HTML Reader
 * Sanitizes external calls, applies reader theme styles, and tracks scroll position.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { READER_WEBVIEW_PROPS } from '@/services/security/webviewPolicy';
import { sanitizeHtml } from '@/services/security/sanitizeHtml';
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

function stripAllTags(input: string): string {
  let prev = '';
  let curr = input;
  while (curr !== prev) {
    prev = curr;
    curr = curr.replace(/<[^>]*>/g, '');
  }
  return curr.trim();
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
          // Extract page title and meta description
          const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const pageTitle = titleMatch ? stripAllTags(titleMatch[1]) : book.title || 'HTML document';
          const metaMatch =
            raw.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
            raw.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
          const metaDesc = metaMatch ? metaMatch[1].trim() : '';

          let sanitized = sanitizeHtml(raw);
          const plainText = stripAllTags(sanitized);

          // Check if the page is a JS-only client-side SPA
          const isSpaNotice =
            !plainText ||
            /this page requires javascript|you need to enable javascript|javascript is required|enable javascript to continue/i.test(
              plainText
            );

          if (isSpaNotice && !sanitized.includes('<img')) {
            sanitized = `
              <div style="padding: 36px 16px; text-align: center; max-width: 600px; margin: 32px auto;">
                <h2 style="font-size: 1.35rem; margin-bottom: 12px; color: ${palette.text};">${pageTitle}</h2>
                ${metaDesc ? `<p style="color: ${palette.muted}; margin-bottom: 20px; line-height: 1.6;">${metaDesc}</p>` : ''}
                <div style="background: rgba(128,128,128,0.12); border-radius: 8px; padding: 18px; font-size: 0.95rem; color: ${palette.muted}; line-height: 1.6;">
                  This web page was saved as dynamic client-side HTML (Single Page Application). Its readable content is rendered dynamically by external JavaScript scripts which cannot be executed in this reader.
                </div>
              </div>
            `;
          }

          setHtmlContent(sanitized);
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
  }, [book.filePath, book.uri, book.title, palette.text, palette.muted]);

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
      .doc-viewport {
        padding-left: ${settings.margin + 4}px !important;
        padding-right: ${settings.margin + 4}px !important;
      }
      .doc-page-card {
        background-color: ${cardBg} !important;
        color: ${palette.text} !important;
      }
      .doc-page-content, p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote {
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

  // Generate styled, secure wrapper HTML
  const cardBg = palette.surface || palette.bg;
  const styledHtml = `
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
        .doc-viewport {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px ${settings.margin + 4}px 60px ${settings.margin + 4}px;
          width: 100%;
          box-sizing: border-box;
        }
        .doc-page-card {
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
        .doc-page-content {
          width: 100%;
          overflow-wrap: break-word;
          word-break: break-word;
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
          border-collapse: collapse;
          width: 100%;
          margin: 16px 0;
          display: block;
          overflow-x: auto;
        }
        button, input, select, textarea {
          pointer-events: none;
          opacity: 0.8;
        }
        hr {
          border: 0;
          border-top: 1px solid ${palette.muted}44;
          margin: 24px 0;
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
        .doc-viewport {
          padding-left: ${settings.margin + 4}px !important;
          padding-right: ${settings.margin + 4}px !important;
        }
        .doc-page-card {
          background-color: ${cardBg} !important;
          color: ${palette.text} !important;
        }
        .doc-page-content, p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote {
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
      <div class="doc-viewport">
        <article class="doc-page-card">
          <div class="doc-page-content">
            ${htmlContent}
          </div>
        </article>
      </div>
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
