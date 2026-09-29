import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { Colors, type ColorScheme, READER_THEMES, type ReaderThemePalette } from './Colors';
import { useSettingsStore, type AppThemeOption } from '@/state/settingsStore';

type ThemeColors = (typeof Colors)[ColorScheme];

interface ThemeContextValue {
  scheme: ColorScheme;
  colors: ThemeColors;
  setScheme: (scheme: ColorScheme) => void;
  toggleScheme: () => void;
  getReaderPalette: (themeName: string) => ReaderThemePalette;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // The persisted preference is the source of truth. Previously the scheme was
  // local state seeded to 'dark' and only ever set imperatively, so the saved
  // choice was silently lost on every app restart.
  const appTheme = useSettingsStore((state) => state.appTheme);
  const setAppTheme = useSettingsStore((state) => state.setAppTheme);

  const scheme: ColorScheme =
    appTheme === 'system'
      ? systemScheme === 'light'
        ? 'light'
        : 'dark'
      : appTheme === 'light'
      ? 'light'
      : 'dark';

  const setScheme = useCallback(
    (next: ColorScheme) => {
      void setAppTheme(next as AppThemeOption);
    },
    [setAppTheme]
  );

  const toggleScheme = useCallback(() => {
    void setAppTheme(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setAppTheme]);

  const getReaderPalette = useCallback(
    (themeName: string): ReaderThemePalette => {
      return READER_THEMES[themeName] || READER_THEMES.night;
    },
    []
  );

  const value: ThemeContextValue = useMemo(
    () => ({
      scheme,
      colors: Colors[scheme] as ThemeColors,
      setScheme,
      toggleScheme,
      getReaderPalette,
    }),
    [scheme, setScheme, toggleScheme, getReaderPalette]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}
