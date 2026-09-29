/**
 * Lirune Reader Mobile — Theme Colors & Design Tokens
 * Functional reference: Lirune Desktop 4.0.4
 * Brand accent: #EEECF8
 */

export const Colors = {
  dark: {
    // Base
    background: '#1A1A1D',
    surface: '#202024',
    surfaceElevated: '#2A2A2F',
    elevated: '#2A2A2F',
    card: '#232328',
    // Text
    text: '#F0F0EB',
    textSecondary: '#B8B8B0',
    textMuted: '#888880',
    textFaint: '#666660',
    // Accent (Lirune brand accent is #EEECF8; on dark UI we use a refined lilac-glow)
    accent: '#EEECF8',
    accentSoft: '#2E2B38',
    accentPressed: '#DCD8F0',
    accentForeground: '#1A1A1D',
    // Borders
    border: '#3A3A3E',
    borderSubtle: '#2E2E32',
    // Semantic
    success: '#4ECDC4',
    warning: '#FFB86C',
    error: '#FF6B6B',
    muted: '#888880',
    // Reader defaults
    readingBackground: '#1B1D21',
    readingText: '#E7E3D8',
    readingMuted: '#A7A49B',
  },
  light: {
    // Base
    background: '#F8F8F5',
    surface: '#FFFFFF',
    surfaceElevated: '#F0F0EB',
    elevated: '#F0F0EB',
    card: '#FAFAF8',
    // Text
    text: '#1A1A18',
    textSecondary: '#5A5A56',
    textMuted: '#888884',
    textFaint: '#AAAAA8',
    // Accent
    accent: '#4C4666',
    accentSoft: '#EEECF8',
    accentPressed: '#37324B',
    accentForeground: '#FFFFFF',
    // Borders
    border: '#E0E0DC',
    borderSubtle: '#E8E8E4',
    // Semantic
    success: '#00A898',
    warning: '#D48800',
    error: '#D84040',
    muted: '#888884',
    // Reader defaults
    readingBackground: '#FDFCF8',
    readingText: '#1A1410',
    readingMuted: '#6B6055',
  },
} as const;

export type ColorScheme = 'dark' | 'light';
export type ColorTokens = typeof Colors.dark;

/**
 * Dedicated reader theme color presets from Lirune Desktop 4.0.4
 */
export interface ReaderThemePalette {
  id: string;
  label: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  link: string;
  selection: string;
}

export const READER_THEMES: Record<string, ReaderThemePalette> = {
  neutral: {
    id: 'neutral',
    label: 'Neutral',
    bg: '#FDFCF8',
    surface: '#FFFFFF',
    text: '#1A1410',
    muted: '#6B6055',
    link: '#245A8D',
    selection: 'rgba(36,90,141,0.25)',
  },
  sepia: {
    id: 'sepia',
    label: 'Sepia',
    bg: '#F4ECDA',
    surface: '#FAF3E4',
    text: '#342921',
    muted: '#7A6B5D',
    link: '#8C5F20',
    selection: 'rgba(217,119,6,0.3)',
  },
  night: {
    id: 'night',
    label: 'Night',
    bg: '#1B1D21',
    surface: '#24272C',
    text: '#E7E3D8',
    muted: '#A7A49B',
    link: '#8FC7E8',
    selection: 'rgba(143,199,232,0.35)',
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    bg: '#E9E0CF',
    surface: '#F7F0E2',
    text: '#2D271F',
    muted: '#756A5B',
    link: '#6B4F2A',
    selection: 'rgba(107,79,42,0.25)',
  },
  contrast1: {
    id: 'contrast1',
    label: 'Pure Black',
    bg: '#000000',
    surface: '#111111',
    text: '#FFFFFF',
    muted: '#D0D0D0',
    link: '#FFFFFF',
    selection: 'rgba(255,255,255,0.38)',
  },
  contrast2: {
    id: 'contrast2',
    label: 'High Yellow',
    bg: '#000000',
    surface: '#151515',
    text: '#FFFFFF',
    muted: '#E2E2E2',
    link: '#FFE600',
    selection: 'rgba(255,230,0,0.45)',
  },
  contrast3: {
    id: 'contrast3',
    label: 'Deep Navy',
    bg: '#071426',
    surface: '#102542',
    text: '#FFFFFF',
    muted: '#C6D5E8',
    link: '#7DD3FC',
    selection: 'rgba(125,211,252,0.42)',
  },
  contrast4: {
    id: 'contrast4',
    label: 'Soft Forest',
    bg: '#E4F1E5',
    surface: '#F3FAF3',
    text: '#102B19',
    muted: '#4D6B55',
    link: '#176B3A',
    selection: 'rgba(23,107,58,0.28)',
  },
};