/**
 * Lirune Reader Mobile — reader geometry
 *
 * Decides *what the WebView should be rendering*. It is deliberately separated
 * from the component so the rule that matters can be tested directly:
 *
 *   Changing anything that reflows the text produces a NEW key. The reader only
 *   re-renders its document when the key changes, and a key change first triggers
 *   a logical reading-position capture so the position survives the reflow.
 *
 *   Changing something that does not reflow leaves the key alone, so the
 *   WebView keeps its DOM and its scroll position untouched.
 */

import type { ReaderLayout } from '../reader/readerLayout.ts';

/** The settings fields that affect the rendered document. */
export interface ReaderGeometrySettings {
  flow: 'paginated' | 'scrolled';
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  margin: number;
  pageGap?: number;
  alignment: string;
  paragraphSpacing?: number;
}

export interface ReaderGeometry {
  /** Stable identity of the rendered document. */
  key: string;
  settings: ReaderGeometrySettings;
  layout: ReaderLayout;
  /** Two reading columns side by side (tablet / wide landscape, paginated only). */
  twoColumn: boolean;
  mode: 'paginated' | 'continuous';
}

/** Android/iOS tablet breakpoint, matching the platform sw600dp. */
export const TABLET_MIN_WIDTH = 600;

export function computeReaderGeometry(
  settings: ReaderGeometrySettings,
  layout: ReaderLayout,
  containerWidth: number
): ReaderGeometry {
  // Tablet = the MEASURED container width, never a hardcoded device size.
  const tablet = (containerWidth || layout.viewportWidth || 0) >= TABLET_MIN_WIDTH;
  const mode: ReaderGeometry['mode'] = settings.flow === 'scrolled' ? 'continuous' : 'paginated';

  const key = [
    mode,
    settings.theme,
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.margin,
    settings.pageGap ?? 16,
    settings.alignment,
    settings.paragraphSpacing ?? 1,
    // Everything the layout derived from the measured container and insets.
    layout.viewportWidth,
    layout.viewportHeight,
    layout.contentWidth,
    layout.sideOffset,
    layout.padTop,
    layout.padBottom,
    layout.colGap,
    tablet ? 2 : 1,
  ].join('|');

  return { key, settings, layout, twoColumn: tablet && mode === 'paginated', mode };
}

/** True when two geometries would render the same document. */
export function sameGeometry(a: ReaderGeometry | null, b: ReaderGeometry | null): boolean {
  return !!a && !!b && a.key === b.key;
}

export interface NavigationTargetInput {
  /** The CFI handed to the reader by the host screen. */
  targetCfi: string;
  /** The CFI this reader last published itself. */
  lastPublishedCfi: string | null;
  /** The CFI this reader last acted on. */
  lastAppliedCfi: string | null;
  /** Spine index parsed from `targetCfi`, or null when it is not a spine target. */
  spineIndex: number | null;
  chapterCount: number;
  currentChapterIndex: number;
  /** Element id the target points at, when the host supplied one. */
  anchor?: string;
}

export type NavigationDecision =
  | 'navigate'
  | 'anchor-only'
  | 'ignore-progress-echo'
  | 'ignore-already-applied'
  | 'ignore-unparseable'
  | 'ignore-out-of-range'
  | 'ignore-same-chapter';

/**
 * Decides whether an incoming `targetCfi` is a navigation request.
 *
 * This guard exists because the host screen echoes the reader's own progress CFI
 * straight back as the current target. Without it, turning a page at the end of a
 * chapter publishes `spine:N+1`, the echo looks like a request to go to N+1, the
 * reader's own page turn already moved it there, and the stale `spine:N` echo then
 * pulls it back — an infinite render loop that ends in "Maximum update depth
 * exceeded".
 */
export function decideNavigation(input: NavigationTargetInput): NavigationDecision {
  if (!input.targetCfi) return 'ignore-unparseable';
  // The reader's own progress report is not a request.
  if (input.targetCfi === input.lastPublishedCfi) return 'ignore-progress-echo';
  // A request that was already honoured must not run twice.
  if (input.targetCfi === input.lastAppliedCfi) return 'ignore-already-applied';
  if (input.spineIndex === null) return 'ignore-unparseable';
  if (input.spineIndex < 0 || input.spineIndex >= input.chapterCount) return 'ignore-out-of-range';
  if (input.spineIndex === input.currentChapterIndex) {
    // A same-chapter target still means something when it names an element.
    return input.anchor ? 'anchor-only' : 'ignore-same-chapter';
  }
  return 'navigate';
}