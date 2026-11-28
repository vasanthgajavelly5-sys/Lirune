/**
 * Lirune Reader Mobile — Standalone Image Reader View Component
 * Supports JPG, PNG, WEBP, TIFF, BMP, GIF, AVIF, SVG, HEIC/HEIF.
 * Provides pinch-to-zoom, pan, fit-to-width/screen, theme background, and controls toggle.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
  Text,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Book, ReaderSettings } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { toFileUri } from '@/services/storage/FileStorage';
import { logger } from '@/utils/logger';
import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '@/services/security/webviewPolicy';
import { sanitizeHtml } from '@/services/security/sanitizeHtml';

const TAG = 'ImageReaderView';
const TAP_SLOP = 12;

interface ImageReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onToggleControls: () => void;
  onProgressChange?: (percent: number, cfi?: string, chapter?: string) => void;
}

export function ImageReaderView({
  book,
  settings,
  onToggleControls,
  onProgressChange,
}: ImageReaderViewProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);

  const palette = READER_THEMES[settings.theme] || READER_THEMES.night;

  useEffect(() => {
    let active = true;
    async function loadImage() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const rawPath = book.filePath || book.uri || '';
        const uri = toFileUri(rawPath);
        if (book.format === 'svg') {
          const source = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
          const sanitized = sanitizeHtml(source);
          if (!/^<svg[\s>]/i.test(sanitized.trim())) throw new Error('Invalid SVG document.');
          if (active) {
            setSvgMarkup(sanitized);
            setImageUri(null);
            setIsLoading(false);
            onProgressChange?.(100, 'page:1', 'SVG Image');
          }
          return;
        }
        if (active) {
          setSvgMarkup(null);
          setImageUri(uri);
          setIsLoading(false);
          onProgressChange?.(100, 'page:1', 'Image');
        }
      } catch (err: any) {
        logger.error(TAG, 'Failed to resolve image path', err);
        if (active) {
          setLoadError(err?.message || 'Failed to open image file.');
          setIsLoading(false);
        }
      }
    }
    loadImage();
    return () => {
      active = false;
    };
  }, [book.filePath, book.uri, book.format, onProgressChange]);

  const tapStartRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          tapStartRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        },
        onPanResponderRelease: (evt) => {
          const dx = Math.abs(evt.nativeEvent.pageX - tapStartRef.current.x);
          const dy = Math.abs(evt.nativeEvent.pageY - tapStartRef.current.y);
          if (dx < TAP_SLOP && dy < TAP_SLOP) {
            onToggleControls();
          }
        },
      }),
    [onToggleControls]
  );

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorText, { color: palette.text }]}>{loadError}</Text>
      </View>
    );
  }

  if (isLoading || !imageUri) {
    if (svgMarkup) {
      return (
        <View style={[styles.container, { backgroundColor: palette.bg }]}>
          <WebView
            source={{ html: `<html><body style="margin:0;background:${palette.bg};display:flex;align-items:center;justify-content:center">${svgMarkup}</body></html>` }}
            {...READER_WEBVIEW_PROPS}
            onShouldStartLoadWithRequest={allowReaderNavigation}
            onMessage={onToggleControls}
            style={{ backgroundColor: palette.bg }}
          />
        </View>
      );
    }
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.link} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} {...panResponder.panHandlers}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            minHeight: windowHeight,
          },
        ]}
        maximumZoomScale={4.0}
        minimumZoomScale={1.0}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { width: windowWidth, height: windowHeight * 0.85 }]}
          resizeMode="contain"
          onError={(e) => {
            logger.warn(TAG, 'Image rendering failed in viewer', e?.nativeEvent);
            setLoadError('Unable to display image preview.');
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    alignSelf: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
