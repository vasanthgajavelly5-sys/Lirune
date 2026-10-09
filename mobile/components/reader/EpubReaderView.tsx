/**
 * Lirune Reader Mobile — Modern Reflowable EPUB Reader Engine
 * Supports BOTH Discrete Page Mode (horizontal column pagination with swipe & tap turn)
 * and Continuous Scroll Mode (vertical scrolling), with persistent paragraph spacing.
 *
 * All parsing lives in `services/epub/*`. This component owns presentation,
 * session state, and the bridge to the reader WebView.
 *
 * Two invariants drive the design:
 *  - Multi-book isolation: exactly one `EpubArchive` is alive per reader session
 *    and it is disposed before another book is opened.
 *  - Stable reading position: the rendered document lags the live settings by one
 *    position-capture round trip, and the continuous-mode document is frozen at
 *    load time so scrolling never triggers a reload.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useStableInsets } from '@/hooks/useStableInsets';
import { useWebViewRecovery } from '@/hooks/useWebViewRecovery';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { READER_WEBVIEW_PROPS } from '@/services/security/webviewPolicy';
import { parseSelectionMessage, type SelectionPayload } from '@/services/reader/selectionBridge';
import {
  REQUEST_POSITION_JS,
  isReadingPosition,
  restorePositionScript,
  type ReadingPosition,
} from '@/services/reader/readingPosition';
import { EpubArchive } from '@/services/epub/archive';
import { readEpubPackage, type EpubPackage } from '@/services/epub/package';
import { extractChapterDocument, type ChapterDocument } from '@/services/epub/chapter';
import { buildContinuousShell, buildReaderDocument, readerCss } from '@/services/epub/readerDocument';
import { createSpineTarget, parseSpineTarget } from '@/services/epub/navigation';
import { resolveZipHref, archiveDirname } from '@/services/epub/zipPaths';
import { toPlainText } from '@/services/epub/markup';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { getCssFontFamily } from '@/theme/Typography';
import { logger } from '@/utils/logger';
import { validateArchiveBudget } from '@/services/security/archiveBudget';
import { computeReaderLayout } from '@/services/reader/readerLayout';
import { computeReaderGeometry, decideNavigation, type ReaderGeometry } from '@/services/epub/readerGeometry';
import { Book, ReaderSettings, TOCItem, SearchResult } from '@/models/Book';

const TAG = 'EpubReaderView';

/** Chapters kept in memory; a 500-chapter book must not hold 500 rendered strings. */
const CHAPTER_CACHE_LIMIT = 40;

/**
 * Chapters hydrated per round trip by the background drain.
 *
 * Smaller than the on-demand batch because this work happens while the reader
 * is scrolling: it must yield often enough that a fling never waits on it.
 */
const BACKGROUND_BATCH_SIZE = 2;

/** ms between background hydration batches. */
const BACKGROUND_YIELD_MS = 32;

/**
 * Chapters the background drain will inline, nearest the reader first.
 *
 * Demand-driven viewport hydration is primary; the background drain only warms up
 * the immediate vicinity (within ~18 chapters) rather than turning the DOM into an
 * unbounded memory hazard.
 */
const BACKGROUND_CHAPTER_LIMIT = 18;

/**
 * Fallback reveal timer for the first painted frame.
 *
 * The document announces its own first paint; this only covers a document that
 * never does (an older WebView, a script that failed to parse), so the reader is
 * never stuck behind a spinner that cannot finish.
 */
const PAINT_REVEAL_FALLBACK_MS = 900;

/**
 * Longest continuous mode may suppress scroll progress while filling the first
 * chapters. A chapter read that never settles must not leave the document muted
 * for the rest of the session — that is the "reader is stuck but looks fine"
 * report.
 */
const HYDRATION_WATCHDOG_MS = 2500;

/**
 * Chapters that outlive a reader session, keyed by resolved source path.
 *
 * Re-opening a book in continuous scroll mode used to start from an empty shell:
 * every section was a placeholder again and the reader waited for the archive
 * to re-extract what it had already extracted a minute earlier. A handful of
 * chapters per source is cheap — a few hundred kilobytes — and turns the second
 * visit into an instant one.
 */
const SESSION_CACHE_SOURCES = 3;
const SESSION_CACHE_CHAPTERS = 12;

const sessionChapterCache = new Map<string, Map<number, ChapterDocument>>();

function readSessionChapter(sourcePath: string, index: number): ChapterDocument | undefined {
  const perSource = sessionChapterCache.get(sourcePath);
  if (!perSource) return undefined;
  const doc = perSource.get(index);
  if (doc) {
    // Refresh recency so the chapters in use are not the ones evicted.
    perSource.delete(index);
    perSource.set(index, doc);
  }
  return doc;
}

function writeSessionChapter(sourcePath: string, index: number, doc: ChapterDocument): void {
  let perSource = sessionChapterCache.get(sourcePath);
  if (!perSource) {
    perSource = new Map();
    sessionChapterCache.set(sourcePath, perSource);
    while (sessionChapterCache.size > SESSION_CACHE_SOURCES) {
      const oldest = sessionChapterCache.keys().next();
      if (oldest.done) break;
      sessionChapterCache.delete(oldest.value);
    }
  }
  perSource.delete(index);
  perSource.set(index, doc);
  while (perSource.size > SESSION_CACHE_CHAPTERS) {
    const oldest = perSource.keys().next();
    if (oldest.done) break;
    perSource.delete(oldest.value);
  }
}

/** Longest the reader waits for the WebView to answer a position capture. */
const POSITION_CAPTURE_TIMEOUT_MS = 400;

/**
 * How long a geometry change has to stay put before it is applied.
 *
 * A rotation fires `onLayout` several times while the window animates. Applying
 * each one meant capturing the reading position, re-rendering the document and
 * restoring it — three times for a single rotation, which reads as the reader
 * "flinching". Only the settled size is worth a round trip.
 */
const GEOMETRY_SETTLE_MS = 200;

/** Container size changes smaller than this are animation noise. */
const LAYOUT_NOISE_DP = 4;

