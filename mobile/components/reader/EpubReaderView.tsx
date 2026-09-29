/**
 * Lirune Reader Mobile — Modern Reflowable EPUB Reader Engine
 * Reads EPUB structure (OPF, manifest, spine, TOC), renders chapters cleanly,
 * and communicates navigation, progress, and touch gestures with the native UI.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
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
}: EpubReaderViewProps) {
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const webViewRef = useRef<WebView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

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
          const ncxPath = (opfDir + ncxItem.href).replace(/^\//, '');
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

        // E. Load readable chapters from spine items
        const loadedChapters: ChapterItem[] = [];
        for (let i = 0; i < spineIdrefs.length; i++) {
          const idref = spineIdrefs[i];
          const manItem = manifest[idref];
          if (!manItem) continue;

          const itemPath = (opfDir + manItem.href).replace(/^\//, '');
          const file = zip.file(itemPath);
          if (!file) continue;

          let rawHtml = await file.async('text');

          // Clean body tags and remove scripts
          rawHtml = rawHtml
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*\/?>/gi, '');

          // Find chapter title
          const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i) ||
            rawHtml.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
          const title = titleMatch ? titleMatch[1].trim() : `Chapter ${loadedChapters.length + 1}`;

          // Inline images from zip
          const imgRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/gi;
          let imgMatch;
          const foundImages: string[] = [];
          while ((imgMatch = imgRegex.exec(rawHtml)) !== null) {
            foundImages.push(imgMatch[1]);
          }

          for (const imgSrc of foundImages) {
            if (imgSrc.startsWith('data:') || imgSrc.startsWith('http')) continue;
            const fullImgPath = (opfDir + imgSrc).replace(/^\//, '');
            const imgEntry = zip.file(fullImgPath) || Object.values(zip.files).find((f) => f.name.toLowerCase() === fullImgPath.toLowerCase());
            if (imgEntry) {
              const b64 = await imgEntry.async('base64');
              const ext = imgSrc.split('.').pop()?.toLowerCase() || 'jpeg';
              const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
              rawHtml = rawHtml.replace(imgSrc, `data:${mime};base64,${b64}`);
            }
          }

          loadedChapters.push({
            id: idref,
            href: manItem.href,
            title,
            html: rawHtml,
          });

          // Add to TOC if no NCX was present
          if (tocItems.length === 0) {
            tocItems.push({
              id: idref,
              label: title,
              href: manItem.href,
            });
          }
        }

        if (isMounted) {
          setChapters(loadedChapters);
          if (onTOCLoaded) onTOCLoaded(tocItems);
          setIsLoading(false);

          // Restore chapter position
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
  }, [book.filePath, onTOCLoaded]);

  // Jump to target chapter if targetCfi changes
  useEffect(() => {
    if (targetCfi && targetCfi.startsWith('spine:') && chapters.length > 0) {
      const idx = parseInt(targetCfi.replace('spine:', ''), 10);
      if (!isNaN(idx) && idx >= 0 && idx < chapters.length) {
        setCurrentChapterIndex(idx);
      }
    }
  }, [targetCfi, chapters.length]);

  // Update progress whenever chapter changes
  useEffect(() => {
    if (chapters.length === 0) return;
    const currentChapter = chapters[currentChapterIndex];
    const percent = Math.round(((currentChapterIndex + 1) / chapters.length) * 100);
    const cfi = `spine:${currentChapterIndex}`;
    onProgressChange(percent, cfi, currentChapter?.title || `Chapter ${currentChapterIndex + 1}`);
  }, [currentChapterIndex, chapters, onProgressChange]);

  // Navigation callbacks
  const nextChapter = useCallback(() => {
    if (currentChapterIndex < chapters.length - 1) {
      setCurrentChapterIndex((prev) => prev + 1);
      webViewRef.current?.injectJavaScript('window.scrollTo(0, 0); true;');
    }
  }, [currentChapterIndex, chapters.length]);

  const prevChapter = useCallback(() => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex((prev) => prev - 1);
      webViewRef.current?.injectJavaScript('window.scrollTo(0, 0); true;');
    }
  }, [currentChapterIndex]);

  // In-book search across all chapters
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

  const renderedHtml = `
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
          margin-bottom: 0.8em;
          text-indent: 1em;
        }
        a {
          color: ${palette.link};
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      ${chapterHtml}
      <script>
        document.body.addEventListener('click', function(e) {
          var x = e.clientX;
          var width = window.innerWidth;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tap',
            xRatio: x / width
          }));
        });
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'tap') {
        const ratio = data.xRatio;
        if (ratio < 0.25) {
          prevChapter();
        } else if (ratio > 0.75) {
          nextChapter();
        } else {
          onToggleControls();
        }
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: renderedHtml }}
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
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
});
