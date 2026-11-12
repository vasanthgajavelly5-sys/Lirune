export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

export const Typography = {
  // Display
  displayLarge: { fontSize: 57, fontWeight: '700' as const, lineHeight: 64, letterSpacing: -0.25 },
  displayMedium: { fontSize: 45, fontWeight: '700' as const, lineHeight: 52, letterSpacing: 0 },
  displaySmall: { fontSize: 36, fontWeight: '700' as const, lineHeight: 44, letterSpacing: 0 },
  // Headlines
  headlineLarge: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40, letterSpacing: 0 },
  headlineMedium: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36, letterSpacing: 0 },
  headlineSmall: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32, letterSpacing: 0 },
  // Titles
  titleLarge: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: 0 },
  titleMedium: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24, letterSpacing: 0 },
  titleSmall: { fontSize: 14, fontWeight: '700' as const, lineHeight: 20, letterSpacing: 0.1 },
  // Body
  bodyLarge: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24, letterSpacing: 0.5 },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 0.25 },
  bodySmall: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16, letterSpacing: 0.4 },
  // Labels
  labelLarge: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20, letterSpacing: 0.1 },
  labelMedium: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.5 },
  labelSmall: { fontSize: 10, fontWeight: '600' as const, lineHeight: 14, letterSpacing: 0.5 },
  // Reading
  readingBody: { fontSize: 19, fontWeight: '400' as const, lineHeight: 31, letterSpacing: 0, fontFamily: 'serif' },
  readingBodySmall: { fontSize: 17, fontWeight: '400' as const, lineHeight: 28, letterSpacing: 0, fontFamily: 'serif' },
  readingCaption: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 0, fontFamily: 'serif' },
} as const;

export const Shadows = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 },
  xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 20 },
} as const;

export const Breakpoints = {
  sm: 0,
  md: 600,
  lg: 900,
} as const;