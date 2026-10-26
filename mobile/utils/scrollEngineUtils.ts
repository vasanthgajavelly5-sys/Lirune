/**
 * Lirune Reader Mobile — Scroll Engine pure utilities
 *
 * Provides shared, side-effect-free algorithms for:
 * 1. Single metric hysteresis windowing (hydration and unloading).
 * 2. Section-relative progress math.
 * 3. Stable position anchors (chapterIndex + fractionWithinChapter).
 * 4. Calibrated placeholder height estimation based on text length.
 */

export interface ParsedScrollAnchor {
  chapterIndex: number;
  fraction?: number;
  scrollY?: number;
  anchor?: string;
}

/**
 * Computes monotonic publication progress as a percentage (0 to 100)
 * based on the current chapter and relative fraction within that chapter.
 */
export function computeSectionProgress(
  chapterIndex: number,
  fractionWithinChapter: number,
  totalChapters: number
): number {
  if (!Number.isFinite(totalChapters) || totalChapters <= 0) return 0;
  if (chapterIndex >= totalChapters) return 100;
  if (chapterIndex < 0) return 0;
  const clampedFraction = Math.max(0, Math.min(1, Number.isFinite(fractionWithinChapter) ? fractionWithinChapter : 0));
  const ratio = (chapterIndex + clampedFraction) / totalChapters;
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

/**
 * Formats a stable scroll anchor CFI that survives font size, orientation,
 * and layout changes.
 */
export function formatScrollAnchor(chapterIndex: number, fraction: number): string {
  const safeChapter = Math.max(0, Math.floor(chapterIndex));
  const safeFrac = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return `spine:${safeChapter}:frac:${safeFrac.toFixed(4)}`;
}

/**
 * Parses scroll targets and anchors, including legacy `spine:N:scroll:Y`,
 * new stable `spine:N:frac:F`, and fragment `spine:N:anchor:A`.
 */
export function parseScrollAnchor(target: string): ParsedScrollAnchor | null {
  if (!target || typeof target !== 'string') return null;
  const match = target.match(/^spine:(\d+)(?::(frac|scroll|anchor):(.+))?$/);
  if (!match) return null;

  const chapterIndex = Number.parseInt(match[1], 10);
  if (!Number.isFinite(chapterIndex) || chapterIndex < 0) return null;

  const mode = match[2];
  const value = match[3];

  if (mode === 'frac') {
    const fraction = Number.parseFloat(value);
    return {
      chapterIndex,
      ...(Number.isFinite(fraction) ? { fraction: Math.max(0, Math.min(1, fraction)) } : {}),
    };
  }

  if (mode === 'scroll') {
    const scrollY = Number.parseInt(value, 10);
    return {
      chapterIndex,
      ...(Number.isFinite(scrollY) ? { scrollY: Math.max(0, scrollY) } : {}),
    };
  }

  if (mode === 'anchor') {
    try {
      return { chapterIndex, anchor: decodeURIComponent(value) };
    } catch {
      return { chapterIndex, anchor: value };
    }
  }

  return { chapterIndex };
}

/**
 * Estimates chapter placeholder min-height based on character count,
 * font size, line height, and viewport width to eliminate layout shifts (CLS).
 */
export function estimateChapterPlaceholderHeight(
  charCount: number,
  fontSize: number,
  lineHeight: number,
  viewportWidth: number
): number {
  if (!Number.isFinite(charCount) || charCount <= 0) return 120;
  const safeFontSize = Math.max(10, Number.isFinite(fontSize) ? fontSize : 16);
  const safeLineHeight = Math.max(1.0, Number.isFinite(lineHeight) ? lineHeight : 1.5);
  const safeWidth = Math.max(280, Number.isFinite(viewportWidth) ? viewportWidth : 360);

  // Approximate usable text column width (minus ~40px margins)
  const columnWidth = Math.max(200, safeWidth - 40);
  // Average CJK / Latin glyph width is ~0.55em
  const approxCharsPerLine = Math.max(20, Math.floor(columnWidth / (safeFontSize * 0.55)));
  const estimatedLines = Math.ceil(charCount / approxCharsPerLine);
  const lineHeightPx = safeFontSize * safeLineHeight;

  // Add baseline padding for chapter header / paragraph margins
  const estimatedHeight = Math.round(estimatedLines * lineHeightPx + 48);
  return Math.max(120, Math.min(estimatedHeight, 150000));
}

/**
 * Single-metric hysteresis check: whether a chapter section is within the
 * viewport hydration window.
 *
 * @param rectTop Top coordinate of bounding rect relative to viewport.
 * @param rectBottom Bottom coordinate of bounding rect relative to viewport.
 * @param viewportHeight Height of the viewport in pixels.
 * @param topBufferMultiplier Multiplier above the top of viewport (e.g. 1.5).
 * @param bottomBufferMultiplier Multiplier below the bottom of viewport (e.g. 2.0).
 */
export function isWithinHydrationWindow(
  rectTop: number,
  rectBottom: number,
  viewportHeight: number,
  topBufferMultiplier = 1.5,
  bottomBufferMultiplier = 2.0
): boolean {
  if (viewportHeight <= 0) return false;
  const topThreshold = -topBufferMultiplier * viewportHeight;
  const bottomThreshold = (1 + bottomBufferMultiplier) * viewportHeight;
  return rectBottom >= topThreshold && rectTop <= bottomThreshold;
}

/**
 * Single-metric hysteresis check: whether a loaded chapter should be unloaded
 * to keep DOM memory flat and prevent GPU memory spikes.
 *
 * Chapters are only unloaded when strictly outside the hysteresis buffer (> 4 viewports away)
 * and NEVER if intersecting the viewport or near-viewport zone (<= 2.5 viewports).
 */
export function shouldUnloadChapter(
  rectTop: number,
  rectBottom: number,
  viewportHeight: number,
  unloadDistanceMultiplier = 4.0
): boolean {
  if (viewportHeight <= 0) return false;
  // If chapter intersects viewport or is within 2.5 viewports, NEVER unload.
  if (rectBottom >= -2.5 * viewportHeight && rectTop <= 3.5 * viewportHeight) {
    return false;
  }
  const topCutoff = -unloadDistanceMultiplier * viewportHeight;
  const bottomCutoff = (1 + unloadDistanceMultiplier) * viewportHeight;
  return rectBottom < topCutoff || rectTop > bottomCutoff;
}
