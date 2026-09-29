/**
 * Lirune Reader Mobile — Root App Navigation Layout
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '@/theme/ThemeContext';
import { useSettingsStore } from '@/state/settingsStore';
import { useLibraryStore } from '@/state/libraryStore';

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { loadSettings } = useSettingsStore();
  const { loadLibrary } = useLibraryStore();

  useEffect(() => {
    loadSettings();
    loadLibrary();
  }, [loadSettings, loadLibrary]);

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