/** Injected once so hydrated chapters can add their own stylesheets. */
const STYLE_INJECTOR_JS = `
(function () {
  window.__liruneInjectStyles = function (index, sheets) {
    if (!sheets) return;
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (!sheet || !sheet.css) continue;
      var key = sheet.path.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (document.querySelector('style[data-lirune-sheet="' + key + '"]')) continue;
      var element = document.createElement('style');
      element.setAttribute('data-lirune-sheet', key);
      element.setAttribute('data-lirune-chapter', String(index));
      element.textContent = sheet.css;
      var readerCss = document.getElementById('reader-css');
      if (readerCss && readerCss.parentNode) {
        readerCss.parentNode.insertBefore(element, readerCss);
      } else {
        (document.head || document.getElementsByTagName('head')[0]).appendChild(element);
      }
    }
  };
  window.injectChapterStyles = window.__liruneInjectStyles;

  /**
   * Reconciles a hydrated chapter with the header the shell injected for it.
   *
   * The chapter may turn out to carry its own heading, in which case the injected
   * header is hidden; otherwise the marker takes the title resolved from the
   * chapter document, which is far better than a positional label.
   */
  window.__liruneChapterHeader = function (index, hasHeading, title) {
    var section = document.getElementById('chapter-' + index);
    if (!section) return;
    section.setAttribute('data-has-heading', hasHeading ? 'true' : 'false');
    if (hasHeading) return;

    var header = section.querySelector('.chapter-header');
    if (!title) {
      if (header) header.style.display = 'none';
      return;
    }
    if (!header) {
      header = document.createElement('div');
      header.className = 'chapter-header';
      section.insertBefore(header, section.firstChild);
    }
    header.style.display = '';
    var marker = header.querySelector('.chapter-marker');
    if (!marker) {
      marker = document.createElement('h2');
      marker.className = 'chapter-marker';
      header.appendChild(marker);
    }
    marker.textContent = title;
  };
})(); true;
`;

interface EpubReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  onChapterCountLoaded?: (count: number) => void;
  onTOCLoaded?: (toc: TOCItem[]) => void;
  targetCfi?: string | null;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
  onSelectionChange?: (selection: SelectionPayload) => void;
  onContentTextChange?: (html: string) => void;
  isControlsVisible?: boolean;
}

interface ChapterItem {
  id: string;
  href: string;
  /** Title shown in UI lists; never an empty string. */
  title: string;
  /**
   * Title from the book's own navigation document, or '' when the publication
   * never named this spine item. Continuous-mode headers use this so a chapter
   * with no name shows nothing instead of a fabricated "Chapter N".
   */
  navTitle: string;
  itemPath: string;
  /** `linear="no"` items stay reachable but are skipped by chapter turns. */
  linear: boolean;
}

/** Insertion-ordered cache with a hard cap; the oldest entry is dropped first. */
class BoundedCache<T> {
  private readonly map = new Map<number, T>();

  constructor(private readonly limit: number) {}

  get(key: number): T | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  has(key: number): boolean {
    return this.map.has(key);
  }

