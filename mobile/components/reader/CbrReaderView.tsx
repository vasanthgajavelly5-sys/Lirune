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
  Dimensions,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { Book, ReaderSettings } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { RarExtractor } from '@/services/archive/RarExtractor';
import { logger } from '@/utils/logger';

const TAG = 'CbrReaderView';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const TAP_SLOP = 12;

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
  const insets = useSafeAreaInsets();
  const [pageUris, setPageUris] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.sepia;
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function loadCbr() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const filePath = book.filePath || book.uri || '';
        const base64 = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const entries = RarExtractor.inspect(bytes);
        const imageEntries = entries
          .filter((e) => {
            const ext = e.name.split('.').pop()?.toLowerCase();
            return ext && IMAGE_EXTENSIONS.includes(ext);
          })
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (imageEntries.length === 0) {
          throw new Error('No images found in CBR archive.');
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
            let b64 = '';
            for (let b = 0; b < entry.data.length; b++) {
              b64 += String.fromCharCode(entry.data[b]);
            }
            await FileSystem.writeAsStringAsync(destPath, btoa(b64), {
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
          setLoadError(err?.message || 'Unable to open comic archive.');
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
        const screenWidth = Dimensions.get('window').width;
        if (x0 < screenWidth * 0.3) {
          goToPrevPage();
        } else if (x0 > screenWidth * 0.7) {
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
