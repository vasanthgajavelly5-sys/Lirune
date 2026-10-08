/**
 * Lirune Reader Mobile — Supported Reader Typography
 * Centralized font options, CSS stacks, and native font fallbacks.
 */

export interface FontOption {
  id: string;
  name: string;
  subtitle: string;
  cssStack: string;
  nativeFamily: string;
  preview: string;
  category?: 'serif' | 'sans' | 'slab' | 'special' | 'mono';
  license?: string;
}

export const READER_FONTS: FontOption[] = [
  {
    id: 'Serif',
    name: 'Classic Serif',
    subtitle: 'Georgia / Noto Serif',
    cssStack: 'Georgia, "Noto Serif", "Times New Roman", serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'System Standard',
  },
  {
    id: 'Sans-Serif',
    name: 'Modern Sans',
    subtitle: 'Clean & readable',
    cssStack: 'system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
    nativeFamily: 'sans-serif',
    preview: 'Aa',
    category: 'sans',
    license: 'System Standard',
  },
  {
    id: 'Cormorant',
    name: 'Cormorant',
    subtitle: 'Lirune Signature Serif',
    cssStack: '"Cormorant Garamond", Garamond, "Palatino Linotype", Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'Merriweather',
    name: 'Merriweather',
    subtitle: 'Designed for screen reading',
    cssStack: 'Merriweather, Georgia, "Noto Serif", serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'Literata',
    name: 'Literata',
    subtitle: 'Google Play Books e-reader serif',
    cssStack: 'Literata, "Noto Serif", Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'Inter',
    name: 'Inter',
    subtitle: 'Precision screen sans',
    cssStack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    nativeFamily: 'sans-serif',
    preview: 'Aa',
    category: 'sans',
    license: 'SIL Open Font License',
  },
  {
    id: 'Lora',
    name: 'Lora',
    subtitle: 'Literary & calligraphic',
    cssStack: 'Lora, "Literata", Merriweather, Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'EBGaramond',
    name: 'EB Garamond',
    subtitle: 'Classic Renaissance book serif',
    cssStack: '"EB Garamond", Garamond, Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'Bitter',
    name: 'Bitter',
    subtitle: 'Contemporary slab serif for reading',
    cssStack: 'Bitter, Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'slab',
    license: 'SIL Open Font License',
  },
  {
    id: 'SourceSerif',
    name: 'Source Serif',
    subtitle: 'Adobe open-source book serif',
    cssStack: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'OpenDyslexic',
    name: 'OpenDyslexic',
    subtitle: 'Accessibility & reading ease',
    cssStack: 'OpenDyslexic, sans-serif',
    nativeFamily: 'sans-serif',
    preview: 'Aa',
    category: 'special',
    license: 'Open License (OFL / Public)',
  },
  {
    id: 'Playfair',
    name: 'Playfair Display',
    subtitle: 'High contrast editorial',
    cssStack: '"Playfair Display", Georgia, "Times New Roman", serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'Vollkorn',
    name: 'Vollkorn',
    subtitle: 'Quiet & robust book typeface',
    cssStack: 'Vollkorn, Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'Alegreya',
    name: 'Alegreya',
    subtitle: 'Rhythmic literature face',
    cssStack: 'Alegreya, Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'SIL Open Font License',
  },
  {
    id: 'Charter',
    name: 'Charter',
    subtitle: 'Warm book text',
    cssStack: 'Charter, "Book Antiqua", Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
    category: 'serif',
    license: 'Bitstream Free License',
  },
  {
    id: 'Monospace',
    name: 'Monospace',
    subtitle: 'Code & typewriter',
    cssStack: '"Roboto Mono", "Courier New", Courier, monospace',
    nativeFamily: 'monospace',
    preview: 'Aa',
    category: 'mono',
    license: 'System Standard',
  },
];

export function getCssFontFamily(fontId: string): string {
  const match = READER_FONTS.find(
    (f) =>
      f.id.toLowerCase() === (fontId || '').toLowerCase() ||
      f.name.toLowerCase() === (fontId || '').toLowerCase()
  );
  return match ? match.cssStack : READER_FONTS[0].cssStack;
}

export function getNativeFontFamily(fontId: string): string {
  const match = READER_FONTS.find(
    (f) =>
      f.id.toLowerCase() === (fontId || '').toLowerCase() ||
      f.name.toLowerCase() === (fontId || '').toLowerCase()
  );
  return match ? match.nativeFamily : 'serif';
}

