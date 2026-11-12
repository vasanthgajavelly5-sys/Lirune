import { useContext } from 'react';
import { Colors, type ColorScheme, type ColorTokens } from './Colors';
import { Spacing, BorderRadius, Typography, Shadows } from './Tokens';
import { ThemeContext } from './ThemeContext';

export type { ColorScheme, ColorTokens };

export function useTheme() {
  const context = useContext(ThemeContext);
  const scheme = context ? context.scheme : 'dark';
  const colors = context ? context.colors : Colors[scheme];

  return {
    scheme,
    colors,
    spacing: Spacing,
    borderRadius: BorderRadius,
    typography: Typography,
    shadows: Shadows,
    // Helpers
    isDark: scheme === 'dark',
  };
}

export function getTheme(scheme: ColorScheme) {
  return {
    scheme,
    colors: Colors[scheme],
    spacing: Spacing,
    borderRadius: BorderRadius,
    typography: Typography,
    shadows: Shadows,
    isDark: scheme === 'dark',
  };
}

export type Theme = ReturnType<typeof useTheme>;