/**
 * Lirune Reader Mobile — Reader Viewport Layout Math
 *
 * Every value the reader WebView needs is derived here from MEASURED
 * dimensions (the onLayout size of the WebView container) plus the real
 * platform insets. Nothing in this module assumes a device width, so the same
 * code produces a correct reading column on a 320dp phone, a 1080dp tablet, or
 * in landscape after a rotation.
 *
 * All numbers are density-independent pixels, which is the same unit React
 * Native layout events and CSS px use inside the Android WebView.
 */

export interface ReaderInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ReaderLayoutInput {
  /** Measured width of the WebView container in dp. */
  containerWidth: number;
  /** Measured height of the WebView container in dp. */
  containerHeight: number;
  /** Real safe-area / window insets reported by the platform. */
  insets: ReaderInsets;
  /** Reader font size in px (already includes the user's book font size). */
  fontSize: number;
  /** Reader margin preference in px. */
  userMargin: number;
  /** Preferred gap between paginated columns in px. */
  pageGap: number;
  /** Device font scale, used so the indicator/padding track the OS setting. */
  fontScale: number;
}

export interface ReaderLayout {
  viewportWidth: number;
  viewportHeight: number;
  /** Width of the reading column. Never wider than the space actually available. */
  contentWidth: number;
  /**
   * Width the reading column may occupy before it is capped: the safe width minus
   * the reader margin on both sides. The column decision compares two minimum
   * measures against this, so it needs the *available* width, not the capped one.
   */
  availableWidth: number;
  /** Distance from the WebView's left edge to the reading column. */
  sideOffset: number;
  padTop: number;
  padBottom: number;
  colGap: number;
  /** Height reserved for the bottom progress indicator itself. */
  progressBarHeight: number;
  /** Bottom inset the indicator has to clear (gesture bar / navigation bar). */
  bottomSafe: number;
  /** padTop + padBottom + contentWidth describe the whole reading viewport. */
  isReadingColumnCapped: boolean;
  /** True when the container is wider than it is tall (landscape orientation). */
  isLandscape: boolean;
}

const MIN_VIEWPORT = 240;
const MIN_CONTENT_WIDTH = 160;
/**
 * A comfortable reading measure is roughly 60-70 characters. With an average
 * glyph advance of ~0.5em that is 32-36em, so cap the column at 34em and let
 * the remainder of a wide screen become symmetric margin instead of a
 * comically long line.
 */
const MAX_MEASURE_EM = 34;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function computeReaderLayout(input: ReaderLayoutInput): ReaderLayout {
  const {
    containerWidth,
    containerHeight,
    insets,
    fontSize,
    userMargin,
    pageGap,
    fontScale,
  } = input;

  const scale = clamp(fontScale > 0 ? fontScale : 1, 0.85, 2.5);
  const viewportWidth = Math.max(MIN_VIEWPORT, Math.round(containerWidth || 0));
  const viewportHeight = Math.max(MIN_VIEWPORT, Math.round(containerHeight || 0));

  const insetLeft = Math.max(0, insets.left || 0);
  const insetRight = Math.max(0, insets.right || 0);
  const insetTop = Math.max(0, insets.top || 0);
  const insetBottom = Math.max(0, insets.bottom || 0);

  // Clamp the reader margin so an extreme preference can never eat the column.
  const margin = clamp(Math.round(userMargin || 0), 0, Math.round(viewportWidth * 0.2));

  const safeWidth = Math.max(120, viewportWidth - insetLeft - insetRight);
  const availableWidth = Math.max(MIN_CONTENT_WIDTH, safeWidth - margin * 2);
  const maxReadingWidth = Math.round(clamp(fontSize || 16, 8, 96) * MAX_MEASURE_EM);
  const contentWidth = Math.round(clamp(Math.min(availableWidth, maxReadingWidth), MIN_CONTENT_WIDTH, availableWidth));
  const isReadingColumnCapped = contentWidth < availableWidth;

  // Centre the column inside the safe area, and centre the whole thing on wide
  // screens (tablets/landscape) where the measure is capped.
  //
  // Rounding is clamped rather than trusted. Two constraints must both hold or
  // the last character of every line is clipped:
  //   sideOffset >= insetLeft                     (clear the notch)
  //   sideOffset + contentWidth <= width - insetRight
  // The second is additionally tightened so the leftover space stays balanced,
  // which keeps `2 * sideOffset + contentWidth` inside the viewport even when
  // the ideal centre falls on a half pixel.
  const symmetricCap = Math.floor((viewportWidth - contentWidth) / 2) + insetLeft;
  const maxSideOffset = Math.max(insetLeft, Math.min(viewportWidth - insetRight - contentWidth, symmetricCap));
  const minSideOffset = Math.min(insetLeft + margin, maxSideOffset);
  const centred = Math.round(insetLeft + margin + (availableWidth - contentWidth) / 2);
  const sideOffset = Math.max(minSideOffset, Math.min(maxSideOffset, centred));

  const progressBarHeight = Math.round(clamp(22 * scale, 20, 44));
  const bottomSafe = Math.round(Math.max(insetBottom, 8 * scale));
  const padBottom = Math.round(progressBarHeight + bottomSafe + 10 * scale);
  const padTop = Math.round(Math.max(insetTop, 8 * scale) + 12 * scale);
  const colGap = Math.round(clamp(pageGap, 0, 72));

  const isLandscape = viewportWidth > viewportHeight;

  return {
    viewportWidth,
    viewportHeight,
    contentWidth,
    availableWidth,
    sideOffset,
    padTop,
    padBottom,
    colGap,
    progressBarHeight,
    bottomSafe,
    isReadingColumnCapped,
    isLandscape,
  };
}

/**
 * Serialises the layout for injection into an already-loaded reader document.
 * Kept in one place so the page and React Native can never disagree about the
 * geometry after a rotation or a settings change.
 */
export function layoutToMessage(layout: ReaderLayout) {
  return {
    contentWidth: layout.contentWidth,
    sideOffset: layout.sideOffset,
    padTop: layout.padTop,
    padBottom: layout.padBottom,
    colGap: layout.colGap,
    viewportWidth: layout.viewportWidth,
    viewportHeight: layout.viewportHeight,
  };
}
