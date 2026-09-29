/**
 * Lirune Reader Mobile — Comic Book Archive (CBZ) Reader
 * Loads pages on-demand from ZIP to maintain minimal memory footprint.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Dimensions,
  Text,
} from 'react-native';
import JSZip from 'jszip';
import { Book, ReaderSettings } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'CbzReaderView';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

interface CbzReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  targetCfi?: string | null;
}

export function CbzReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  targetCfi,
}: CbzReaderViewProps) {
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [pageNames, setPageNames] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [pageImageUri, setPageImageUri] = useState<string | null>(null);
  const [isLoadingZip, setIsLoadingZip] = useState<boolean>(true);
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(false);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;
  const isMountedRef = useRef(true);

  // 1. Load archive and build sorted list of image file names
  useEffect(() => {
    isMountedRef.current = true;
    async function loadArchive() {
      setIsLoadingZip(true);
      try {
        const base64 = await fileStorage.readAsBase64(book.filePath);
        const zip = await JSZip.loadAsync(base64, { base64: true });

        const images = Object.keys(zip.files)
          .filter((name) => {
            const ext = name.split('.').pop()?.toLowerCase();
            return ext && IMAGE_EXTENSIONS.includes(ext) && !zip.files[name].dir;
          })
          .sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
          );

        if (isMountedRef.current) {
          setZipInstance(zip);
          setPageNames(images);
          setIsLoadingZip(false);

          // Restore initial page
          let initialPage = 0;
          if (targetCfi && targetCfi.startsWith('page:')) {
            const idx = parseInt(targetCfi.replace('page:', ''), 10);
            if (!isNaN(idx) && idx >= 0 && idx < images.length) {
              initialPage = idx;
            }
          } else if (book.progress && book.progress > 0) {
            initialPage = Math.min(
              images.length - 1,
              Math.floor((book.progress / 100) * images.length)
            );
          }
          setCurrentPageIndex(initialPage);
        }
      } catch (err) {
        logger.error(TAG, `Failed to load CBZ archive: ${book.filePath}`, err);
        if (isMountedRef.current) {
          setIsLoadingZip(false);
        }
      }
    }

    loadArchive();
    return () => {
      isMountedRef.current = false;
      setZipInstance(null);
    };
  }, [book.filePath, book.progress, targetCfi]);

  // 2. Load current page image only (lazy loading to prevent OOM)
  useEffect(() => {
    if (!zipInstance || pageNames.length === 0) return;

    let active = true;
    async function loadCurrentPage() {
      setIsLoadingPage(true);
      const name = pageNames[currentPageIndex];
      const entry = zipInstance?.file(name);

      if (!entry) {
        setIsLoadingPage(false);
        return;
      }

      try {
        const base64 = await entry.async('base64');
        const ext = name.split('.').pop()?.toLowerCase() || 'jpeg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        if (active) {
          setPageImageUri(`data:${mime};base64,${base64}`);
          setIsLoadingPage(false);
        }
      } catch (err) {
        logger.error(TAG, `Failed to read page ${currentPageIndex}: ${name}`, err);
        if (active) setIsLoadingPage(false);
      }
    }

    loadCurrentPage();
    return () => {
      active = false;
    };
  }, [zipInstance, pageNames, currentPageIndex]);

  // 3. Sync progress
  useEffect(() => {
    if (pageNames.length === 0) return;
    const percent = Math.round(((currentPageIndex + 1) / pageNames.length) * 100);
    const cfi = `page:${currentPageIndex}`;
    const chapter = `Page ${currentPageIndex + 1} of ${pageNames.length}`;
    onProgressChange(percent, cfi, chapter);
  }, [currentPageIndex, pageNames.length, onProgressChange]);

  // Tap zones: left 25% prev, right 25% next, center toggle controls
  const handleTap = useCallback(
    (x: number, width: number) => {
      const ratio = x / width;
      if (ratio < 0.25) {
        if (currentPageIndex > 0) {
          setCurrentPageIndex((prev) => prev - 1);
        }
      } else if (ratio > 0.75) {
        if (currentPageIndex < pageNames.length - 1) {
          setCurrentPageIndex((prev) => prev + 1);
        }
      } else {
        onToggleControls();
      }
    },
    [currentPageIndex, pageNames.length, onToggleControls]
  );

  if (isLoadingZip) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.loadingText, { color: palette.muted }]}>
          Opening comic archive...
        </Text>
      </View>
    );
  }

  if (pageNames.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.text }}>No images found in comic archive.</Text>
      </View>
    );
  }

  const screenWidth = Dimensions.get('window').width;

  return (
    <View style={[styles.container, { backgroundColor: '#000000' }]}>
      <TouchableWithoutFeedback
        onPress={(e) => handleTap(e.nativeEvent.locationX, screenWidth)}
      >
        <View style={styles.imageContainer}>
          {pageImageUri ? (
            <Image
              source={{ uri: pageImageUri }}
              style={styles.comicPage}
              resizeMode="contain"
            />
          ) : null}

          {isLoadingPage && (
            <View style={styles.pageLoader}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          )}

          {/* Discreet page indicator floating pill */}
          <View style={styles.floatingPagePill}>
            <Text style={styles.floatingPageText}>
              {currentPageIndex + 1} / {pageNames.length}
            </Text>
          </View>
        </View>
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
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comicPage: {
    width: '100%',
    height: '100%',
  },
  pageLoader: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  floatingPagePill: {
    position: 'absolute',
    bottom: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  floatingPageText: {
    color: '#EEEEEE',
    fontSize: 12,
    fontWeight: '600',
  },
});
