/**
 * Lirune Reader Mobile — FictionBook 2 (FB2) Reader
 * Parses XML body, inlines embedded binary images, and provides section navigation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { READER_WEBVIEW_PROPS } from '@/services/security/webviewPolicy';
import { SELECTION_WATCHER_JS, parseSelectionMessage, type SelectionPayload } from '@/services/reader/selectionBridge';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'Fb2ReaderView';

interface Fb2ReaderViewProps {
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

export function Fb2ReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onTOCLoaded,
  targetCfi,
  searchQuery,
  onSearchResults,
  onSelectionChange,
}: Fb2ReaderViewProps) {
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  useEffect(() => {
    let active = true;
    async function parseFb2() {
      try {
        const rawXml = await fileStorage.readAsString(book.filePath);

        // 1. Extract binary images: <binary id="..." content-type="...">base64</binary>
        const imageMap: Record<string, string> = {};
        const binaryRegex = /<binary[^>]+id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/binary>/gi;
        let match;
        while ((match = binaryRegex.exec(rawXml)) !== null) {
          const id = match[1];
          const cleanB64 = match[2].replace(/\s+/g, '');
          imageMap[id] = cleanB64;
          imageMap[`#${id}`] = cleanB64;
        }

        // 2. Extract sections & titles
        const sections: { id: string; title: string; html: string }[] = [];
        const tocItems: TOCItem[] = [];

        // Match body
        const bodyMatch = rawXml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : rawXml;

        // Process sections
        const sectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/gi;
        let secMatch;
        let idx = 1;

        while ((secMatch = sectionRegex.exec(bodyContent)) !== null) {
          let secHtml = secMatch[1];

          // Extract title
          const titleMatch = secHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          let titleText = `Section ${idx}`;
          if (titleMatch) {
            titleText = titleMatch[1].replace(/<[^>]+>/g, '').trim() || titleText;
            // Remove title tag from content since we render our own header
            secHtml = secHtml.replace(/<title[^>]*>[\s\S]*?<\/title>/i, '');
          }

          // Replace <image l:href="#id"/> with standard base64 <img>
          secHtml = secHtml.replace(
            /<image[^>]+(?:l:)?href=["']([^"']+)["'][^>]*\/?>/gi,
            (_all, href) => {
              const b64 = imageMap[href] || imageMap[href.replace(/^#/, '')];
              if (b64) {
                return `<img src="data:image/jpeg;base64,${b64}" alt="Illustration" />`;
              }
              return '';
            }
          );

          // Convert FB2 tags to standard HTML
          secHtml = secHtml
            .replace(/<p\b[^>]*>/gi, '<p>')
            .replace(/<v\b[^>]*>/gi, '<p class="verse">')
            .replace(/<\/v>/gi, '</p>')
            .replace(/<cite\b[^>]*>/gi, '<blockquote>')
            .replace(/<\/cite>/gi, '</blockquote>')
            .replace(/<empty-line\s*\/?>/gi, '<br/>');

          const secId = `section_${idx}`;
          sections.push({
            id: secId,
            title: titleText,
            html: `<section id="${secId}"><h2 class="chapter-heading">${titleText}</h2>${secHtml}</section>`,
          });

          tocItems.push({
            id: secId,
            label: titleText,
            depth: 0,
          });

          idx++;
        }

        if (active) {
          if (tocItems.length > 0 && onTOCLoaded) {
            onTOCLoaded(tocItems);
          }
          setRenderedHtml(
            sections.map((s) => s.html).join('<hr class="chapter-divider"/>')
          );
          setIsLoading(false);
        }
      } catch (err) {
        logger.error(TAG, `Error parsing FB2: ${book.filePath}`, err);
        if (active) {
          setRenderedHtml('<p>Unable to parse FictionBook content.</p>');
          setIsLoading(false);
        }
      }
    }

    parseFb2();
    return () => {
      active = false;
    };
  }, [book.filePath, onTOCLoaded]);

  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
      <style>
        body {
          background-color: ${palette.bg};
          color: ${palette.text};
          font-family: ${
            settings.fontFamily === 'Monospace'
              ? 'monospace'
              : settings.fontFamily === 'Serif'
              ? 'Georgia, serif'
              : 'system-ui, -apple-system, sans-serif'
          };
          font-size: ${settings.fontSize}px;
          line-height: ${settings.lineHeight};
          padding: 24px ${settings.margin + 4}px 60px ${settings.margin + 4}px;
          margin: 0;
          text-align: ${settings.alignment};
          word-wrap: break-word;
        }
        h2.chapter-heading {
          color: ${palette.text};
          font-size: 1.3em;
          margin-top: 2em;
          margin-bottom: 0.8em;
          border-bottom: 1px solid ${palette.muted}33;
          padding-bottom: 8px;
        }
        p {
          margin-top: 0;
          margin-bottom: ${settings.paragraphSpacing || 1.0}em;
          text-indent: 1em;
        }
        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 16px auto;
          border-radius: 4px;
        }
        hr.chapter-divider {
          border: 0;
          height: 1px;
          background-color: ${palette.muted}44;
          margin: 36px 0;
        }
        blockquote {
          border-left: 3px solid ${palette.link};
          margin-left: 0;
          padding-left: 16px;
          color: ${palette.muted};
        }
      </style>
    </head>
    <body>
      ${renderedHtml}
      <script>
        // Throttled: the native side persists progress with two SQL writes per
        // call, so an unthrottled 'scroll' event produced heavy DB churn.
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
      
      ${SELECTION_WATCHER_JS}
      </script>
    </body>
    </html>
  `;

  // Jump to section if targetCfi is provided
  useEffect(() => {
    if (targetCfi) {
      if (targetCfi.startsWith('section_')) {
        webViewRef.current?.injectJavaScript(`
          var el = document.getElementById("${targetCfi}");
          if (el) el.scrollIntoView({ behavior: 'smooth' });
          true;
        `);
      } else if (targetCfi.startsWith('scroll:')) {
        const y = parseInt(targetCfi.replace('scroll:', ''), 10);
        if (!isNaN(y)) {
          webViewRef.current?.injectJavaScript(`window.scrollTo(0, ${y}); true;`);
        }
      }
    }
  }, [targetCfi]);

  const handleMessage = (event: any) => {
    const sel = parseSelectionMessage(event?.nativeEvent?.data);
    if (sel) {
      onSelectionChange?.(sel);
      return;
    }
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'progress') {
        onProgressChange(data.percent, `scroll:${data.scrollY}`, 'FictionBook');
      } else if (data.type === 'tap') {
        const ratio = data.xRatio;
        if (ratio < 0.25) {
          webViewRef.current?.injectJavaScript(`window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); true;`);
        } else if (ratio > 0.75) {
          webViewRef.current?.injectJavaScript(`window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); true;`);
        } else {
          onToggleControls();
        }
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
