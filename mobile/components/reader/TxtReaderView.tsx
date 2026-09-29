/**
 * Lirune Reader Mobile — Virtualized & Chunked TXT Reader
 * Eliminates large-file rendering stalls via chunked pagination.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { Book, ReaderSettings, SearchResult } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'TxtReaderView';
const CHUNK_SIZE = 4000; // ~800 words per chunk for smooth, instant mobile rendering

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
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  // 1. Load file text
  useEffect(() => {
    let isMounted = true;
    async function loadText() {
      setIsLoading(true);
      try {
        const text = await fileStorage.readAsString(book.filePath);
        if (isMounted) {
          setContent(text);
          setIsLoading(false);
        }
      } catch (err) {
        logger.error(TAG, `Failed to load TXT: ${book.filePath}`, err);
        if (isMounted) {
          setContent('Unable to load text content.');
          setIsLoading(false);
        }
      }
    }
    loadText();
    return () => {
      isMounted = false;
    };
  }, [book.filePath]);

  // 2. Compute chunks cleanly on paragraph/line boundaries
  const chunks = useMemo(() => {
    if (!content) return [];
    const result: string[] = [];
    let start = 0;

    while (start < content.length) {
      let end = start + CHUNK_SIZE;
      if (end >= content.length) {
        result.push(content.substring(start));
        break;
      }

      // Try to break at a newline or space
      const nextNewline = content.indexOf('\n', end);
      const nextSpace = content.indexOf(' ', end);

      if (nextNewline !== -1 && nextNewline - end < 300) {
        end = nextNewline + 1;
      } else if (nextSpace !== -1 && nextSpace - end < 150) {
        end = nextSpace + 1;
      }

      result.push(content.substring(start, end));
      start = end;
    }

    return result;
  }, [content]);

  // 3. Restore location
  useEffect(() => {
    if (chunks.length === 0) return;

    if (targetCfi && targetCfi.startsWith('chunk:')) {
      const idx = parseInt(targetCfi.replace('chunk:', ''), 10);
      if (!isNaN(idx) && idx >= 0 && idx < chunks.length) {
        setCurrentChunkIndex(idx);
        return;
      }
    }

    // Default restore from book progress
    if (book.progress && book.progress > 0) {
      const targetIndex = Math.min(
        chunks.length - 1,
        Math.floor((book.progress / 100) * chunks.length)
      );
      setCurrentChunkIndex(targetIndex);
    }
  }, [chunks.length, targetCfi, book.progress]);

  // 4. Update progress when chunk changes
  useEffect(() => {
    if (chunks.length === 0) return;
    const percent = Math.round(((currentChunkIndex + 1) / chunks.length) * 100);
    const cfi = `chunk:${currentChunkIndex}`;
    const chapter = `Section ${currentChunkIndex + 1} of ${chunks.length}`;
    onProgressChange(percent, cfi, chapter);
  }, [currentChunkIndex, chunks.length, onProgressChange]);

  // 5. In-book search
  useEffect(() => {
    if (!searchQuery || !content || !onSearchResults) return;
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    let pos = 0;
    while (pos < content.length && results.length < 50) {
      const index = content.toLowerCase().indexOf(q, pos);
      if (index === -1) break;

      // Find which chunk this belongs to
      let chunkIdx = Math.floor(index / CHUNK_SIZE);
      if (chunkIdx >= chunks.length) chunkIdx = chunks.length - 1;

      const startExcerpt = Math.max(0, index - 40);
      const endExcerpt = Math.min(content.length, index + q.length + 60);
      const excerpt =
        (startExcerpt > 0 ? '...' : '') +
        content.substring(startExcerpt, endExcerpt).replace(/\s+/g, ' ') +
        (endExcerpt < content.length ? '...' : '');

      results.push({
        cfi: `chunk:${chunkIdx}`,
        excerpt,
        label: `Match at Section ${chunkIdx + 1}`,
      });

      pos = index + Math.max(1, q.length);
    }

    onSearchResults(results);
  }, [searchQuery, content, chunks.length, onSearchResults]);

  // Handle tap zones: Left 25% prev, Right 25% next, Center 50% toggle controls
  const handleTap = useCallback(
    (x: number, width: number) => {
      const ratio = x / width;
      if (ratio < 0.25) {
        // Prev
        if (currentChunkIndex > 0) {
          setCurrentChunkIndex((prev) => prev - 1);
          scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }
      } else if (ratio > 0.75) {
        // Next
        if (currentChunkIndex < chunks.length - 1) {
          setCurrentChunkIndex((prev) => prev + 1);
          scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }
      } else {
        // Center
        onToggleControls();
      }
    },
    [currentChunkIndex, chunks.length, onToggleControls]
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
      </View>
    );
  }

  const currentText = chunks[currentChunkIndex] || 'No text found in this section.';
  const screenWidth = Dimensions.get('window').width;

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <TouchableWithoutFeedback
        onPress={(e) => handleTap(e.nativeEvent.locationX, screenWidth)}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
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
            {currentText}
          </Text>
        </ScrollView>
      </TouchableWithoutFeedback>
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
