/**
 * Lirune Reader Mobile — Comic Book Archive (CBR) Reader
 * Unpacks comic page images from RAR archives into temporary cache
 * and renders pages with page-turns and zoom.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
  Text,
} from 'react-native';
import { useStableInsets } from '@/hooks/useStableInsets';
import * as FileSystem from 'expo-file-system/legacy';
import { fileStorage } from '@/services/storage/FileStorage';
import { Book, ReaderSettings } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { RarExtractor } from '@/services/archive/RarExtractor';
import { logger } from '@/utils/logger';

const TAG = 'CbrReaderView';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const TAP_SLOP = 12;
const MAX_CBR_BYTES = 150 * 1024 * 1024; // 150MB safeguard

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

interface CbrReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange: (percent: number, cfi?: string, chapter?: string) => void;
  targetCfi?: string | null;
}

export function CbrReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
  targetCfi,
}: CbrReaderViewProps) {
  const insets = useStableInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [pageUris, setPageUris] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;
  const isMountedRef = useRef(true);
  const restoredRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function loadCbr() {
      restoredRef.current = false;
      setIsLoading(true);
      setLoadError(null);
      setPageUris([]);
      setCurrentPageIndex(0);
      try {
        const filePath = book.filePath || book.uri || '';
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists && fileInfo.size && fileInfo.size > MAX_CBR_BYTES) {
          throw new Error(`Comic archive is too large (${Math.round(fileInfo.size / (1024 * 1024))} MB). Maximum supported size is 150 MB.`);
        }

        const buffer = await fileStorage.readAsArrayBuffer(filePath);
        const bytes = new Uint8Array(buffer);

        const entries = RarExtractor.inspect(bytes);
        const allCandidates = entries.filter((e) => {
          const ext = e.name.split('.').pop()?.toLowerCase();
          return ext && IMAGE_EXTENSIONS.includes(ext);
        });

        if (allCandidates.length === 0) {
          throw new Error('No images found in CBR archive.');
        }

        const imageEntries = allCandidates
          .filter((e) => e.isStored && e.data && e.data.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (imageEntries.length === 0) {
          throw new Error('Compressed RAR/CBR archives are not supported. Only uncompressed (store-only) CBR archives or CBZ archives are supported.');
        }

        const cacheRoot = `${FileSystem.cacheDirectory || ''}cbr-${book.id}/`;
        const dirInfo = await FileSystem.getInfoAsync(cacheRoot);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(cacheRoot, { intermediates: true });
        }

        const uris: string[] = [];
        for (let i = 0; i < imageEntries.length; i++) {
          if (cancelled || !isMountedRef.current) return;
          const entry = imageEntries[i];
          const ext = (entry.name.split('.').pop() || 'jpg').toLowerCase();
          const destPath = `${cacheRoot}${String(i).padStart(5, '0')}.${ext}`;

          const info = await FileSystem.getInfoAsync(destPath);
          if (!info.exists && entry.data.length > 0) {
            const b64 = uint8ArrayToBase64(entry.data);
            await FileSystem.writeAsStringAsync(destPath, b64, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }
          uris.push(destPath);
        }

        if (cancelled || !isMountedRef.current) return;

        setPageUris(uris);
        setIsLoading(false);
      } catch (err: any) {
        logger.error(TAG, 'Failed to extract CBR archive', err);
        if (!cancelled && isMountedRef.current) {
          let userMsg = err?.message || 'Unable to open comic archive.';
          if (/RAR5/i.test(userMsg)) {
            userMsg = 'RAR5 archives are not supported. Please convert to CBZ or uncompressed CBR.';
          }
          setLoadError(userMsg);
          setIsLoading(false);
        }
      }
    }

    loadCbr();
    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [book.filePath, book.uri, book.id]);

  useEffect(() => {
    if (restoredRef.current || pageUris.length === 0) return;
    restoredRef.current = true;

    let initialPage = 0;
    if (targetCfi?.startsWith('page:')) {
      const index = Number.parseInt(targetCfi.slice('page:'.length), 10);
      if (Number.isFinite(index) && index >= 0 && index < pageUris.length) {
        initialPage = index;
      }
    } else if (book.progress > 0) {
      initialPage = Math.min(
        pageUris.length - 1,
        Math.max(0, Math.round((book.progress / 100) * pageUris.length) - 1)
      );
    }

    setCurrentPageIndex(initialPage);
  }, [pageUris.length, targetCfi, book.progress]);

  const goToNextPage = () => {
    if (currentPageIndex < pageUris.length - 1) {
      const next = currentPageIndex + 1;
      setCurrentPageIndex(next);
      const percent = Math.round(((next + 1) / pageUris.length) * 100);
      onProgressChange(percent, `page:${next}`, `Page ${next + 1} of ${pageUris.length}`);
    }
  };

  const goToPrevPage = () => {
    if (currentPageIndex > 0) {
      const prev = currentPageIndex - 1;
      setCurrentPageIndex(prev);
      const percent = Math.round(((prev + 1) / pageUris.length) * 100);
      onProgressChange(percent, `page:${prev}`, `Page ${prev + 1} of ${pageUris.length}`);
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderRelease: (_, gestureState) => {
      const { dx, dy, x0 } = gestureState;
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
        if (x0 < windowWidth * 0.3) {
          goToPrevPage();
        } else if (x0 > windowWidth * 0.7) {
          goToNextPage();
        } else {
          onToggleControls();
        }
      } else if (dx < -40) {
        goToNextPage();
      } else if (dx > 40) {
        goToPrevPage();
      }
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.statusText, { color: palette.muted }]}>Extracting CBR comic pages...</Text>
      </View>
    );
  }

  if (loadError || pageUris.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Unable to open CBR Comic</Text>
        <Text style={[styles.statusText, { color: palette.muted }]}>{loadError || 'No pages found in archive.'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} {...panResponder.panHandlers}>
      <Image
        source={{ uri: pageUris[currentPageIndex] }}
        style={styles.image}
        resizeMode="contain"
      />
      <View style={[styles.pageIndicator, { bottom: Math.max(insets.bottom, 16) + 12 }]}>
        <Text style={styles.pageIndicatorText}>
          {currentPageIndex + 1} / {pageUris.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pageIndicatorText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