  set(key: number, value: T): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** One chapter on its way into the continuous-mode DOM. */
interface ChapterPayload {
  index: number;
  body: string;
  sheets: { path: string; css: string }[];
  hasHeading: boolean;
  title: string;
}

/**
 * The geometry actually rendered into the WebView. It lags the live settings by
 * one position-capture round trip so the reading position survives a rotation,
 * a font-size change or a theme switch.
 */
type AppliedGeometry = ReaderGeometry;

/**
 * Nearest spine index in `direction` that is part of the reading flow.
 *
 * `linear="no"` items (cover pages, "about the author" pop-ups, printable
 * fragments) stay in the spine so every chapter id, CFI and TOC entry still
 * addresses the same index, but a page turn must not stop on one.
 */
function findTurnTarget(
  chapters: ChapterItem[],
  from: number,
  direction: 1 | -1,
  requireLinear: boolean
): number | null {
  for (let index = from; index >= 0 && index < chapters.length; index += direction) {
    if (requireLinear && !chapters[index].linear) continue;
    return index;
  }
  return null;
}

export function EpubReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  onChapterCountLoaded,
  onTOCLoaded,
  targetCfi,
  searchQuery,
  onSearchResults,
  onSelectionChange,
  onContentTextChange,
}: EpubReaderViewProps) {
  const insets = useStableInsets();
  const { width: windowWidth, height: windowHeight, fontScale: osFontScale } = useWindowDimensions();
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: windowWidth > 0 ? Math.round(windowWidth) : 0,
    height: windowHeight > 0 ? Math.round(windowHeight) : 0,
  });
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [activeChapter, setActiveChapter] = useState<ChapterDocument | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [startAtEnd, setStartAtEnd] = useState(false);
  const [initialScrollY, setInitialScrollY] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  /** True once the WebView has fired its first onLoadEnd and drawn a real frame. */
  const [webViewPainted, setWebViewPainted] = useState(false);
  /**
   * Continuous mode never re-renders its document while reading: the shell is
   * built once and every later chapter is injected into the live DOM.
   */
  const [continuousSeed, setContinuousSeed] = useState<{
    body: string;
    css: string;
    index: number;
    hasLeadingHeading: boolean;
  } | null>(null);
  const [coverHtml, setCoverHtml] = useState<string | undefined>(undefined);
  /** Mirror of `continuousSeed` for callbacks that must not re-subscribe to it. */
  const continuousSeedRef = useRef(continuousSeed);
  useEffect(() => {
    continuousSeedRef.current = continuousSeed;
  }, [continuousSeed]);

  /**
   * A renderer the system killed leaves an empty reader with no way back. The
   * position is flushed first, then the view is rebuilt and restores from it.
   */
  const recovery = useWebViewRecovery({
    scope: `epub-${book.id}`,
    savePosition: () => {
      const cfi = lastPublishedCfiRef.current;
      if (!cfi) return;
      const percent = Math.min(
        100,
        Math.round(((currentIndexRef.current + 1) / Math.max(1, chaptersRef.current.length)) * 100)
      );
      onProgressChange(percent, cfi, chaptersRef.current[currentIndexRef.current]?.title || '');
    },
  });

  const webViewRef = useRef<WebView>(null);
  const archiveRef = useRef<EpubArchive | null>(null);
  const packageRef = useRef<EpubPackage | null>(null);
  const chapterCacheRef = useRef<BoundedCache<ChapterDocument>>(new BoundedCache(CHAPTER_CACHE_LIMIT));
  const restorePendingRef = useRef(true);
  const continuousDocumentRef = useRef(false);
  const pendingChapterNavigationRef = useRef<number | null>(null);
  const webViewReadyRef = useRef(false);
  const positionToRestoreRef = useRef<ReadingPosition | null>(null);
  /**
   * The last CFI this reader published through `onProgressChange`.
   *
   * `reader.tsx` feeds that value straight back in as `targetCfi`, so treating it
   * as a navigation request would make the reader fight its own page turns: the
   * reader moves to chapter N+1, publishes `spine:N+1`, and the echo is then
   * mistaken for a jump back to N. That feedback loop is an infinite render.
   */
  const lastPublishedCfiRef = useRef<string | null>(null);
  /** Set of recent CFIs published through `onProgressChange` to absorb delayed echoes. */
  const publishedCfisRef = useRef<Set<string>>(new Set());
  /** The last `targetCfi` this reader acted on, so one request runs exactly once. */
  const lastAppliedCfiRef = useRef<string | null>(null);
  const geometryRequestRef = useRef<AppliedGeometry | null>(null);
  /** Pending debounce for the next geometry application. */
  const geometrySettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Reveal timer for the first painted frame. */
  const paintRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Deadline for handing continuous mode back to the document. */
  const hydrationWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Resolved path of the publication currently open; keys the session cache. */
  const sourcePathRef = useRef<string | null>(null);
  /** Chapter indices already present in the continuous-mode DOM. */
  const hydratedRef = useRef<Set<number>>(new Set());
  /** Token that invalidates an in-flight background hydration run. */
  const drainTokenRef = useRef(0);
  /** Timer for the next background hydration batch. */
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const appliedGeometryRef = useRef<AppliedGeometry | null>(null);
  const liveGeometryRef = useRef<ReaderGeometry | null>(null);
  /** Last rendered column count; the hysteresis input for the next decision. */
  const [previousTwoColumn, setPreviousTwoColumn] = useState(false);
  const chaptersRef = useRef<ChapterItem[]>([]);
  const currentIndexRef = useRef(0);
  const currentPageRef = useRef(0);

  const isPaginated = settings.flow !== 'scrolled';
  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  /**
   * Geometry is only meaningful once the container has been measured. A guessed
   * 360x640 first paint is what produced one reflow on every open, so until the
   * real size arrives the reader renders nothing but its loading state.
   *
   * Seed from windowWidth/windowHeight if they are available immediately so the
   * container is considered "measured" on the first render whenever dimensions
   * are already known (common on Android).
   */
  const isMeasured = containerDimensions.width > 0 && containerDimensions.height > 0;

  const liveLayout = useMemo(
    () =>
      computeReaderLayout({
        containerWidth: containerDimensions.width,
        containerHeight: containerDimensions.height,
        insets: { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right },
        fontSize: settings.fontSize,
        userMargin: settings.margin,
        pageGap: settings.pageGap ?? 16,
        fontScale: osFontScale,
      }),
    [
      containerDimensions.width,
      containerDimensions.height,
      insets.top,
      insets.bottom,
      insets.left,
      insets.right,
      settings.fontSize,
      settings.margin,
      settings.pageGap,
      osFontScale,
    ]
  );

  const liveGeometry = useMemo<ReaderGeometry>(
    () => computeReaderGeometry(settings, liveLayout, previousTwoColumn),
    [settings, liveLayout, previousTwoColumn]
  );

  const [appliedGeometry, setAppliedGeometry] = useState<AppliedGeometry>(liveGeometry);

  useEffect(() => {
    appliedGeometryRef.current = appliedGeometry;
    liveGeometryRef.current = liveGeometry;
  }, [appliedGeometry, liveGeometry]);

  useEffect(() => {
    setPreviousTwoColumn(appliedGeometry.twoColumn);
  }, [appliedGeometry.twoColumn]);

  useEffect(() => {
    chaptersRef.current = chapters;
    currentIndexRef.current = currentChapterIndex;
    currentPageRef.current = currentPage;
  }, [chapters, currentChapterIndex, currentPage]);

  useEffect(() => {
    onContentTextChange?.(activeChapter ? `<div class="epub-chapter-content">${activeChapter.body}</div>` : '');
  }, [activeChapter, onContentTextChange]);

  useEffect(() => {
    if (windowWidth > 0 && windowHeight > 0) {
      setContainerDimensions((prev) => {
        if (prev.width === 0 || prev.height === 0) {
          return { width: Math.round(windowWidth), height: Math.round(windowHeight) };
        }
        return prev;
      });
    }
  }, [windowWidth, windowHeight]);

  const handleContainerLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerDimensions((prev) => {
        // A rotation reports a stream of intermediate sizes; anything under this
        // much is animation noise, not a new layout.
        if (Math.abs(prev.width - width) < LAYOUT_NOISE_DP && Math.abs(prev.height - height) < LAYOUT_NOISE_DP) {
          return prev;
        }
        return { width: Math.round(width), height: Math.round(height) };
      });
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Chapter loading                                                          */
  /* ---------------------------------------------------------------------- */

  const loadChapter = useCallback(async (index: number): Promise<ChapterDocument | null> => {
    const archive = archiveRef.current;
    const list = chaptersRef.current;
    const item = list[index];
    const sourcePath = sourcePathRef.current;
    if (!archive || !item) return null;
    const cached = chapterCacheRef.current.get(index);
    if (cached) return cached;
    const shared = sourcePath ? readSessionChapter(sourcePath, index) : undefined;
    if (shared) {
      chapterCacheRef.current.set(index, shared);
      return shared;
    }
    const doc = await extractChapterDocument(archive, item.itemPath, { navigationTitle: item.navTitle });
    // A book switch during extraction invalidates the result.
    if (archiveRef.current !== archive) return null;
    chapterCacheRef.current.set(index, doc);
    if (sourcePath) writeSessionChapter(sourcePath, index, doc);
    return doc;
  }, []);

  /* ---------------------------------------------------------------------- */
  /* WebView hydration                                                        */
  const hydrationRequestSeqRef = useRef(0);
  const pendingHydrationRequestsRef = useRef<Map<number, () => void>>(new Map());

  const injectChapters = useCallback((payload: ChapterPayload[]) => {
    if (payload.length === 0) return Promise.resolve();
    const reqId = ++hydrationRequestSeqRef.current;
    return new Promise<void>((resolve) => {
      // Timeout fallback if DOM acknowledgement fails
      const timer = setTimeout(() => {
        pendingHydrationRequestsRef.current.delete(reqId);
        resolve();
      }, 1500);

      pendingHydrationRequestsRef.current.set(reqId, () => {
        clearTimeout(timer);
        resolve();
      });

      webViewRef.current?.injectJavaScript(`
        (function () {
          var payload = ${JSON.stringify(payload)};
          if (window.__liruneInjectChaptersConfirmed) {
            window.__liruneInjectChaptersConfirmed(payload, ${reqId});
          } else {
            for (var i = 0; i < payload.length; i++) {
              var chapter = payload[i];
              var body = document.getElementById('chapter-body-' + chapter.index);
              var section = document.getElementById('chapter-' + chapter.index);
              if (!body || !section || section.getAttribute('data-loaded') === 'true') continue;
              if (window.__liruneInjectStyles) window.__liruneInjectStyles(chapter.index, chapter.sheets);
              body.innerHTML = chapter.body;
              section.setAttribute('data-loaded', 'true');
            }
            if (window.__liruneScanPending) window.__liruneScanPending(true);
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'chaptersConfirmed',
                requestId: ${reqId},
                indices: payload.map(function(c) { return c.index; })
              }));
            } catch (e) {}
          }
        })(); true;
      `);
    });
  }, []);

  /**
   * Loads and injects the given chapters, skipping any already in the DOM.
   *
   * On-demand hydration is what keeps continuous mode usable: the document asks
   * for the sections near the viewport, and nothing else has to be ready first.
   */
  const hydrateIndices = useCallback(
    async (indices: number[]) => {
      const archive = archiveRef.current;
      if (!archive || indices.length === 0) return;
      const payload: ChapterPayload[] = [];
      const seen = new Set<number>();
      for (const index of indices) {
        if (seen.has(index) || hydratedRef.current.has(index)) continue;
        seen.add(index);
        try {
          const doc = await loadChapter(index);
          if (!doc) continue;
          if (archiveRef.current !== archive) return; // book switched mid-hydration
          hydratedRef.current.add(index);
          payload.push({
            index,
            body: doc.body,
            sheets: doc.stylesheets,
            hasHeading: doc.hasLeadingHeading,
            title: doc.title,
          });
        } catch (err) {
          logger.warn(TAG, `Failed loading continuous chapter ${index}`, err);
        }
      }
      payload.sort((a, b) => a.index - b.index);
      await injectChapters(payload);
    },
    [injectChapters, loadChapter]
  );

  /**
   * Fills the rest of the book in the background.
   *
   * Purely opportunistic: what the reader can see is already loaded, and every
   * batch yields so a fling is never waiting on archive I/O. A run stops at the
   * first sign that the book or the reader changed.
   */
  const startBackgroundDrain = useCallback(() => {
    const archive = archiveRef.current;
    if (!archive) return;
    const pending = chaptersRef.current
      .map((_, index) => index)
      .filter((index) => !hydratedRef.current.has(index));
    if (pending.length === 0) return;

    const center = currentIndexRef.current;
    pending.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    const token = ++drainTokenRef.current;
    let cursor = 0;
    const bounded = pending.slice(0, BACKGROUND_CHAPTER_LIMIT);

    const step = () => {
      if (!mountedRef.current || token !== drainTokenRef.current || archiveRef.current !== archive) return;
      if (cursor >= bounded.length) return;
      const batch = bounded.slice(cursor, cursor + BACKGROUND_BATCH_SIZE);
      cursor += batch.length;
      void hydrateIndices(batch).finally(() => {
        if (!mountedRef.current || token !== drainTokenRef.current || archiveRef.current !== archive) return;
        if (cursor < bounded.length) drainTimerRef.current = setTimeout(step, BACKGROUND_YIELD_MS);
      });
    };

    drainTimerRef.current = setTimeout(step, BACKGROUND_YIELD_MS);
  }, [hydrateIndices]);

  /**
   * Hands the reader back to the document: stops suppressing scroll progress and
   * puts them where they were. Called once the visible chapters exist.
   */
  const finishContinuousHydration = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.__epubHydrating = false; true;');

    const position = positionToRestoreRef.current;
    if (position) {
      positionToRestoreRef.current = null;
      webViewRef.current?.injectJavaScript(restorePositionScript('continuous', position, 80));
    } else {
      webViewRef.current?.injectJavaScript(
        `window.scrollTo(0, ${Math.max(0, initialScrollY)}); window.dispatchEvent(new Event('scroll')); true;`
      );
    }
    startBackgroundDrain();
  }, [initialScrollY, startBackgroundDrain]);

  const revealWebView = useCallback(() => {
    if (paintRevealRef.current) {
      clearTimeout(paintRevealRef.current);
      paintRevealRef.current = null;
    }
    setWebViewPainted(true);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Open the publication                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let isMounted = true;
    const bookPath = book.filePath || book.uri || '';

    async function loadEpub() {
      setIsLoading(true);
      setLoadError(null);
      setWebViewPainted(false); // Reset painted flag so loading overlay shows for the new book
      restorePendingRef.current = true;
      webViewReadyRef.current = false;
      // A new book starts at the beginning: stale scroll/paging state from the
      // previous publication must never carry over.
      setInitialScrollY(0);
      setStartAtEnd(false);
      setCurrentPage(0);
      setContinuousSeed(null);

      // Any hydration still in flight belongs to the previous publication.
      drainTokenRef.current += 1;
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current);
        drainTimerRef.current = null;
      }
      hydratedRef.current = new Set();

      // Multi-book isolation: the previous archive (index, image cache, font
      // cache, chapter cache) is dropped before the next book is touched.
      if (archiveRef.current) {
        archiveRef.current.dispose();
        archiveRef.current = null;
      }
      packageRef.current = null;
      chapterCacheRef.current.clear();
      positionToRestoreRef.current = null;
      geometryRequestRef.current = null;
      lastPublishedCfiRef.current = null;
      lastAppliedCfiRef.current = null;
      setContinuousSeed(null);

      try {
        const buffer = await fileStorage.readAsArrayBuffer(bookPath);
        if (!buffer || buffer.byteLength === 0) {
          throw new Error('EPUB file is empty or missing from storage.');
        }
        const archive = await EpubArchive.open(buffer);
        archiveRef.current = archive;
        sourcePathRef.current = bookPath;
        validateArchiveBudget(archive.budgetEntries());

        const epubPackage = await readEpubPackage(archive);
        packageRef.current = epubPackage;

        const loadedChapters: ChapterItem[] = epubPackage.spine.map((item, index) => {
          const navTitle = epubPackage.chapterTitles[index] || '';
          return {
            id: item.idref,
            href: item.path,
            navTitle,
            title: navTitle || `Section ${index + 1}`,
            itemPath: item.path,
            linear: item.linear,
          };
        });

        const toc: TOCItem[] = epubPackage.toc.length
          ? epubPackage.toc
          : loadedChapters.map((chapter, index) => ({
              id: chapter.id,
              label: chapter.title,
              href: createSpineTarget(index),
            }));

        let initialIdx = 0;
        const savedTarget = targetCfi ? parseSpineTarget(targetCfi) : null;
        if (savedTarget && savedTarget.spineIndex < loadedChapters.length) {
          initialIdx = savedTarget.spineIndex;
          setInitialScrollY(savedTarget.scrollY || 0);
        } else if (book.progress && book.progress > 0) {
          initialIdx = Math.min(loadedChapters.length - 1, Math.floor((book.progress / 100) * loadedChapters.length));
        }

        const initialChapter = await extractChapterDocument(archive, loadedChapters[initialIdx].itemPath, {
          navigationTitle: loadedChapters[initialIdx].navTitle,
        });
        chapterCacheRef.current.set(initialIdx, initialChapter);

        continuousDocumentRef.current = settings.flow === 'scrolled';

        if (isMounted) {
          chaptersRef.current = loadedChapters;
          currentIndexRef.current = initialIdx;
          setChapters(loadedChapters);
          setActiveChapter(initialChapter);
          setCurrentChapterIndex(initialIdx);
          // Adopt the geometry that is current *now* (the container has been
          // measured by this point) so the first render is already correct and
          // the reader never paints once with fallback dimensions.
          if (liveGeometryRef.current && isMeasured) setAppliedGeometry(liveGeometryRef.current);
          if (settings.flow === 'scrolled') {
            let resolvedCoverHtml: string | undefined = undefined;
            if (epubPackage.coverPath) {
              const coverUri = await archive.dataUri(epubPackage.coverPath);
              if (coverUri) {
                resolvedCoverHtml = `<div class="epub-cover-container"><img src="${coverUri}" alt="Cover" style="max-width:100%;max-height:85vh;object-fit:contain;margin:auto;display:block;" /></div>`;
              }
            }
            setCoverHtml(resolvedCoverHtml);
            setContinuousSeed({
              body: initialChapter.body,
              css: initialChapter.css,
              index: initialIdx,
              hasLeadingHeading: initialChapter.hasLeadingHeading === true,
            });
            hydratedRef.current = new Set([initialIdx]);
          }
          if (onTOCLoaded) onTOCLoaded(toc);
          onChapterCountLoaded?.(loadedChapters.length);
          setIsLoading(false);

          if (!continuousDocumentRef.current && initialIdx + 1 < loadedChapters.length) {
            setTimeout(() => {
              if (chapterCacheRef.current.has(initialIdx + 1) || archiveRef.current !== archive) return;
              extractChapterDocument(archive, loadedChapters[initialIdx + 1].itemPath, {
                navigationTitle: loadedChapters[initialIdx + 1].navTitle,
              })
                .then((doc) => {
                  if (archiveRef.current === archive) chapterCacheRef.current.set(initialIdx + 1, doc);
                })
                .catch((err) => logger.warn(TAG, 'Chapter prefetch failed', err));
            }, 300);
          }
        }
      } catch (err: any) {
        logger.error(TAG, `Failed to load EPUB: ${bookPath}`, err);
        if (isMounted) {
          setLoadError(err?.message || 'Unable to open EPUB publication.');
          setIsLoading(false);
        }
      }
    }

    loadEpub();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a reload is keyed on the book path, attempt counter and flow mode
  }, [book.filePath, book.uri, loadAttempt, settings.flow]);

  // Release the archive on unmount and on every book switch.
  useEffect(() => {
    mountedRef.current = true;
    const chapterCache = chapterCacheRef.current;
    return () => {
      mountedRef.current = false;
      drainTokenRef.current += 1;
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current);
        drainTimerRef.current = null;
      }
      if (paintRevealRef.current) {
        clearTimeout(paintRevealRef.current);
        paintRevealRef.current = null;
      }
      if (hydrationWatchdogRef.current) {
        clearTimeout(hydrationWatchdogRef.current);
        hydrationWatchdogRef.current = null;
      }
      if (archiveRef.current) {
        archiveRef.current.dispose();
        archiveRef.current = null;
      }
      chapterCache.clear();
      packageRef.current = null;
    };
  }, [book.filePath, book.uri]);

  /* ---------------------------------------------------------------------- */
  /* Layout-affecting changes: capture → re-render → restore                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (appliedGeometry.key === liveGeometry.key) return;
    if (!webViewReadyRef.current || isLoading) {
      // Nothing meaningful on screen yet — adopt the new geometry immediately.
      setAppliedGeometry(liveGeometry);
      return;
    }
    if (geometryRequestRef.current) return;
    // Debounced: a rotation reports several intermediate sizes in a row and only
    // the last one describes the window the reader will keep.
    geometrySettleRef.current = setTimeout(() => {
      geometrySettleRef.current = null;
      geometryRequestRef.current = liveGeometry;
      webViewRef.current?.injectJavaScript(REQUEST_POSITION_JS);
    }, GEOMETRY_SETTLE_MS);
    return () => {
      if (geometrySettleRef.current) {
        clearTimeout(geometrySettleRef.current);
        geometrySettleRef.current = null;
      }
    };
  }, [appliedGeometry.key, liveGeometry, isLoading]);

  // Safety net: apply the new geometry even if the WebView never answers.
  useEffect(() => {
    if (appliedGeometry.key === liveGeometry.key) return;
    if (!geometryRequestRef.current) return;
    const timer = setTimeout(() => {
      const pending = geometryRequestRef.current;
      if (!pending) return;
      geometryRequestRef.current = null;
      positionToRestoreRef.current = null;
      setAppliedGeometry(pending);
    }, POSITION_CAPTURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [appliedGeometry.key, liveGeometry.key]);

  /* ---------------------------------------------------------------------- */
  /* Real-time Theme & Font Synchronization                                   */
  /* ---------------------------------------------------------------------- */

  const applyThemeToWebView = useCallback(() => {
    if (!webViewReadyRef.current) return;
    try {
      const newCss = readerCss({
        mode: appliedGeometry.mode,
        body: '',
        bookCss: '',
        startAtEnd: false,
        initialScrollY: 0,
        palette: { bg: palette.bg, text: palette.text, muted: palette.muted, link: palette.link },
        fontFamily: getCssFontFamily(settings.fontFamily),
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        alignment: settings.alignment,
        paragraphSpacing: settings.paragraphSpacing || 1.0,
        layout: appliedGeometry.layout,
        twoColumn: appliedGeometry.twoColumn,
      });

      const updateJs = `
        (function() {
          try {
            var el = document.getElementById('reader-css');
            if (el) {
              el.textContent = ${JSON.stringify(newCss)};
              if (el.parentNode && el.nextSibling) {
                el.parentNode.appendChild(el);
              }
            }

            if (document.documentElement) {
              document.documentElement.style.setProperty('background-color', ${JSON.stringify(palette.bg)}, 'important');
              document.documentElement.style.setProperty('color', ${JSON.stringify(palette.text)}, 'important');
            }
            if (document.body) {
              document.body.style.setProperty('background-color', ${JSON.stringify(palette.bg)}, 'important');
              document.body.style.setProperty('color', ${JSON.stringify(palette.text)}, 'important');
              document.body.style.setProperty('font-family', ${JSON.stringify(getCssFontFamily(settings.fontFamily))}, 'important');
            }
          } catch(e) {}
        })(); true;
      `;
      webViewRef.current?.injectJavaScript(updateJs);
    } catch {}
  }, [
    appliedGeometry.mode,
    appliedGeometry.layout,
    appliedGeometry.twoColumn,
    palette.bg,
    palette.text,
    palette.muted,
    palette.link,
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.alignment,
    settings.paragraphSpacing,
  ]);

  useEffect(() => {
    applyThemeToWebView();
  }, [applyThemeToWebView, settings.theme]);

  /* ---------------------------------------------------------------------- */
  /* Keep the active chapter loaded                                           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (chapters.length === 0) return;
    let cancelled = false;
    loadChapter(currentChapterIndex).then((doc) => {
      if (cancelled || !doc) return;
      if (!continuousDocumentRef.current) {
        setActiveChapter((previous) => (previous === doc ? previous : doc));
        setCurrentPage(0);
      } else if (!hydratedRef.current.has(currentChapterIndex)) {
        // Continuous mode has its own DOM: the chapter has to be injected, not
        // just extracted, or the reader scrolls onto an empty section.
        void hydrateIndices([currentChapterIndex]);
      }
    });
    // Warm the neighbours so page turns and fast scrolling do not wait on I/O.
    [currentChapterIndex + 1, currentChapterIndex - 1].forEach((index) => {
      if (index >= 0 && index < chapters.length && !chapterCacheRef.current.has(index)) {
        loadChapter(index).catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentChapterIndex, chapters, hydrateIndices, loadChapter]);

  // Jump to the requested target chapter.
  useEffect(() => {
if (!targetCfi || chapters.length === 0) return;

    const target = parseSpineTarget(targetCfi);
    if (!target) return;
    const decision = decideNavigation({
      targetCfi,
      lastPublishedCfi: lastPublishedCfiRef.current,
      recentPublishedCfis: publishedCfisRef.current,
      lastAppliedCfi: lastAppliedCfiRef.current,
      spineIndex: target.spineIndex,
      chapterCount: chapters.length,
      currentChapterIndex,
      anchor: target.anchor,
    });

    if (decision === 'anchor-only' && !continuousDocumentRef.current && target.anchor) {
      // Same chapter, but the host asked for a specific element.
      webViewRef.current?.injectJavaScript(
        restorePositionScript('paginated', { anchorId: target.anchor, page: currentPageRef.current }, 0)
      );
      return;
    }
    if (decision !== 'navigate') return;

    lastAppliedCfiRef.current = targetCfi;
    const idx = target.spineIndex;

    setCurrentChapterIndex(idx);
    if (!continuousDocumentRef.current) {
      setCurrentPage(0);
      setInitialScrollY(target.scrollY || 0);
      return;
    }

    pendingChapterNavigationRef.current = idx;
    // Fill the target before scrolling to it: scrolling first would land the
    // reader on the placeholder for the length of one archive read.
    void hydrateIndices([idx]).then(() => {
      webViewRef.current?.injectJavaScript(`
        (function () {
          var section = document.getElementById('chapter-${idx}');
          if (!section) return;
          ${
            target.anchor
              ? `var anchor = document.getElementById(${JSON.stringify(target.anchor)});
               (anchor && section.contains(anchor) ? anchor : section).scrollIntoView({ behavior: 'smooth' });`
              : typeof target.scrollY === 'number'
                ? `window.scrollTo(0, ${target.scrollY});`
                : `section.scrollIntoView({ behavior: 'smooth' });`
          }
        })(); true;
      `);
    });
  }, [targetCfi, chapters, currentChapterIndex, hydrateIndices]);

  /* ---------------------------------------------------------------------- */
  /* Progress                                                                 */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (chapters.length === 0) return;
    if (restorePendingRef.current) return;
    if (!isPaginated) return;
    const currentChapter = chapters[currentChapterIndex];
    let percent = Math.round(((currentChapterIndex + 1) / chapters.length) * 100);
    if (totalPages > 1) {
      const chapterFraction = currentPage / Math.max(1, totalPages);
      percent = Math.min(100, Math.round(((currentChapterIndex + chapterFraction) / chapters.length) * 100));
    }
    const cfi = `spine:${currentChapterIndex}`;
    lastPublishedCfiRef.current = cfi;
    onProgressChange(percent, cfi, currentChapter?.title || `Chapter ${currentChapterIndex + 1}`);
  }, [currentChapterIndex, currentPage, totalPages, isPaginated, chapters, onProgressChange]);

  const nextChapter = useCallback(() => {
    const next = findTurnTarget(chaptersRef.current, currentIndexRef.current + 1, 1, true);
    if (next === null) return;
    setStartAtEnd(false);
    setCurrentPage(0);
    setCurrentChapterIndex(next);
  }, []);

  const prevChapter = useCallback((fromEnd: boolean = false) => {
    const previous = findTurnTarget(chaptersRef.current, currentIndexRef.current - 1, -1, true);
    if (previous === null) return;
    setStartAtEnd(fromEnd);
    setCurrentPage(0);
    setCurrentChapterIndex(previous);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Search                                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!searchQuery || chapters.length === 0 || !onSearchResults || !archiveRef.current) return;
    const needle = searchQuery.toLowerCase();
    const results: SearchResult[] = [];
    let cancelled = false;

    async function runSearch() {
      for (let index = 0; index < chaptersRef.current.length && results.length < 50; index++) {
        if (cancelled) return;
        const doc = await loadChapter(index);
        if (!doc) continue;
        const plainText = toPlainText(doc.body);
        let pos = 0;
        while (pos < plainText.length && results.length < 50) {
          const at = plainText.toLowerCase().indexOf(needle, pos);
          if (at === -1) break;
          const start = Math.max(0, at - 30);
          const end = Math.min(plainText.length, at + needle.length + 50);
          results.push({
            cfi: `spine:${index}`,
            excerpt:
              (start > 0 ? '...' : '') +
              plainText.substring(start, end).replace(/\s+/g, ' ') +
              (end < plainText.length ? '...' : ''),
            label: chaptersRef.current[index]?.title || `Chapter ${index + 1}`,
          });
          pos = at + Math.max(1, needle.length);
        }
      }
      if (!cancelled && onSearchResults) onSearchResults(results);
    }

    runSearch();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, chapters, onSearchResults, loadChapter]);

  /* ---------------------------------------------------------------------- */
  /* WebView load                                                             */
  /* ---------------------------------------------------------------------- */

  const handleLoadEnd = useCallback(() => {
    webViewReadyRef.current = true;
    // The document announces its own first paint; this only covers a document
    // that never does.
    if (paintRevealRef.current) clearTimeout(paintRevealRef.current);
    paintRevealRef.current = setTimeout(() => {
      paintRevealRef.current = null;
      setWebViewPainted(true);
    }, PAINT_REVEAL_FALLBACK_MS);
    if (geometryRequestRef.current) {
      // The document reloaded before the capture round trip finished.
      geometryRequestRef.current = null;
    }
    webViewRef.current?.injectJavaScript(STYLE_INJECTOR_JS);
    applyThemeToWebView();

    if (continuousDocumentRef.current) {
      const seedIndex = continuousSeedRef.current?.index ?? currentIndexRef.current;
      // A reloaded document starts with only the shell, and the shell carries
      // exactly one loaded section: the one the seed was built from. Anything
      // that was in the DOM before the reload is gone.
      hydratedRef.current = new Set([seedIndex]);

      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        if (hydrationWatchdogRef.current) {
          clearTimeout(hydrationWatchdogRef.current);
          hydrationWatchdogRef.current = null;
        }
        finishContinuousHydration();
      };
      hydrationWatchdogRef.current = setTimeout(complete, HYDRATION_WATCHDOG_MS);
      // The neighbours are filled first because they are what a reader scrolling
      // off the current chapter runs into next; anything further out waits for
      // the document to ask for it.
      void hydrateIndices([seedIndex - 1, seedIndex + 1]).then(complete, complete);
      return;
    }
    const position = positionToRestoreRef.current;
    if (position) {
      positionToRestoreRef.current = null;
      webViewRef.current?.injectJavaScript(restorePositionScript('paginated', position, 140));
    }
  }, [applyThemeToWebView, finishContinuousHydration, hydrateIndices]);

  /* ---------------------------------------------------------------------- */
  /* Messages                                                                 */
  /* ---------------------------------------------------------------------- */

  const handleMessage = useCallback(
    (event: any) => {
      const selection = parseSelectionMessage(event?.nativeEvent?.data);
      if (selection) {
        onSelectionChange?.(selection);
        return;
      }
      let data: any;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      switch (data.type) {
        case 'readerReady':
          revealWebView();
          break;

        case 'hydrateRequest': {
          const total = chaptersRef.current.length;
          const indices: number[] = Array.isArray(data.indices)
            ? data.indices.filter(
                (value: unknown): value is number =>
                  typeof value === 'number' &&
                  Number.isInteger(value) &&
                  value >= 0 &&
                  value < total
              )
            : [];
          if (indices.length > 0) void hydrateIndices(indices);
          break;
        }

        case 'pageTurn':
          setCurrentPage(data.currentPage);
          setTotalPages(data.totalPages);
          restorePendingRef.current = false;
          break;

        case 'scrollProgress': {
          restorePendingRef.current = false;
          const chapterIndex = Math.min(
            Math.max(0, Number.isFinite(data.chapterIndex) ? data.chapterIndex : currentIndexRef.current),
            Math.max(0, chaptersRef.current.length - 1)
          );
          const pendingChapter = pendingChapterNavigationRef.current;
          if (pendingChapter !== null && chapterIndex !== pendingChapter) break;
          if (pendingChapter !== null) pendingChapterNavigationRef.current = null;
          if (continuousDocumentRef.current && chapterIndex !== currentIndexRef.current) {
            currentIndexRef.current = chapterIndex;
            setCurrentChapterIndex(chapterIndex);
          }
          const overallPercent = Math.min(
            100,
            Math.round(((chapterIndex + data.percent / 100) / Math.max(1, chaptersRef.current.length)) * 100)
          );
          const scrollCfi = `spine:${chapterIndex}:scroll:${Math.max(0, Math.round(data.scrollY || 0))}`;
          lastPublishedCfiRef.current = scrollCfi;
          publishedCfisRef.current.add(scrollCfi);
          if (publishedCfisRef.current.size > 120) {
            const first = publishedCfisRef.current.values().next().value;
            if (first) publishedCfisRef.current.delete(first);
          }
          onProgressChange(overallPercent, scrollCfi, chaptersRef.current[chapterIndex]?.title || `Chapter ${chapterIndex + 1}`);
          break;
        }

        case 'pageBoundary':
          if (data.boundary === 'prev') prevChapter(true);
          else nextChapter();
          break;

        // Late-arriving fonts, images or a resize can change the page count after
        // the reader already showed "Page 3 of 20" in the footer.
        case 'pageCount':
          if (Number.isFinite(data.totalPages) && data.totalPages > 0) {
            setTotalPages(data.totalPages);
          }
          break;

        case 'toggleControls':
          onToggleControls();
          break;

        case 'prevChapter':
          prevChapter(false);
          break;

        case 'nextChapter':
          nextChapter();
          break;

        case 'chaptersConfirmed': {
          if (typeof data.requestId === 'number') {
            const cb = pendingHydrationRequestsRef.current.get(data.requestId);
            if (cb) {
              pendingHydrationRequestsRef.current.delete(data.requestId);
              cb();
            }
          }
          break;
        }

        case 'internalLink': {
          const rawHref = data.href;
          if (!rawHref || typeof rawHref !== 'string') break;

          const currentSpineItem = chaptersRef.current[currentIndexRef.current];
          const baseDir = currentSpineItem ? archiveDirname(currentSpineItem.itemPath) : '';
          const resolved = resolveZipHref(baseDir, rawHref);

          let targetSpineIdx = -1;
          if (!resolved.path || resolved.path === currentSpineItem?.itemPath) {
            targetSpineIdx = currentIndexRef.current;
          } else {
            const normPath = resolved.path.toLowerCase();
            targetSpineIdx = chaptersRef.current.findIndex(
              (ch) => ch.itemPath.toLowerCase() === normPath
            );
          }

          if (targetSpineIdx !== -1) {
            const targetCfi = createSpineTarget(targetSpineIdx, resolved.fragment);
            lastAppliedCfiRef.current = null; // Ensure navigation takes effect
            setCurrentChapterIndex(targetSpineIdx);

            if (!continuousDocumentRef.current) {
              setCurrentPage(0);
              if (resolved.fragment) {
                setTimeout(() => {
                  webViewRef.current?.injectJavaScript(
                    restorePositionScript('paginated', { anchorId: resolved.fragment, page: 0 }, 0)
                  );
                }, 100);
              }
            } else {
              pendingChapterNavigationRef.current = targetSpineIdx;
              void hydrateIndices([targetSpineIdx]).then(() => {
                webViewRef.current?.injectJavaScript(`
                  (function () {
                    var section = document.getElementById('chapter-${targetSpineIdx}');
                    if (!section) return;
                    ${
                      resolved.fragment
                        ? `var anchor = document.getElementById(${JSON.stringify(resolved.fragment)});
                         (anchor && section.contains(anchor) ? anchor : section).scrollIntoView({ behavior: 'smooth' });`
                        : `section.scrollIntoView({ behavior: 'smooth' });`
                    }
                  })(); true;
                `);
              });
            }
          }
          break;
        }

        case 'readingPosition': {
          if (isReadingPosition(data.position)) {
            positionToRestoreRef.current = data.position;
          }
          if (geometryRequestRef.current) {
            const nextGeo = geometryRequestRef.current;
            geometryRequestRef.current = null;
            setAppliedGeometry(nextGeo);
          }
          break;
        }

        default:
          break;
      }
    },
    [hydrateIndices, nextChapter, onProgressChange, onSelectionChange, onToggleControls, prevChapter, revealWebView]
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                   */
  /* ---------------------------------------------------------------------- */

  const geometry = appliedGeometry;
  const renderSettings = geometry.settings;

  const bodyHtml =
    geometry.mode === 'continuous'
      ? continuousSeed
        ? buildContinuousShell(
            chapters.length,
            chapters.map((chapter) => chapter.navTitle),
            continuousSeed.index,
            continuousSeed.body,
            {
              activeHasLeadingHeading: continuousSeed.hasLeadingHeading,
              coverHtml,
            }
          )
        : '<p>Loading…</p>'
      : `<div class="epub-chapter-content">${activeChapter?.body ?? '<p>Loading…</p>'}</div>`;

  const bookCss =
    geometry.mode === 'continuous' ? (continuousSeed?.css ?? '') : (activeChapter?.css ?? '');

  const renderedHtml = useMemo(() => {
    return buildReaderDocument({
      mode: geometry.mode,
      bookCss,
      body: bodyHtml,
      palette: {
        bg: palette.bg,
        text: palette.text,
        muted: palette.muted,
        link: palette.link,
      },
      fontFamily: getCssFontFamily(renderSettings.fontFamily),
      fontSize: renderSettings.fontSize,
      lineHeight: renderSettings.lineHeight,
      alignment: renderSettings.alignment,
      paragraphSpacing: renderSettings.paragraphSpacing || 1.0,
      layout: geometry.layout,
      twoColumn: geometry.twoColumn,
      startAtEnd,
      initialScrollY,
    });
  }, [
    geometry.mode,
    geometry.layout,
    geometry.twoColumn,
    bookCss,
    bodyHtml,
    palette.bg,
    palette.text,
    palette.muted,
    palette.link,
    renderSettings.fontFamily,
    renderSettings.fontSize,
    renderSettings.lineHeight,
    renderSettings.alignment,
    renderSettings.paragraphSpacing,
    startAtEnd,
    initialScrollY,
  ]);

  const webViewSource = useMemo(() => ({ html: renderedHtml }), [renderedHtml]);

  if (isLoading || !isMeasured) {
    // Nothing is painted until the container has been measured: a guessed 360x640
    // first frame is a visible reflow a few milliseconds later.
    return (
      <View
        style={[styles.container, styles.centered, { backgroundColor: palette.bg }]}
        onLayout={handleContainerLayout}
      >
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.loadingText, { color: palette.muted }]}>Opening book…</Text>
      </View>
    );
  }

  if (loadError || chapters.length === 0) {
    const canRetry = loadAttempt < 3;
    return (
      <View
        style={[styles.container, styles.centered, { backgroundColor: palette.bg, padding: 32 }]}
        onLayout={handleContainerLayout}
      >
        <Ionicons name="alert-circle-outline" size={48} color={palette.link} />
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to Read Publication</Text>
        <Text style={[styles.errorMessage, { color: palette.muted }]}>
          {loadError || 'No readable chapters or content found in this EPUB file.'}
        </Text>
        {canRetry ? (
          <TouchableOpacity
            style={[styles.errorBtn, { backgroundColor: palette.link }]}
            onPress={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            <Text style={styles.errorBtnText}>Retry ({3 - loadAttempt} left)</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.errorMessage, { color: palette.muted, marginTop: 12 }]}>
            Maximum retry attempts reached. Please return to Library.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} onLayout={handleContainerLayout}>
      {/* The opaque background is always on the container to prevent any flash
          of transparent/noisy frames before the WebView first-paints. */}
      <WebView
        ref={webViewRef}
        key={`${geometry.mode}-${loadAttempt}-${book.filePath || book.uri || ''}-${recovery.reloadKey}`}
        {...READER_WEBVIEW_PROPS}
        {...recovery.recoveryProps}
        source={webViewSource}
        style={[{ flex: 1, opacity: webViewPainted ? 1 : 0 }, { backgroundColor: palette.bg }]}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        scrollEnabled={geometry.mode === 'continuous'}
        showsVerticalScrollIndicator={false}
      />
      {/* Loading overlay shown until first paint to prevent noise/grid artifacts */}
      {!webViewPainted && (
        <View style={[StyleSheet.absoluteFill, styles.centered, { backgroundColor: palette.bg }]}>
          <ActivityIndicator size="large" color={palette.link} />
          <Text style={[styles.loadingText, { color: palette.muted }]}>Opening book…</Text>
        </View>
      )}

      {recovery.isRecovering && (
        <View style={styles.recoveryBanner}>
          <ActivityIndicator size="small" color={palette.link} />
          <Text style={[styles.recoveryText, { color: palette.muted }]}>
            The renderer was closed by the system. Restoring your place…
          </Text>
        </View>
      )}

      {geometry.mode === 'paginated' && totalPages > 0 && (
        <View style={[styles.pageFooter, { bottom: Math.max(insets.bottom, 12) + 6 }]} pointerEvents="none">
          <Text style={[styles.pageFooterText, { color: palette.muted }]}>
            {geometry.twoColumn
              ? `Cols ${currentPage * 2 + 1}–${currentPage * 2 + 2} / ${totalPages * 2}`
              : `${currentPage + 1} / ${totalPages}`}{' '}
            • Ch {currentChapterIndex + 1}/{chapters.length}
            {geometry.twoColumn ? ' • 2-col' : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  recoveryBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  recoveryText: { fontSize: 13 },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorTitle: { marginTop: 16, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorMessage: { marginTop: 8, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  errorBtn: { marginTop: 24, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  errorBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  pageFooter: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageFooterText: { fontSize: 11, letterSpacing: 0.3, fontWeight: '500', opacity: 0.7 },
});