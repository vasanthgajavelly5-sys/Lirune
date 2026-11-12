/**
 * Lirune Reader Mobile — stable safe-area insets
 *
 * `react-native-safe-area-context` reports the insets of the *system bars*. When
 * the reader hides the status bar to show more text, `insets.top` becomes 0 — and
 * because `padTop` is part of the reader geometry key, every tap on the middle of
 * the screen re-measured the reading column and re-flowed the text under the
 * reader's finger.
 *
 * This hook keeps the largest inset seen for the current window size, so reader
 * chrome, the reading column and the WebView geometry all stay put while the
 * reader is being used. A real change — rotation, split-screen, a fold being
 * unfolded, a gesture bar appearing — changes the window size and resets the
 * memory so the new insets are adopted immediately.
 */

import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface StableInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Window changes below this size delta are a status-bar animation, not a resize. */
const SIZE_QUANTUM = 16;

function sizeKeyOf(width: number, height: number): string {
  const orientation = width > height ? 'landscape' : 'portrait';
  return `${orientation}:${Math.round(width / SIZE_QUANTUM)}x${Math.round(height / SIZE_QUANTUM)}`;
}

function grow(current: StableInsets, next: StableInsets): StableInsets {
  return {
    top: Math.max(current.top, next.top),
    bottom: Math.max(current.bottom, next.bottom),
    left: Math.max(current.left, next.left),
    right: Math.max(current.right, next.right),
  };
}

function sameInsets(a: StableInsets, b: StableInsets): boolean {
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
}

export function useStableInsets(): StableInsets {
  const raw = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const sizeKey = sizeKeyOf(width, height);
  const observed: StableInsets = { top: raw.top, bottom: raw.bottom, left: raw.left, right: raw.right };

  const [stable, setStable] = useState<{ key: string; insets: StableInsets }>(() => ({
    key: sizeKey,
    insets: observed,
  }));

  useEffect(() => {
    setStable((previous) => {
      const base = previous.key === sizeKey ? previous.insets : { top: 0, bottom: 0, left: 0, right: 0 };
      const next = grow(base, observed);
      if (previous.key === sizeKey && sameInsets(previous.insets, next)) return previous;
      return { key: sizeKey, insets: next };
    });
  }, [sizeKey, raw.top, raw.bottom, raw.left, raw.right]);

  // A rotation must not wait for the effect above to land.
  if (stable.key !== sizeKey) return observed;
  return stable.insets;
}