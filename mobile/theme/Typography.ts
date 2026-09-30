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
}

export const READER_FONTS: FontOption[] = [
  {
    id: 'Serif',
    name: 'Classic Serif',
    subtitle: 'Georgia / Noto Serif',
    cssStack: 'Georgia, "Noto Serif", "Times New Roman", serif',
    nativeFamily: 'serif',
    preview: 'Aa',
  },
  {
    id: 'Sans-Serif',
    name: 'Modern Sans',
    subtitle: 'Clean & readable',
    cssStack: 'system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
    nativeFamily: 'sans-serif',
    preview: 'Aa',
  },
  {
    id: 'Cormorant',
    name: 'Cormorant',
    subtitle: 'Lirune Signature Serif',
    cssStack: '"Cormorant Garamond", Garamond, "Palatino Linotype", Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
  },
  {
    id: 'Lora',
    name: 'Lora',
    subtitle: 'Literary & calligraphic',
    cssStack: 'Lora, "Literata", Merriweather, Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
  },
  {
    id: 'Playfair',
    name: 'Playfair Display',
    subtitle: 'High contrast editorial',
    cssStack: '"Playfair Display", Georgia, "Times New Roman", serif',
    nativeFamily: 'serif',
    preview: 'Aa',
  },
  {
    id: 'Charter',
    name: 'Charter',
    subtitle: 'Warm book text',
    cssStack: 'Charter, "Book Antiqua", Georgia, serif',
    nativeFamily: 'serif',
    preview: 'Aa',
  },
  {
    id: 'Monospace',
    name: 'Monospace',
    subtitle: 'Code & typewriter',
    cssStack: '"Roboto Mono", "Courier New", Courier, monospace',
    nativeFamily: 'monospace',
    preview: 'Aa',
  },
];

export function getCssFontFamily(fontId: string): string {
  const match = READER_FONTS.find((f) => f.id.toLowerCase() === (fontId || '').toLowerCase());
  return match ? match.cssStack : READER_FONTS[0].cssStack;
}

export function getNativeFontFamily(fontId: string): string {
  const match = READER_FONTS.find((f) => f.id.toLowerCase() === (fontId || '').toLowerCase());
  return match ? match.nativeFamily : 'serif';
}
