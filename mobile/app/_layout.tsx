/**
 * Lirune Reader Mobile — Root App Navigation Layout
 * Handles app state initialization and Android incoming file intents (open with / share).
 */

import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { ThemeProvider } from '@/theme/ThemeContext';
import { useSettingsStore } from '@/state/settingsStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
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
  }, [loadSettings, loadLibrary]);

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
          let fileName = parts[parts.length - 1] || 'book.epub';
          if (!fileName.includes('.')) {
            fileName = `${fileName}.epub`;
          }
          logger.info(TAG, `Received external file intent: ${fileName} (${url})`);

          const res = await ImportService.importFile(url, fileName);
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