import { useColorScheme } from 'react-native';
import { Colors, type ColorScheme, type ColorTokens } from './Colors';
import { Spacing, BorderRadius, Typography, Shadows } from './Tokens';

export type { ColorScheme, ColorTokens };

export function useTheme() {
  const systemScheme = useColorScheme() ?? 'dark';
  const scheme = (systemScheme === 'light' || systemScheme === 'dark') ? systemScheme : 'dark';
  const colors = Colors[scheme];

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