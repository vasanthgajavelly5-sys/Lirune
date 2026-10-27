/**
 * Pure utilities for Scroll Engine v2:
 * - Small-book tier detection (<1.5MB / <=40 spine items)
 * - Size-aware document progression
 * - Block-level locator format & parsing
 * - Block splitting for mammoth chapters
 * - Dynamic calibrated height model
 * - Velocity-aware hydration windowing
 */

export interface BlockLocator {
  chapterIndex: number;
  blockIndex: number;
  blockId?: string;
  charOffset: number;
  progression: number; // 0..1 fraction within chapter
}

/**
 * Determines if a book qualifies for the small-book tier where aggressive DOM
 * un-mounting is bypassed in favor of all-in-one or complete DOM persistence.
 */
export function isSmallBookTier(spineCount: number, archiveSizeBytes?: number): boolean {
  if (spineCount <= 0) return true;
  if (spineCount > 40) return false;
  if (archiveSizeBytes !== undefined && archiveSizeBytes > 1.5 * 1024 * 1024) {
    return false;
  }
  return true;
}

/**
 * Computes monotonic, byte/character-size-weighted reading progress across chapters.
 */
export function computeSizeAwareProgress(
  chapterIndex: number,
  fraction: number,
  chapterSizes: number[]
): number {
  if (!chapterSizes || chapterSizes.length === 0) return 0;
  if (chapterIndex < 0) return 0;
  if (chapterIndex >= chapterSizes.length) return 100;

  const validFrac = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  let totalBytes = 0;
  let priorBytes = 0;

  for (let i = 0; i < chapterSizes.length; i++) {
    const size = Math.max(200, chapterSizes[i] || 4000);
    totalBytes += size;
    if (i < chapterIndex) {
      priorBytes += size;
    }
  }

  if (totalBytes <= 0) return 0;

  const currentSize = Math.max(200, chapterSizes[chapterIndex] || 4000);
  const currentBytes = currentSize * validFrac;
  const progressPercent = ((priorBytes + currentBytes) / totalBytes) * 100;

  return Math.min(100, Math.max(0, Math.round(progressPercent)));
}

/**
 * Formats a block locator into a compact, URL-safe anchor string:
 * loc:v2:ch:B:bk:N:off:C:p:F
 */
export function formatBlockLocator(loc: BlockLocator): string {
  const ch = Math.max(0, Math.floor(loc.chapterIndex || 0));
  const bk = Math.max(0, Math.floor(loc.blockIndex || 0));
  const off = Math.max(0, Math.floor(loc.charOffset || 0));
  const prog = Number.isFinite(loc.progression)
    ? Math.max(0, Math.min(1, loc.progression)).toFixed(4)
    : '0.0000';
  const blockIdPart = loc.blockId ? `:id:${encodeURIComponent(loc.blockId)}` : '';
  return `loc:v2:ch:${ch}:bk:${bk}:off:${off}:p:${prog}${blockIdPart}`;
}

/**
 * Formats a stable scroll anchor CFI that survives font size, orientation,
 * and layout changes (fallback format).
 */
export function formatScrollAnchor(chapterIndex: number, fraction: number): string {
  const safeChapter = Math.max(0, Math.floor(chapterIndex));
  const safeFrac = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return `spine:${safeChapter}:frac:${safeFrac.toFixed(4)}`;
}

export interface ParsedScrollAnchor {
  chapterIndex: number;
  fraction?: number;
  scrollY?: number;
  anchor?: string;
}

/**
 * Parses scroll targets and anchors, including legacy `spine:N:scroll:Y`,
 * stable `spine:N:frac:F`, and fragment `spine:N:anchor:A`.
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
 * Parses a block locator or legacy anchor string back into a structured BlockLocator.
 */
export function parseBlockLocator(anchor: string): BlockLocator | null {
  if (!anchor || typeof anchor !== 'string') return null;

  // Modern v2 block locator: loc:v2:ch:0:bk:2:off:45:p:0.3500(:id:xyz)?
  if (anchor.startsWith('loc:v2:')) {
    const chMatch = anchor.match(/:ch:(\d+)/);
    const bkMatch = anchor.match(/:bk:(\d+)/);
    const offMatch = anchor.match(/:off:(\d+)/);
    const pMatch = anchor.match(/:p:([\d.]+)/);
    const idMatch = anchor.match(/:id:([^:]+)/);

    if (chMatch) {
      return {
        chapterIndex: parseInt(chMatch[1], 10),
        blockIndex: bkMatch ? parseInt(bkMatch[1], 10) : 0,
        charOffset: offMatch ? parseInt(offMatch[1], 10) : 0,
        progression: pMatch ? parseFloat(pMatch[1]) : 0,
        blockId: idMatch ? decodeURIComponent(idMatch[1]) : undefined,
      };
    }
  }

  // Legacy fraction locator: spine:3:frac:0.4567
  const fracMatch = anchor.match(/^spine:(\d+):frac:([\d.]+)/);
  if (fracMatch) {
    return {
      chapterIndex: parseInt(fracMatch[1], 10),
      blockIndex: 0,
      charOffset: 0,
      progression: parseFloat(fracMatch[2]),
    };
  }

  // Legacy scroll locator: spine:3:scroll:1240
  const scrollMatch = anchor.match(/^spine:(\d+):scroll:(\d+)/);
  if (scrollMatch) {
    return {
      chapterIndex: parseInt(scrollMatch[1], 10),
      blockIndex: 0,
      charOffset: 0,
      progression: 0,
    };
  }

  // Simple spine index: spine:3
  const simpleMatch = anchor.match(/^spine:(\d+)/);
  if (simpleMatch) {
    return {
      chapterIndex: parseInt(simpleMatch[1], 10),
      blockIndex: 0,
      charOffset: 0,
      progression: 0,
    };
  }

  return null;
}

