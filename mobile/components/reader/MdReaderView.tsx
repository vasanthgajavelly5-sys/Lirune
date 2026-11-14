/**
 * Lirune Reader Mobile — Markdown (MD) Reader View Component
 * Renders reflowable Markdown with typography & theme styling, table of contents,
 * scroll progress tracking, text selection, and offline security.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { SELECTION_WATCHER_JS, parseSelectionMessage, type SelectionPayload } from '@/services/reader/selectionBridge';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { sanitizeHtml } from '@/services/security/sanitizeHtml';
import { logger } from '@/utils/logger';

const TAG = 'MdReaderView';

interface MdReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  onChapterCountLoaded?: (count: number) => void;
  onTOCLoaded?: (toc: TOCItem[]) => void;
  targetCfi?: string | null;
  onSearchResults?: (results: SearchResult[]) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
  onContentTextChange?: (html: string) => void;
  searchQuery?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseMarkdown(mdText: string): { html: string; toc: TOCItem[] } {
  const lines = mdText.split(/\r?\n/);
  const out: string[] = [];
  const toc: TOCItem[] = [];

  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let headingCount = 0;

  function closeLists() {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
  }

  function inlineFormat(text: string): string {
    return escapeHtml(text)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
        const safeSrc = src.replace(/[^\w\d_.:\/-]/g, '');
        return `<img src="${safeSrc}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:1em auto;" />`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block fences
    if (trimmed.startsWith('```')) {
      if (inCode) {
        out.push(
          `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeBuffer.join('\n'))}</code></pre>`
        );
        inCode = false;
        codeBuffer = [];
        codeLang = '';
      } else {
        closeLists();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        codeBuffer = [];
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Blank line
    if (!trimmed) {
      closeLists();
      continue;
    }

    // Headings: #, ##, ###, ####, #####, ######
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = `heading-${++headingCount}`;
      toc.push({
        id,
        label: text.replace(/[*_`]/g, ''),
        href: `#${id}`,
      });
      out.push(`<h${level} id="${id}">${inlineFormat(text)}</h${level}>`);
      continue;
    }

    // Blockquote: >
    if (trimmed.startsWith('>')) {
      closeLists();
      out.push(`<blockquote>${inlineFormat(trimmed.replace(/^>\s*/, ''))}</blockquote>`);
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      closeLists();
      out.push('<hr />');
      continue;
    }

    // Bullet list: - or *
    const ulMatch = rawLine.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (!inUl) {
        closeLists();
        inUl = true;
        out.push('<ul>');
      }
      out.push(`<li>${inlineFormat(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list: 1.
    const olMatch = rawLine.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inOl) {
        closeLists();
        inOl = true;
        out.push('<ol>');
      }
      out.push(`<li>${inlineFormat(olMatch[2])}</li>`);
      continue;
    }

    // Table rows: | Col 1 | Col 2 |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));

      if (isSeparator) {
        continue;
      }

      if (!inTable) {
        closeLists();
        inTable = true;
        out.push('<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:1em 0;width:100%;"><tbody>');
      }
      out.push(`<tr>${cells.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`);
      continue;
    }

    // Standard paragraph
    closeLists();
    out.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  closeLists();

  if (inCode) {
    out.push(
      `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeBuffer.join('\n'))}</code></pre>`
    );
  }

  return { html: out.join('\n'), toc };
}

export function MdReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onChapterCountLoaded,
  onTOCLoaded,
  targetCfi,
  onSearchResults,
  onSelectionChange,
  onContentTextChange,
  searchQuery,
}: MdReaderViewProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;

  useEffect(() => {
    let active = true;
    async function loadMarkdown() {
      setIsLoading(true);
      setError(null);
      try {
        const filePath = book.filePath || book.uri || '';
        const rawText = await fileStorage.readAsString(filePath);
        if (!active) return;

        const { html, toc } = parseMarkdown(rawText);
        const safeHtml = sanitizeHtml(html);

        setHtmlContent(safeHtml);
        if (onTOCLoaded && toc.length > 0) {
          onTOCLoaded(toc);
        }
        if (onChapterCountLoaded) {
          onChapterCountLoaded(Math.max(1, toc.length));
        }
        if (onContentTextChange) {
          onContentTextChange(safeHtml);
        }
        setIsLoading(false);
      } catch (err) {
        logger.error(TAG, `Error reading markdown book ${book.id}:`, err);
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load Markdown document.');
          setIsLoading(false);
        }
      }
    }

    loadMarkdown();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.id, onChapterCountLoaded, onContentTextChange, onTOCLoaded]);

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

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const raw = event.nativeEvent.data;
        if (!raw) return;

        if (raw.startsWith('{')) {
          const payload = JSON.parse(raw);
          if (payload.type === 'progress') {
            onProgressChange(
              payload.percent,
              payload.scrollY !== undefined ? `scroll:${payload.scrollY}` : undefined
            );
            return;
          }
          if (payload.type === 'tap') {
            onToggleControls();
            return;
          }
        }

        const sel = parseSelectionMessage(raw);
        if (sel && onSelectionChange) {
          onSelectionChange(sel);
        }
      } catch {
        // ignore unparseable events
      }
    },
    [onProgressChange, onToggleControls, onSelectionChange]
  );

  const cardBg = palette.surface || palette.bg;
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
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
      text-decoration: underline;
    }
    p {
      margin-top: 0;
      margin-bottom: ${settings.paragraphSpacing || 1.0}em;
      text-align: ${settings.alignment};
      overflow-wrap: break-word;
      word-break: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${palette.text};
      margin-top: 1.4em;
      margin-bottom: 0.6em;
      line-height: 1.25;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    blockquote {
      border-left: 4px solid ${palette.muted};
      padding-left: 16px;
      margin: 16px 0;
      color: ${palette.muted};
      font-style: italic;
    }
    code {
      font-family: monospace;
      background: rgba(128, 128, 128, 0.15);
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    pre {
      background: rgba(128, 128, 128, 0.12);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
      display: block;
      overflow-x: auto;
    }
    td, th {
      border: 1px solid rgba(128, 128, 128, 0.3);
      padding: 8px 12px;
      text-align: left;
    }
    hr {
      border: 0;
      border-top: 1px solid rgba(128, 128, 128, 0.3);
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
        ${htmlContent || ''}
      </div>
    </article>
  </div>
  <script>
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

    document.addEventListener('click', function(e) {
      if (window.getSelection && window.getSelection().toString().trim().length > 0) return;
      var target = e.target;
      while (target && target !== document.body) {
        if (target.tagName === 'A') return;
        target = target.parentElement;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }));
    });
  </script>
  <script>
    ${SELECTION_WATCHER_JS}
  </script>
</body>
</html>`;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.text} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorText, { color: palette.text }]}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        {...READER_WEBVIEW_PROPS}
        source={{ html: fullHtml }}
        style={[styles.webview, { backgroundColor: palette.bg }]}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={allowReaderNavigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
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
