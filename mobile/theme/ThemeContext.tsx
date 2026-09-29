import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { Colors, type ColorScheme, type ColorTokens, READER_THEMES, type ReaderThemePalette } from './Colors';

type ThemeColors = ColorTokens;

interface ThemeContextValue {
  scheme: ColorScheme;
  colors: ThemeColors;
  setScheme: (scheme: ColorScheme) => void;
  toggleScheme: () => void;
  getReaderPalette: (themeName: string) => ReaderThemePalette;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? 'dark';
  const [scheme, setScheme] = useState<ColorScheme>('dark');

  useEffect(() => {
    if (systemScheme === 'dark' || systemScheme === 'light') {
      setScheme(systemScheme);
    }
  }, [systemScheme]);

  const toggleScheme = () => {
    setScheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const getReaderPalette = (themeName: string): ReaderThemePalette => {
    return READER_THEMES[themeName] || READER_THEMES.night;
  };

  const value: ThemeContextValue = {
    scheme,
    colors: Colors[scheme] as ThemeColors,
    setScheme,
    toggleScheme,
    getReaderPalette,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}