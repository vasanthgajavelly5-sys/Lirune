/**
 * Lirune Reader Mobile — Root App Navigation Layout
 * Handles app state initialization and Android incoming file intents (open with / share).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';

import { ThemeProvider } from '@/theme/ThemeContext';
import { useSettingsStore } from '@/state/settingsStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { fileStorage } from '@/services/storage/FileStorage';
import { nativeStorage } from '@/services/storage/NativeStorageBridge';
import { ImportService } from '@/services/import/ImportService';
import { getDatabase } from '@/services/database/Database';
import { useImportQueueStore } from '@/state/importQueueStore';
import { BlockedFileModal, BlockedFileInfo } from '@/components/modals/BlockedFileModal';
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

    // Workstream A: Validate persisted SAF grants at launch and recover journal
    void (async () => {
      try {
        const db = await getDatabase();
        if (db) {
          const rows = await db.getAllAsync<{ id: number; tree_uri: string }>('SELECT id, tree_uri FROM sources');
          if (rows.length > 0) {
            const uris = rows.map((r) => r.tree_uri).filter(Boolean);
            const res = await nativeStorage.validatePersistedGrants(uris);
            const revokedSet = new Set(res.revokedUris);
            for (const r of rows) {
              const isValid = revokedSet.has(r.tree_uri) ? 0 : 1;
              await db.runAsync('UPDATE sources SET grant_valid = ? WHERE id = ?', [isValid, r.id]);
            }
          }
        }
        await useImportQueueStore.getState().recoverJournalOnLaunch();
      } catch (err) {
        logger.warn(TAG, 'Launch grant validation or journal recovery failed', err);
      }
    })();
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
  const [blockedInfo, setBlockedInfo] = useState<BlockedFileInfo | null>(null);

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

          // Pre-sniff content to detect blocked app packages (.apk, .jar, .aab) or containers (.zip)
          const sniff = await nativeStorage.sniff(targetUri, fileName);
          logger.info(
            TAG,
            `Sniffed incoming intent: format=${sniff.format}, kind=${sniff.kind}, reason=${sniff.reason}`
          );

          if (sniff.kind === 'blocked') {
            void nativeStorage.clearCurrentIntent();
            setBlockedInfo({
              fileName,
              reason: sniff.reason || 'It looks like an Android app package (.apk)',
              uri: targetUri,
            });
            return;
          }

          if (sniff.format === 'unknown' && sniff.kind !== 'container') {
            void nativeStorage.clearCurrentIntent();
            setBlockedInfo({
              fileName,
              reason: sniff.reason || 'This file format is not supported by Lirune.',
              uri: targetUri,
            });
            return;
          }

          if (sniff.kind === 'container' || sniff.format === 'zip') {
            void nativeStorage.clearCurrentIntent();
            router.push({
              pathname: '/folders',
              params: { archiveUri: targetUri, archiveName: fileName },
            });
            return;
          }

          const res = await ImportService.importFile(targetUri, fileName);
          // Immediately clear the native intent data on MainActivity so cold relaunches
          // and multitasking do not repeatedly open this same book.
          void nativeStorage.clearCurrentIntent();

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
          void nativeStorage.clearCurrentIntent();
        }
      }
    }

    // Cold launch check
    Linking.getInitialURL().then((url) => {
      if (url) void handleIncomingUri(url);
    });

    // Warm launch / foreground event listener
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url) void handleIncomingUri(url);
    });

    return () => subscription.remove();
  }, [loadLibrary, router]);

  return (
    <>
      {children}
      <BlockedFileModal
        info={blockedInfo}
        onDismiss={() => setBlockedInfo(null)}
      />
    </>
  );
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
