/**
 * Lirune Reader Mobile — Root App Navigation Layout
 * Handles app state initialization and Android incoming file intents (open with / share).
 */

import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';


import { ThemeProvider } from '@/theme/ThemeContext';
import { useSettingsStore } from '@/state/settingsStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { fileStorage } from '@/services/storage/FileStorage';
import { ImportService } from '@/services/import/ImportService';
import { logger } from '@/utils/logger';

const TAG = 'RootLayout';

function AppInitializer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loadSettings } = useSettingsStore();
  const { loadLibrary } = useLibraryStore();

  useEffect(() => {
    loadSettings();
    loadLibrary();
    // Housekeeping, off the critical path: an import interrupted by a crash left a
    // `.part` file behind, which is never a usable book.
    void fileStorage.cleanupPartialImports();
  }, [loadSettings, loadLibrary]);

  /**
   * Reading progress must reach the database before the app can be killed.
   *
   * Android gives a backgrounded process no warning, so a position that was still
   * queued when the user swiped the app away was a page the reader lost.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      void useReaderStore.getState().flushPendingProgress();
    });
    return () => subscription.remove();
  }, []);

  const handledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    async function handleIncomingUri(url: string | null) {
      if (!url || handledUrlRef.current === url) return;
      // Check if it is a content:// or file:// URI for an ebook or document
      if (url.startsWith('content://') || url.startsWith('file://')) {
        handledUrlRef.current = url;
        try {
          const cleanUrl = url.split('?')[0].split('#')[0];
          const decoded = decodeURIComponent(cleanUrl);
          const parts = decoded.includes('/') ? decoded.split('/') : decoded.split('%2F');
          let fileName = parts[parts.length - 1] || 'document';
          logger.info(TAG, `Received external file intent: ${fileName} (${url})`);

          let targetUri = url;
          if (targetUri.startsWith('file:///sdcard/')) {
            targetUri = targetUri.replace('file:///sdcard/', 'file:///storage/emulated/0/');
          }

          const res = await ImportService.importFile(targetUri, fileName);
          if (res.success && res.book) {
            await loadLibrary();
            await useReaderStore.getState().openBook(res.book);
            router.push({
              pathname: '/reader',
              params: { bookId: res.book.id },
            });
          }
        } catch (err) {
          logger.error(TAG, 'Failed processing incoming external file intent', err);
        }
      }
    }

    // Cold launch check
    Linking.getInitialURL().then(handleIncomingUri);

    // Warm launch / foreground event listener
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUri(url);
    });

    return () => subscription.remove();
  }, [loadLibrary, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppInitializer>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="reader"
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              animation: 'fade',
            }}
          />
        </Stack>
      </AppInitializer>
    </ThemeProvider>
  );
}
