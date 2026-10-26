/**
 * Unit tests for pure scroll engine utilities:
 * 1. Monotonic section progress math.
 * 2. Anchor formatting and round-trip parsing (frac, scroll, anchor).
 * 3. Hysteresis hydration & unloading boundaries.
 * 4. Calibrated placeholder height estimation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSectionProgress,
  formatScrollAnchor,
  parseScrollAnchor,
  estimateChapterPlaceholderHeight,
  isWithinHydrationWindow,
  shouldUnloadChapter,
} from '../utils/scrollEngineUtils.ts';

test('computeSectionProgress computes monotonic progression accurately', () => {
  // Empty or invalid total
  assert.equal(computeSectionProgress(0, 0, 0), 0);
  assert.equal(computeSectionProgress(0, 0, -5), 0);

  // First chapter at start
  assert.equal(computeSectionProgress(0, 0.0, 10), 0);
  // Halfway through chapter 0 of 10
  assert.equal(computeSectionProgress(0, 0.5, 10), 5);
  // Chapter 4 halfway (4.5 / 10 = 45%)
  assert.equal(computeSectionProgress(4, 0.5, 10), 45);
  // Chapter 9 at end (9 + 1.0 = 10 / 10 = 100%)
  assert.equal(computeSectionProgress(9, 1.0, 10), 100);

  // Clamping
  assert.equal(computeSectionProgress(15, 0.5, 10), 100);
  assert.equal(computeSectionProgress(-2, -0.5, 10), 0);
});

test('formatScrollAnchor and parseScrollAnchor roundtrip accurately', () => {
  const cfi = formatScrollAnchor(3, 0.4258);
  assert.equal(cfi, 'spine:3:frac:0.4258');

  const parsed = parseScrollAnchor(cfi);
  assert.ok(parsed);
  assert.equal(parsed.chapterIndex, 3);
  assert.equal(parsed.fraction, 0.4258);

  // Clamps negative and out-of-bounds fractions
  assert.equal(formatScrollAnchor(-1, -0.5), 'spine:0:frac:0.0000');
  assert.equal(formatScrollAnchor(5, 1.5), 'spine:5:frac:1.0000');
});

test('parseScrollAnchor handles legacy scroll and anchor formats', () => {
  const legacyScroll = parseScrollAnchor('spine:12:scroll:4500');
  assert.ok(legacyScroll);
  assert.equal(legacyScroll.chapterIndex, 12);
  assert.equal(legacyScroll.scrollY, 4500);

  const anchorTarget = parseScrollAnchor('spine:7:anchor:heading-2');
  assert.ok(anchorTarget);
  assert.equal(anchorTarget.chapterIndex, 7);
  assert.equal(anchorTarget.anchor, 'heading-2');

  const bare = parseScrollAnchor('spine:4');
  assert.ok(bare);
  assert.equal(bare.chapterIndex, 4);
  assert.equal(bare.fraction, undefined);

  assert.equal(parseScrollAnchor('invalid:format'), null);
  assert.equal(parseScrollAnchor(''), null);
});

test('estimateChapterPlaceholderHeight scales with character count and font settings', () => {
  // Empty or tiny chapter has minimum safety height
  assert.equal(estimateChapterPlaceholderHeight(0, 16, 1.5, 360), 120);
  assert.equal(estimateChapterPlaceholderHeight(-10, 16, 1.5, 360), 120);

  // Standard chapter (~10,000 chars)
  const height1 = estimateChapterPlaceholderHeight(10000, 16, 1.5, 360);
  assert.ok(height1 > 3000 && height1 < 8000, `Estimated height ${height1} within realistic bounds`);

  // Larger font size increases estimated height
  const heightLargeFont = estimateChapterPlaceholderHeight(10000, 24, 1.5, 360);
  assert.ok(heightLargeFont > height1, 'Larger font size produces greater placeholder height');

  // Wider viewport decreases estimated height (more chars per line)
  const heightWideScreen = estimateChapterPlaceholderHeight(10000, 16, 1.5, 800);
  assert.ok(heightWideScreen < height1, 'Wider viewport produces fewer lines and lower height');
});

test('isWithinHydrationWindow respects top and bottom buffer zones', () => {
  const vh = 800;

  // Intersecting viewport (top: 200, bottom: 600)
  assert.equal(isWithinHydrationWindow(200, 600, vh), true);

  // Right above viewport within 1.5 vh (top: -800, bottom: -200) -> topThreshold is -1200
  assert.equal(isWithinHydrationWindow(-800, -200, vh), true);

  // Far above viewport (top: -2000, bottom: -1500) -> outside -1200 threshold
  assert.equal(isWithinHydrationWindow(-2000, -1500, vh), false);

  // Below viewport within 2.0 vh (top: 1200, bottom: 1800) -> bottomThreshold is 3 * 800 = 2400
  assert.equal(isWithinHydrationWindow(1200, 1800, vh), true);

  // Far below viewport (top: 3000, bottom: 3500) -> outside 2400
  assert.equal(isWithinHydrationWindow(3000, 3500, vh), false);
});

test('shouldUnloadChapter enforces hysteresis and never unloads near viewport', () => {
  const vh = 800;

  // Intersecting viewport
  assert.equal(shouldUnloadChapter(100, 500, vh), false);

  // Just outside viewport (bottom: -400) -> within 2.5 vh buffer, must NOT unload
  assert.equal(shouldUnloadChapter(-1000, -400, vh), false);

  // Within 3 viewports below (top: 1800) -> within 3.5 vh buffer, must NOT unload
  assert.equal(shouldUnloadChapter(1800, 2200, vh), false);

  // Far above (> 4 viewports away: bottom: -3500, cutoff is -3200) -> unload
  assert.equal(shouldUnloadChapter(-4000, -3500, vh), true);

  // Far below (> 5 viewports away: top: 4500, cutoff is 4000) -> unload
  assert.equal(shouldUnloadChapter(4500, 5000, vh), true);
});
