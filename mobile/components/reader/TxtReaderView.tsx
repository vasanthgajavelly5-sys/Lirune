/**
 * Lirune Reader Mobile — Virtualized & Chunked TXT Reader
 *
 * Large TXT files are NEVER loaded into the JS heap in full. On open the reader
 * builds a byte-offset index by streaming the file in fixed-size windows and
 * discarding the decoded text, then only the window covering the visible chunk
 * is held in memory. A 25 MB book costs a few kilobytes of resident text plus a
 * small array of integer offsets.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  Dimensions,
  GestureResponderEvent,
} from 'react-native';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import {
  appendChunkCuts,
  byteLengthOf,
  chunkIndexForByteOffset,
  stripTrailingPartialChar,
} from '@/services/txt/chunkIndex';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'TxtReaderView';
/** How much of the file we pull into memory at a time while indexing/reading. */
const WINDOW_BYTES = 128 * 1024;
const MAX_SEARCH_RESULTS = 50;
/** Vertical movement (px) beyond which a touch is a scroll, not a page turn. */
const TAP_SLOP = 12;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The subset of PanResponder's gesture state this reader needs. */
interface TapGesture {
  dx: number;
  dy: number;
}

interface TxtReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  targetCfi?: string | null;
  searchQuery?: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

export function TxtReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  targetCfi,
  searchQuery,
  onSearchResults,
}: TxtReaderViewProps) {
  const [chunkOffsets, setChunkOffsets] = useState<number[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [chunkText, setChunkText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<number[]>([]);
  const fileSizeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  // 1. Build the chunk index by streaming the file. Text is read in windows and
  //    thrown away; only byte offsets survive.
  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function buildIndex() {
      setIsLoading(true);
      setError(null);
      // Hoisted so the "choose the starting chunk" step below, which runs
      // outside the try/catch, can see them.
      const offsets: number[] = [0];
      let size = 0;
      try {
        size = await fileStorage.getFileSize(book.filePath);
        if (cancelled || !isMountedRef.current) return;

        if (!size) {
          // Empty or unreadable file — still surface something rather than hang.
          offsetsRef.current = [0];
          fileSizeRef.current = 0;
          if (!cancelled) {
            setChunkOffsets([0]);
            setChunkText('');
            setIsLoading(false);
          }
          return;
        }

        let bytePos = 0;
        let windows = 0;

        while (bytePos < size) {
          if (cancelled || !isMountedRef.current) return;

          const window = stripTrailingPartialChar(
            await fileStorage.readRangeAsString(
              book.filePath,
              bytePos,
              WINDOW_BYTES
            )
          );
          if (!window) break;

          // Re-encoding the cleaned window gives the exact byte length, because
          // `bytePos` is always on a character boundary. This is what keeps us
          // from ever splitting a multi-byte character (CJK, emoji) across chunks.
          const windowBytes = byteLengthOf(window);
          const windowEnd = bytePos + windowBytes;

          appendChunkCuts(window, bytePos, offsets);

          bytePos = windowEnd;
          // Give the JS thread a chance to breathe between windows so the
          // progress spinner and back button stay responsive on huge files.
          if (++windows % 4 === 0) await yieldToEventLoop();
        }

        // Drop a trailing offset that points at/after EOF; it would be an
        // empty final chunk.
        while (offsets.length > 1 && offsets[offsets.length - 1] >= size) {
          offsets.pop();
        }

        if (cancelled || !isMountedRef.current) return;

        offsetsRef.current = offsets;
        fileSizeRef.current = size;
        setChunkOffsets(offsets);
      } catch (err) {
        logger.error(TAG, `Failed to index TXT: ${book.filePath}`, err);
        if (!cancelled && isMountedRef.current) {
          setError('Unable to load text content.');
          setIsLoading(false);
        }
        return;
      }

      // 2. Decide the starting chunk, then let the loader effect read the text.
      let start = 0;
      if (targetCfi && targetCfi.startsWith('chunk:')) {
        const idx = parseInt(targetCfi.replace('chunk:', ''), 10);
        if (!isNaN(idx) && idx >= 0 && idx < offsets.length) {
          start = idx;
        }
      } else if (book.progress && book.progress > 0) {
        const wanted = (book.progress / 100) * size;
        start = chunkIndexForByteOffset(offsets, wanted);
        if (start < 0) start = 0;
      }

      if (!cancelled && isMountedRef.current) {
        setCurrentChunkIndex(start);
        setIsLoading(false);
      }
    }

    buildIndex();
    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally runs only when filePath changes to stream index
  }, [book.filePath]);

  // Restore explicitly requested position (TOC/bookmark jumps) after indexing.
  useEffect(() => {
    if (chunkOffsets.length === 0) return;
    if (!targetCfi || !targetCfi.startsWith('chunk:')) return;
    const idx = parseInt(targetCfi.replace('chunk:', ''), 10);
    if (!isNaN(idx) && idx >= 0 && idx < chunkOffsets.length) {
      setCurrentChunkIndex((prev) => (prev === idx ? prev : idx));
    }
  }, [chunkOffsets.length, targetCfi]);

  // 3. Read ONLY the window for the visible chunk.
  useEffect(() => {
    const offsets = offsetsRef.current;
    if (offsets.length === 0) return;

    let cancelled = false;
    async function readChunk() {
      try {
        const start = offsets[currentChunkIndex];
        const end =
          currentChunkIndex + 1 < offsets.length
            ? offsets[currentChunkIndex + 1]
            : fileSizeRef.current;
        const text = await fileStorage.readRangeAsString(
          book.filePath,
          start,
          Math.max(0, end - start)
        );
        if (!cancelled && isMountedRef.current) {
          setChunkText(text.replace(/\uFFFD+$/, ''));
        }
      } catch (err) {
        logger.error(TAG, `Failed to read chunk ${currentChunkIndex}`, err);
        if (!cancelled && isMountedRef.current) setChunkText('');
      }
    }

    readChunk();
    return () => {
      cancelled = true;
    };
  }, [currentChunkIndex, chunkOffsets, book.filePath]);

  // 4. Report progress from the byte offset, so it is accurate for any file size.
  useEffect(() => {
    const offsets = offsetsRef.current;
    if (offsets.length === 0) return;

    const size = fileSizeRef.current;
    const endOffset =
      currentChunkIndex + 1 < offsets.length
        ? offsets[currentChunkIndex + 1]
        : size;
    const percent = size > 0 ? Math.min(100, Math.round((endOffset / size) * 100)) : 0;
    onProgressChange(
      percent,
      `chunk:${currentChunkIndex}`,
      `Section ${currentChunkIndex + 1} of ${offsets.length}`
    );
  }, [currentChunkIndex, chunkOffsets, onProgressChange]);

  // 5. Streaming in-book search. Scans window by window and yields, so a
  //    multi-megabyte file never blocks the UI and is never fully resident.
  useEffect(() => {
    if (!searchQuery || !onSearchResults) return;

    let cancelled = false;
    const offsets = offsetsRef.current;
    const size = fileSizeRef.current;
    // Snapshot into locals so the async body does not depend on prop narrowing.
    const query = searchQuery;
    const report = onSearchResults;

    async function runSearch() {
      const needle = query.toLowerCase();
      if (!needle) {
        report([]);
        return;
      }

      const results: SearchResult[] = [];
      let bytePos = 0;
      let carry = '';

      while (bytePos < size && results.length < MAX_SEARCH_RESULTS) {
        if (cancelled) return;

        const window = await fileStorage.readRangeAsString(
          book.filePath,
          bytePos,
          WINDOW_BYTES
        );
        if (!window) break;

        const windowBytes = byteLengthOf(window);
        const haystack = (carry + window).toLowerCase();

        let from = 0;
        for (;;) {
          const idx = haystack.indexOf(needle, from);
          if (idx === -1) break;

          const excerptStart = Math.max(0, idx - 40);
          const excerptEnd = Math.min(haystack.length, idx + needle.length + 60);
          const excerpt =
            (excerptStart > 0 ? '...' : '') +
            haystack
              .slice(excerptStart, excerptEnd)
              .replace(/\s+/g, ' ') +
            (excerptEnd < haystack.length ? '...' : '');

          // Character index within the haystack -> byte offset in the file.
          const byteOffset =
            bytePos + byteLengthOf(haystack.slice(0, idx));
          const chunkIdx = chunkIndexForByteOffset(offsets, byteOffset);

          results.push({
            cfi: `chunk:${chunkIdx}`,
            excerpt,
            label: `Match at Section ${chunkIdx + 1}`,
          });

          if (results.length >= MAX_SEARCH_RESULTS) break;
          from = idx + Math.max(1, needle.length);
        }

        // Carry the tail so matches spanning a window boundary are still found.
        carry = haystack.slice(Math.max(0, haystack.length - needle.length - 1));
        bytePos += windowBytes;
        await yieldToEventLoop();
      }

      if (!cancelled) report(results);
    }

    runSearch();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, chunkOffsets, book.filePath, onSearchResults]);

  const goToChunk = useCallback(
    (index: number) => {
      const total = offsetsRef.current.length;
      if (index < 0 || index >= total) return;
      setCurrentChunkIndex(index);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    },
    []
  );

  // Tap zones: left 25% prev, right 25% next, centre toggles controls.
  // A PanResponder is used instead of TouchableWithoutFeedback so that dragging
  // to scroll a chunk is no longer mistaken for a page turn.
  const onPrevRef = useRef<() => void>(() => {});
  const onNextRef = useRef<() => void>(() => {});
  const onToggleControlsRef = useRef<() => void>(() => {});

  useEffect(() => {
    onPrevRef.current = () => goToChunk(currentChunkIndex - 1);
    onNextRef.current = () => goToChunk(currentChunkIndex + 1);
    onToggleControlsRef.current = onToggleControls;
  }, [currentChunkIndex, goToChunk, onToggleControls]);

  const handleRelease = useCallback(
    (e: GestureResponderEvent, g: TapGesture) => {
      if (Math.abs(g.dy) > TAP_SLOP || Math.abs(g.dx) > TAP_SLOP) return;
      const width = Dimensions.get('window').width;
      const ratio = e.nativeEvent.locationX / width;
      if (ratio < 0.25) {
        onPrevRef.current();
      } else if (ratio > 0.75) {
        onNextRef.current();
      } else {
        onToggleControlsRef.current();
      }
    },
    []
  );

  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > TAP_SLOP,
        onPanResponderRelease: handleRelease,
      }).panHandlers,
    [handleRelease]
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.loadingText, { color: palette.muted }]}>
          Preparing text…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.text }}>{error}</Text>
      </View>
    );
  }

  const screenWidth = Dimensions.get('window').width;
  void screenWidth;

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <View style={styles.scrollView} {...panHandlers}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: settings.margin + 8 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              styles.bodyText,
              {
                color: palette.text,
                fontSize: settings.fontSize,
                lineHeight: Math.round(settings.fontSize * settings.lineHeight),
                textAlign: settings.alignment,
                fontFamily:
                  settings.fontFamily === 'Monospace'
                    ? 'monospace'
                    : settings.fontFamily === 'Serif'
                    ? 'serif'
                    : 'normal',
              },
            ]}
          >
            {chunkText || 'No text found in this section.'}
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

/** Index of the first entry in `sorted` that is strictly greater than `value`. */

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 36,
  },
  bodyText: {
    letterSpacing: 0.2,
  },
});
