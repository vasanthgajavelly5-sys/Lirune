/**
 * Lirune Reader Mobile — Modern Reflowable EPUB Reader Engine
 * Supports BOTH Discrete Page Mode (horizontal column pagination with swipe & tap turn)
 * and Continuous Scroll Mode (vertical scrolling), with persistent paragraph spacing.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { READER_WEBVIEW_PROPS } from '@/services/security/webviewPolicy';
import { SELECTION_WATCHER_JS, parseSelectionMessage, type SelectionPayload } from '@/services/reader/selectionBridge';
import { resolveZipPath } from '@/services/epub/zipPaths';
import JSZip from 'jszip';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'EpubReaderView';

interface EpubReaderViewProps {
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

interface ChapterItem {
  id: string;
  href: string;
  title: string;
  html: string;
}

export function EpubReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onTOCLoaded,
  targetCfi,
  searchQuery,
  onSearchResults,
  onSelectionChange,
}: EpubReaderViewProps) {
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [startAtEnd, setStartAtEnd] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const webViewRef = useRef<WebView>(null);

  const isPaginated = settings.flow !== 'scrolled';
  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;
  const paragraphSpacing = settings.paragraphSpacing || 1.0;

  // 1. Load and parse EPUB package
  useEffect(() => {
    let isMounted = true;
    async function loadEpub() {
      setIsLoading(true);
      try {
        const base64 = await fileStorage.readAsBase64(book.filePath);
        const zip = await JSZip.loadAsync(base64, { base64: true });

        // A. Find OPF path via META-INF/container.xml
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) throw new Error('Missing META-INF/container.xml');

        const containerXml = await containerFile.async('text');
        const opfMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
        const opfPath = opfMatch ? opfMatch[1] : 'OEBPS/content.opf';
        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

        const opfFile = zip.file(opfPath);
        if (!opfFile) throw new Error(`Missing OPF file at ${opfPath}`);

        const opfXml = await opfFile.async('text');

        // B. Parse Manifest: <item id="..." href="..." media-type="..."/>
        const manifest: Record<string, { href: string; mediaType: string }> = {};
        const itemRegex = /<item\b[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*\bmedia-type=["']([^"']+)["'][^>]*\/?>/gi;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
          manifest[itemMatch[1]] = {
            href: itemMatch[2],
            mediaType: itemMatch[3],
          };
        }

        // C. Parse Spine: <itemref idref="..."/>
        const spineIdrefs: string[] = [];
        const spineRegex = /<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*\/?>/gi;
        let spineMatch;
        while ((spineMatch = spineRegex.exec(opfXml)) !== null) {
          spineIdrefs.push(spineMatch[1]);
        }

        // D. Extract TOC from NCX or NAV
        const tocItems: TOCItem[] = [];
        const ncxItem = Object.values(manifest).find(
          (m) => m.mediaType === 'application/x-dtbncx+xml' || m.href.endsWith('.ncx')
        );

        if (ncxItem) {
          const ncxPath = resolveZipPath(opfDir, ncxItem.href);
          const ncxFile = zip.file(ncxPath);
          if (ncxFile) {
            const ncxXml = await ncxFile.async('text');
            const navPointRegex = /<navPoint\b[^>]*>[\s\S]*?<text>([^<]+)<\/text>[\s\S]*?<content[^>]+src=["']([^"']+)["'][\s\S]*?<\/navPoint>/gi;
            let navMatch;
            let navIdx = 0;
            while ((navMatch = navPointRegex.exec(ncxXml)) !== null) {
              tocItems.push({
                id: `toc_${navIdx++}`,
                label: navMatch[1].trim(),
                href: navMatch[2],
              });
            }
          }
        }

        // Map every spine item to its resolved zip path
        const spinePaths: string[] = [];
        for (const idref of spineIdrefs) {
          const manItem = manifest[idref];
          spinePaths.push(manItem ? resolveZipPath(opfDir, manItem.href) : '');
        }
        const spineIndexByPath = new Map<string, number>();
        spinePaths.forEach((p, i) => {
          if (p && !spineIndexByPath.has(p)) spineIndexByPath.set(p, i);
        });
        const spineIndexFor = (href: string): number | null => {
          const p = resolveZipPath(opfDir, href);
          const direct = spineIndexByPath.get(p);
          if (direct !== undefined) return direct;
          const lower = p.toLowerCase();
          for (const [key, idx] of spineIndexByPath) {
            if (key.toLowerCase() === lower) return idx;
          }
          return null;
        };

        // Rewrite TOC hrefs to spine:N
        for (const item of tocItems) {
          if (!item.href) continue;
          const idx = spineIndexFor(item.href);
          if (idx !== null) {
            item.href = `spine:${idx}`;
          }
        }

        // E. Load readable chapters from spine items
        const loadedChapters: ChapterItem[] = [];
        for (let i = 0; i < spineIdrefs.length; i++) {
          const idref = spineIdrefs[i];
          const manItem = manifest[idref];
          if (!manItem) continue;

          const itemPath = resolveZipPath(opfDir, manItem.href);
          const file = zip.file(itemPath);
          if (!file) continue;

          let rawHtml = await file.async('text');

          rawHtml = rawHtml
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*\/?>/gi, '');

          const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i) ||
            rawHtml.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
          const title = titleMatch ? titleMatch[1].trim() : `Chapter ${loadedChapters.length + 1}`;

          const imgRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/gi;
          let imgMatch;
          const foundImages: string[] = [];
          while ((imgMatch = imgRegex.exec(rawHtml)) !== null) {
            foundImages.push(imgMatch[1]);
          }

          for (const imgSrc of foundImages) {
            if (imgSrc.startsWith('data:') || imgSrc.startsWith('http')) continue;
            const fullImgPath = resolveZipPath(opfDir, imgSrc);
            const imgEntry = zip.file(fullImgPath) || Object.values(zip.files).find((f) => f.name.toLowerCase() === fullImgPath.toLowerCase());
            if (imgEntry) {
              const b64 = await imgEntry.async('base64');
              const ext = imgSrc.split('.').pop()?.toLowerCase() || 'jpeg';
              const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
              const dataUri = `data:${mime};base64,${b64}`;
              rawHtml = rawHtml.split(imgSrc).join(dataUri);
            }
          }

          loadedChapters.push({
            id: idref,
            href: manItem.href,
            title,
            html: rawHtml,
          });

          if (tocItems.length === 0) {
            tocItems.push({
              id: idref,
              label: title,
              href: `spine:${loadedChapters.length - 1}`,
            });
          }
        }

        if (isMounted) {
          setChapters(loadedChapters);
          if (onTOCLoaded) onTOCLoaded(tocItems);
          setIsLoading(false);

          if (targetCfi && targetCfi.startsWith('spine:')) {
            const idx = parseInt(targetCfi.replace('spine:', ''), 10);
            if (!isNaN(idx) && idx >= 0 && idx < loadedChapters.length) {
              setCurrentChapterIndex(idx);
            }
          } else if (book.progress && book.progress > 0 && loadedChapters.length > 0) {
            const idx = Math.min(
              loadedChapters.length - 1,
              Math.floor((book.progress / 100) * loadedChapters.length)
            );
            setCurrentChapterIndex(idx);
          }
        }
      } catch (err) {
        logger.error(TAG, `Failed to load EPUB: ${book.filePath}`, err);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadEpub();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally runs only when filePath changes to open publication
  }, [book.filePath, onTOCLoaded]);

  // Jump to target chapter if targetCfi changes
  useEffect(() => {
    if (targetCfi && targetCfi.startsWith('spine:') && chapters.length > 0) {
      const idx = parseInt(targetCfi.replace('spine:', ''), 10);
      if (!isNaN(idx) && idx >= 0 && idx < chapters.length) {
        setCurrentChapterIndex(idx);
        setCurrentPage(0);
      }
    }
  }, [targetCfi, chapters.length]);

  // Update progress whenever chapter or page changes
  useEffect(() => {
    if (chapters.length === 0) return;
    const currentChapter = chapters[currentChapterIndex];
    let percent = Math.round(((currentChapterIndex + 1) / chapters.length) * 100);

    if (isPaginated && totalPages > 1) {
      const chapterFraction = currentPage / Math.max(1, totalPages);
      percent = Math.min(100, Math.round(((currentChapterIndex + chapterFraction) / chapters.length) * 100));
    }

    const cfi = `spine:${currentChapterIndex}`;
    onProgressChange(percent, cfi, currentChapter?.title || `Chapter ${currentChapterIndex + 1}`);
  }, [currentChapterIndex, currentPage, totalPages, isPaginated, chapters, onProgressChange]);

  // Chapter navigation
  const nextChapter = useCallback(() => {
    if (currentChapterIndex < chapters.length - 1) {
      setStartAtEnd(false);
      setCurrentChapterIndex((prev) => prev + 1);
      setCurrentPage(0);
    }
  }, [currentChapterIndex, chapters.length]);

  const prevChapter = useCallback((fromEnd: boolean = false) => {
    if (currentChapterIndex > 0) {
      setStartAtEnd(fromEnd);
      setCurrentChapterIndex((prev) => prev - 1);
      setCurrentPage(0);
    }
  }, [currentChapterIndex]);

  // Search
  useEffect(() => {
    if (!searchQuery || chapters.length === 0 || !onSearchResults) return;
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (let cIdx = 0; cIdx < chapters.length && results.length < 50; cIdx++) {
      const plainText = chapters[cIdx].html.replace(/<[^>]+>/g, ' ');
      let pos = 0;
      while (pos < plainText.length && results.length < 50) {
        const index = plainText.toLowerCase().indexOf(q, pos);
        if (index === -1) break;

        const startExcerpt = Math.max(0, index - 30);
        const endExcerpt = Math.min(plainText.length, index + q.length + 50);
        const excerpt =
          (startExcerpt > 0 ? '...' : '') +
          plainText.substring(startExcerpt, endExcerpt).replace(/\s+/g, ' ') +
          (endExcerpt < plainText.length ? '...' : '');

        results.push({
          cfi: `spine:${cIdx}`,
          excerpt,
          label: chapters[cIdx].title || `Chapter ${cIdx + 1}`,
        });

        pos = index + Math.max(1, q.length);
      }
    }

    onSearchResults(results);
  }, [searchQuery, chapters, onSearchResults]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.loadingText, { color: palette.muted }]}>
          Opening EPUB publication...
        </Text>
      </View>
    );
  }

  const activeChapter = chapters[currentChapterIndex];
  const chapterHtml = activeChapter?.html || '<p>No content in this chapter.</p>';

  const renderedHtml = isPaginated
    ? `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
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
          text-align: ${settings.alignment};
          user-select: none;
          -webkit-user-select: none;
        }
        #viewport {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          position: relative;
        }
        #book-content {
          width: 100vw;
          height: calc(100vh - 54px);
          margin-top: 20px;
          box-sizing: border-box;
          column-width: calc(100vw - ${(settings.margin + 16) * 2}px);
          column-gap: ${(settings.margin + 16) * 2}px;
          column-fill: auto;
          padding-left: ${settings.margin + 16}px;
          padding-right: ${settings.margin + 16}px;
          overflow: visible;
          transition: transform 0.22s cubic-bezier(0.25, 1, 0.5, 1);
          word-wrap: break-word;
        }
        img {
          max-width: 100%;
          max-height: 75vh;
          object-fit: contain;
          display: block;
          margin: 12px auto;
          border-radius: 4px;
        }
        h1, h2, h3, h4, h5, h6 {
          color: ${palette.text};
          line-height: 1.25;
          margin-top: 1.2em;
          margin-bottom: 0.5em;
          break-after: avoid;
        }
        p {
          margin-top: 0;
          margin-bottom: ${paragraphSpacing}em;
          text-indent: 1em;
        }
        a {
          color: ${palette.link};
          text-decoration: none;
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      <div id="viewport">
        <div id="book-content">${chapterHtml}</div>
      </div>
      <script>
        var currentPage = 0;
        var totalPages = 1;
        var startAtEnd = ${startAtEnd ? 'true' : 'false'};

        function measurePages() {
          var content = document.getElementById('book-content');
          if (!content) return 1;
          var scrollW = content.scrollWidth;
          var viewW = window.innerWidth;
          totalPages = Math.max(1, Math.round(scrollW / viewW));
          return totalPages;
        }

        function updateTransform() {
          var content = document.getElementById('book-content');
          if (content) {
            content.style.transform = 'translateX(-' + (currentPage * 100) + 'vw)';
          }
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'pageTurn',
            currentPage: currentPage,
            totalPages: totalPages
          }));
        }

        function goToPage(p) {
          measurePages();
          if (p < 0) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageBoundary', boundary: 'prev' }));
            return;
          }
          if (p >= totalPages) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageBoundary', boundary: 'next' }));
            return;
          }
          currentPage = p;
          updateTransform();
        }

        window.addEventListener('load', function() {
          setTimeout(function() {
            measurePages();
            if (startAtEnd) {
              currentPage = Math.max(0, totalPages - 1);
            } else {
              currentPage = 0;
            }
            updateTransform();
          }, 60);
        });

        var touchStartX = 0;
        var touchStartY = 0;
        var touchStartTime = 0;

        document.addEventListener('touchstart', function(e) {
          if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
          }
        }, { passive: true });

        document.addEventListener('touchend', function(e) {
          if (e.changedTouches.length === 1) {
            var deltaX = e.changedTouches[0].clientX - touchStartX;
            var deltaY = e.changedTouches[0].clientY - touchStartY;
            var elapsed = Date.now() - touchStartTime;

            // Horizontal Swipe
            if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 600) {
              if (deltaX < 0) {
                goToPage(currentPage + 1);
              } else {
                goToPage(currentPage - 1);
              }
              return;
            }

            // Discreet Tap Turn
            if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && elapsed < 400) {
              var x = e.changedTouches[0].clientX;
              var w = window.innerWidth;
              var ratio = x / w;
              if (ratio < 0.28) {
                goToPage(currentPage - 1);
              } else if (ratio > 0.72) {
                goToPage(currentPage + 1);
              } else {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
              }
            }
          }
        }, { passive: true });

        ${SELECTION_WATCHER_JS}
      </script>
    </body>
    </html>
  `
    : `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
      <style>
        * { box-sizing: border-box; }
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
        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 16px auto;
          border-radius: 4px;
        }
        h1, h2, h3, h4, h5, h6 {
          color: ${palette.text};
          line-height: 1.3;
          margin-top: 1.5em;
          margin-bottom: 0.6em;
        }
        p {
          margin-top: 0;
          margin-bottom: ${paragraphSpacing}em;
          text-indent: 1em;
        }
        a {
          color: ${palette.link};
          text-decoration: none;
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      ${chapterHtml}
      <script>
        document.body.addEventListener('click', function(e) {
          var x = e.clientX;
          var width = window.innerWidth;
          var ratio = x / width;
          if (ratio < 0.22) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prevChapter' }));
          } else if (ratio > 0.78) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nextChapter' }));
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleControls' }));
          }
        });

        ${SELECTION_WATCHER_JS}
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    const sel = parseSelectionMessage(event?.nativeEvent?.data);
    if (sel) {
      onSelectionChange?.(sel);
      return;
    }
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pageTurn') {
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
      } else if (data.type === 'pageBoundary') {
        if (data.boundary === 'prev') {
          prevChapter(true);
        } else if (data.boundary === 'next') {
          nextChapter();
        }
      } else if (data.type === 'toggleControls') {
        onToggleControls();
      } else if (data.type === 'prevChapter') {
        prevChapter(false);
      } else if (data.type === 'nextChapter') {
        nextChapter();
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        ref={webViewRef}
        {...READER_WEBVIEW_PROPS}
        source={{ html: renderedHtml }}
        style={{ backgroundColor: palette.bg }}
        onMessage={handleMessage}
        scrollEnabled={!isPaginated}
        showsVerticalScrollIndicator={false}
      />

      {/* Discrete Paginated Mode Page Indicator */}
      {isPaginated && totalPages > 0 && (
        <View style={styles.pageFooter} pointerEvents="none">
          <Text style={[styles.pageFooterText, { color: palette.muted }]}>
            {currentPage + 1} / {totalPages} • Chapter {currentChapterIndex + 1} of {chapters.length}
          </Text>
        </View>
      )}
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
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageFooterText: {
    fontSize: 11,
    letterSpacing: 0.3,
    fontWeight: '500',
    opacity: 0.7,
  },
});
