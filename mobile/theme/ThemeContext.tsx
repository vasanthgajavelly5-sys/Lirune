import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { Colors, type ColorScheme, READER_THEMES, type ReaderThemePalette } from './Colors';
import { useSettingsStore, type AppThemeOption } from '@/state/settingsStore';

type ThemeColors = { [K in keyof typeof Colors.dark]: string };

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
  const accessibility = useSettingsStore((state) => state.accessibility);

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
      return READER_THEMES[themeName] || READER_THEMES.sepia;
    },
    []
  );

  const value: ThemeContextValue = useMemo(() => {
    const baseColors = Colors[scheme] as ThemeColors;
    const computedColors = accessibility.highContrast
      ? {
          ...baseColors,
          border: scheme === 'dark' ? '#888892' : '#6A6A64',
          borderSubtle: scheme === 'dark' ? '#62626C' : '#8A8A84',
          textSecondary: scheme === 'dark' ? '#E6E6E0' : '#262624',
          textMuted: scheme === 'dark' ? '#B8B8B0' : '#52524E',
        }
      : baseColors;

    return {
      scheme,
      colors: computedColors,
      setScheme,
      toggleScheme,
      getReaderPalette,
    };
  }, [scheme, accessibility.highContrast, setScheme, toggleScheme, getReaderPalette]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}