/**
 * Tag-matching regex for splitting HTML into top-level semantic blocks.
 * Preserves tables, pre, lists, blockquotes, and figures without cutting their children.
 */
const BLOCK_TAG_REGEX = /<(p|div|section|article|h[1-6]|blockquote|table|ul|ol|pre|figure)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Splits chapter HTML into manageable block chunks (3KB–8KB each) while tagging
 * each top-level block with `data-block-id="c{chapterIndex}-b{blockIndex}"`.
 */
export function annotateAndChunkChapterBlocks(
  html: string,
  chapterIndex: number,
  maxChunkBytes: number = 6000
): { annotatedHtml: string; blockCount: number; chunks: string[] } {
  if (!html || !html.trim()) {
    const wrapped = `<div class="block-chunk" data-block-id="c${chapterIndex}-b0"></div>`;
    return { annotatedHtml: wrapped, blockCount: 1, chunks: [wrapped] };
  }

  let blockIdx = 0;
  const annotatedBlocks: string[] = [];

  // Replace each top-level block element with an annotated version
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  BLOCK_TAG_REGEX.lastIndex = 0;

  while ((match = BLOCK_TAG_REGEX.exec(html)) !== null) {
    const preceding = html.slice(lastIndex, match.index).trim();
    if (preceding) {
      annotatedBlocks.push(preceding);
    }

    const fullBlock = match[0];
    const blockId = `c${chapterIndex}-b${blockIdx++}`;
    // Insert data-block-id attribute into opening tag
    const openTagEnd = fullBlock.indexOf('>');
    if (openTagEnd !== -1) {
      const openTag = fullBlock.slice(0, openTagEnd);
      const rest = fullBlock.slice(openTagEnd);
      annotatedBlocks.push(`${openTag} data-block-id="${blockId}"${rest}`);
    } else {
      annotatedBlocks.push(fullBlock);
    }

    lastIndex = BLOCK_TAG_REGEX.lastIndex;
  }

  const trailing = html.slice(lastIndex).trim();
  if (trailing) {
    annotatedBlocks.push(trailing);
  }

  if (annotatedBlocks.length === 0) {
    const wrapped = `<div class="block-chunk" data-block-id="c${chapterIndex}-b0">${html}</div>`;
    return { annotatedHtml: wrapped, blockCount: 1, chunks: [wrapped] };
  }

  // Group blocks into chunks of ~maxChunkBytes
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentBytes = 0;

  for (const block of annotatedBlocks) {
    const blockSize = block.length;
    if (currentBytes + blockSize > maxChunkBytes && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [block];
      currentBytes = blockSize;
    } else {
      currentChunk.push(block);
      currentBytes += blockSize;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return {
    annotatedHtml: annotatedBlocks.join('\n'),
    blockCount: blockIdx,
    chunks,
  };
}

/**
 * Dynamic height model that calibrates estimated chapter heights against real measured
 * heights from rendered sections to ensure smooth scrollbars and zero CLS.
 */
export class ChapterHeightModel {
  private readonly chapterSizes: number[];
  private readonly measuredHeights: Map<number, number> = new Map();
  private empiricalPxPerChar: number = 0.55; // Default ~22px line per 40 chars
  private calibratedCount: number = 0;

  constructor(chapterSizes: number[]) {
    this.chapterSizes = chapterSizes && chapterSizes.length > 0 ? chapterSizes : [8000];
  }

  /**
   * Records a true measured height for a chapter from the live DOM and updates the
   * empirical scaling ratio across all unmeasured chapters.
   */
  calibrate(chapterIndex: number, measuredHeightPx: number): void {
    if (chapterIndex < 0 || chapterIndex >= this.chapterSizes.length) return;
    if (measuredHeightPx <= 20) return;

    this.measuredHeights.set(chapterIndex, measuredHeightPx);
    const charCount = Math.max(100, this.chapterSizes[chapterIndex] || 8000);
    const samplePxPerChar = measuredHeightPx / charCount;

    // Running average with dampening
    this.empiricalPxPerChar =
      (this.empiricalPxPerChar * this.calibratedCount + samplePxPerChar) / (this.calibratedCount + 1);
    this.calibratedCount++;
  }

  getEstimatedHeight(chapterIndex: number): number {
    const measured = this.measuredHeights.get(chapterIndex);
    if (measured !== undefined) return measured;

    const charCount = this.chapterSizes[chapterIndex] || 8000;
    return Math.max(120, Math.min(100000, Math.round(charCount * this.empiricalPxPerChar)));
  }

  getTotalEstimatedHeight(): number {
    let total = 0;
    for (let i = 0; i < this.chapterSizes.length; i++) {
      total += this.getEstimatedHeight(i);
    }
    return total;
  }
}

/**
 * Computes velocity-aware hydration window bounds.
 * Positive velocity (scrolling down) expands prefetch downward.
 * Negative velocity (scrolling up) expands prefetch upward.
 */
export function computeHydrationWindow(
  velocityPxPerMs: number,
  viewportHeight: number
): { topRatio: number; bottomRatio: number } {
  const v = Number.isFinite(velocityPxPerMs) ? velocityPxPerMs : 0;

  let topRatio = -1.2;
  let bottomRatio = 2.0;

  if (v > 0.5) {
    // Fast downward scroll: extend lookahead up to 4.5 viewports
    bottomRatio = Math.min(4.5, 2.0 + (v - 0.5) * 1.5);
  } else if (v < -0.5) {
    // Fast upward scroll: extend lookbehind up to -3.5 viewports
    topRatio = Math.max(-3.5, -1.2 + (v + 0.5) * 1.5);
  }

  return { topRatio, bottomRatio };
}
