/**
 * Lirune Reader Mobile — Comic Book Archive (CBZ) Reader
 *
 * The archive is read exactly once per book. On open it is opened as raw bytes
 * (not base64, which would cost ~33% extra heap) and each page image is
 * extracted to the cache directory. The in-memory zip is then released, so
 * memory does not grow with page turns and a 150 MB comic does not stay
 * resident for the whole reading session.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  Dimensions,
  Text,
  GestureResponderEvent,
} from 'react-native';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FsFile } from 'expo-file-system';
import { Book, ReaderSettings } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { logger } from '@/utils/logger';

const TAG = 'CbzReaderView';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const TAP_SLOP = 12;

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

/** The subset of PanResponder's gesture state this reader needs. */
interface TapGesture {
  dx: number;
  dy: number;
}

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
  const [pageNames, setPageNames] = useState<string[]>([]);
  const [pageUris, setPageUris] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [isLoadingZip, setIsLoadingZip] = useState<boolean>(true);
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;
  const isMountedRef = useRef(true);
  // `targetCfi` / `book.progress` change every time progress is written, so the
  // archive load must key off the file identity ONLY. Previously this effect
  // depended on `targetCfi`, which re-decoded the whole archive on every page
  // turn.
  const pageNamesRef = useRef<string[]>([]);
  const pageUrisRef = useRef<string[]>([]);
  const restoredRef = useRef(false);

  // 1. Open the archive once and extract every page to the cache directory.
  useEffect(() => {
    isMountedRef.current = true;
    restoredRef.current = false;
    let cancelled = false;

    async function loadArchive() {
      setIsLoadingZip(true);
      setLoadError(null);
      try {
        const cacheRoot = `${FileSystem.cacheDirectory || ''}cbz-${book.id}/`;
        const existing = await FileSystem.getInfoAsync(cacheRoot);
        if (!existing.exists) {
          await FileSystem.makeDirectoryAsync(cacheRoot, { intermediates: true });
        }

        // Read as raw bytes. `readAsBase64` would materialise a base64 string
        // ~1.33x the archive size in the JS heap first.
        const buffer = await new FsFile(book.filePath).arrayBuffer();
        const zip = await JSZip.loadAsync(new Uint8Array(buffer));

        const images = Object.keys(zip.files)
          .filter((name) => {
            const ext = name.split('.').pop()?.toLowerCase();
            return ext && IMAGE_EXTENSIONS.includes(ext) && !zip.files[name].dir;
          })
          .sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
          );

        if (cancelled || !isMountedRef.current) return;

        if (images.length === 0) {
          setPageNames([]);
          setPageUris([]);
          pageNamesRef.current = [];
          pageUrisRef.current = [];
          setIsLoadingZip(false);
          return;
        }

        const uris: string[] = [];
        for (let i = 0; i < images.length; i++) {
          if (cancelled || !isMountedRef.current) return;

          const name = images[i];
          const ext = (name.split('.').pop() || 'jpg').toLowerCase();
          // Flatten to a stable cache filename so nested folders in the archive
          // cannot escape the cache directory or collide.
          const flatName = `${String(i).padStart(5, '0')}.${ext}`;
          const destPath = `${cacheRoot}${flatName}`;

          const info = await FileSystem.getInfoAsync(destPath);
          if (!info.exists) {
            const entry = zip.file(name);
            if (!entry) {
              uris.push('');
              continue;
            }
            const b64 = await entry.async('base64');
            await FileSystem.writeAsStringAsync(destPath, b64, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }
          uris.push(destPath);

          if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
        }

        if (cancelled || !isMountedRef.current) return;

        pageNamesRef.current = images;
        pageUrisRef.current = uris;
        setPageNames(images);
        setPageUris(uris);
        setIsLoadingZip(false);
      } catch (err) {
        logger.error(TAG, `Failed to load CBZ archive: ${book.filePath}`, err);
        if (!cancelled && isMountedRef.current) {
          setLoadError('Unable to open comic archive.');
          setIsLoadingZip(false);
        }
      }
    }

    loadArchive();
    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [book.filePath, book.id]);

  // 2. Restore the saved page, once, after the page list is known.
  useEffect(() => {
    if (restoredRef.current || pageNames.length === 0) return;
    restoredRef.current = true;

    let initialPage = 0;
    if (targetCfi && targetCfi.startsWith('page:')) {
      const idx = parseInt(targetCfi.replace('page:', ''), 10);
      if (!isNaN(idx) && idx >= 0 && idx < pageNames.length) {
        initialPage = idx;
      }
    } else if (book.progress && book.progress > 0) {
      initialPage = Math.min(
        pageNames.length - 1,
        Math.floor((book.progress / 100) * pageNames.length)
      );
    }
    setCurrentPageIndex(initialPage);
  }, [pageNames.length, targetCfi, book.progress]);

  // 3. Show a spinner while the current page file settles.
  useEffect(() => {
    if (pageUris.length === 0) return;
    setIsLoadingPage(true);
    const timer = setTimeout(() => setIsLoadingPage(false), 120);
    return () => clearTimeout(timer);
  }, [currentPageIndex, pageUris.length]);

  // 4. Sync progress
  useEffect(() => {
    const total = pageNamesRef.current.length;
    if (total === 0) return;
    const percent = Math.round(((currentPageIndex + 1) / total) * 100);
    onProgressChange(
      percent,
      `page:${currentPageIndex}`,
      `Page ${currentPageIndex + 1} of ${total}`
    );
  }, [currentPageIndex, pageNames, onProgressChange]);

  const goToPage = useCallback((index: number) => {
    const total = pageNamesRef.current.length;
    if (index < 0 || index >= total) return;
    setCurrentPageIndex(index);
  }, []);

  // Tap zones: left 25% prev, right 25% next, centre toggle controls.
  const onPrevRef = useRef<() => void>(() => {});
  const onNextRef = useRef<() => void>(() => {});
  const onToggleControlsRef = useRef<() => void>(() => {});

  useEffect(() => {
    onPrevRef.current = () => goToPage(currentPageIndex - 1);
    onNextRef.current = () => goToPage(currentPageIndex + 1);
    onToggleControlsRef.current = onToggleControls;
  }, [currentPageIndex, goToPage, onToggleControls]);

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

  /* eslint-disable react-hooks/refs --
     PanResponder.create() is documented by React Native to run during render.
     The handlers it produces only read stable refs (onPrevRef/onNextRef/
     onToggleControlsRef), so no render-time value is actually captured. */
  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > TAP_SLOP,
        onPanResponderRelease: handleRelease,
      }).panHandlers,
    [handleRelease]
  );
  /* eslint-enable react-hooks/refs */

  if (isLoadingZip) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
        <Text style={[styles.loadingText, { color: palette.muted }]}>
          Opening comic archive…
        </Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.text }}>{loadError}</Text>
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

  const currentUri = pageUris[currentPageIndex] || '';
  const ext = (pageNames[currentPageIndex].split('.').pop() || 'jpg').toLowerCase();

  return (
    <View style={[styles.container, { backgroundColor: '#000000' }]}>
      <View style={styles.imageContainer} {...panHandlers}>
        {currentUri ? (
          <Image
            source={{ uri: currentUri }}
            style={styles.comicPage}
            resizeMode="contain"
            accessibilityLabel={`Page ${currentPageIndex + 1}`}
          />
        ) : null}

        {isLoadingPage && (
          <View style={styles.pageLoader}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}

        <View style={styles.floatingPagePill}>
          <Text style={styles.floatingPageText}>
            {currentPageIndex + 1} / {pageNames.length}
          </Text>
        </View>
      </View>
      <View style={styles.hidden} accessible={false}>
        <Text>{MIME_BY_EXT[ext] ?? ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hidden: {
    width: 0,
    height: 0,
    opacity: 0,
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
