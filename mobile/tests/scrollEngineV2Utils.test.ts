import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSmallBookTier,
  computeSizeAwareProgress,
  formatBlockLocator,
  parseBlockLocator,
  annotateAndChunkChapterBlocks,
  ChapterHeightModel,
  computeHydrationWindow,
} from '../utils/scrollEngineV2Utils.ts';

test('isSmallBookTier detects small books accurately', () => {
  assert.equal(isSmallBookTier(15, 800 * 1024), true);
  assert.equal(isSmallBookTier(40, 1.4 * 1024 * 1024), true);
  // Large spine count
  assert.equal(isSmallBookTier(45, 500 * 1024), false);
  // Large file size
  assert.equal(isSmallBookTier(10, 2.5 * 1024 * 1024), false);
});

test('computeSizeAwareProgress weights progress by chapter byte sizes', () => {
  const sizes = [1000, 9000]; // Chapter 0 is 10%, Chapter 1 is 90%

  // Chapter 0 at start
  assert.equal(computeSizeAwareProgress(0, 0, sizes), 0);
  // Chapter 0 halfway (500 / 10000 = 5%)
  assert.equal(computeSizeAwareProgress(0, 0.5, sizes), 5);
  // Chapter 0 at end (1000 / 10000 = 10%)
  assert.equal(computeSizeAwareProgress(0, 1.0, sizes), 10);
  // Chapter 1 halfway (1000 + 4500) / 10000 = 55%
  assert.equal(computeSizeAwareProgress(1, 0.5, sizes), 55);
  // Chapter 1 at end
  assert.equal(computeSizeAwareProgress(1, 1.0, sizes), 100);

  // Clamping boundaries
  assert.equal(computeSizeAwareProgress(-1, 0, sizes), 0);
  assert.equal(computeSizeAwareProgress(2, 0.5, sizes), 100);
});

test('formatBlockLocator and parseBlockLocator roundtrip accurately', () => {
  const loc = {
    chapterIndex: 3,
    blockIndex: 12,
    blockId: 'sec-intro',
    charOffset: 85,
    progression: 0.4215,
  };

  const formatted = formatBlockLocator(loc);
  assert.match(formatted, /^loc:v2:ch:3:bk:12:off:85:p:0.4215:id:sec-intro$/);

  const parsed = parseBlockLocator(formatted);
  assert.ok(parsed);
  assert.equal(parsed.chapterIndex, 3);
  assert.equal(parsed.blockIndex, 12);
  assert.equal(parsed.blockId, 'sec-intro');
  assert.equal(parsed.charOffset, 85);
  assert.equal(Math.round(parsed.progression * 10000), 4215);
});

test('parseBlockLocator backwards compatibility with legacy formats', () => {
  // Legacy fraction locator
  const frac = parseBlockLocator('spine:4:frac:0.75');
  assert.ok(frac);
  assert.equal(frac.chapterIndex, 4);
  assert.equal(frac.progression, 0.75);

  // Legacy scroll locator
  const scroll = parseBlockLocator('spine:2:scroll:450');
  assert.ok(scroll);
  assert.equal(scroll.chapterIndex, 2);
  assert.equal(scroll.charOffset, 0);

  // Simple spine target
  const simple = parseBlockLocator('spine:7');
  assert.ok(simple);
  assert.equal(simple.chapterIndex, 7);
});

test('annotateAndChunkChapterBlocks annotates tags and preserves atomic elements', () => {
  const sampleHtml = `
    <h1 class="title">Chapter 1</h1>
    <p>First paragraph with text.</p>
    <table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>
    <p>Second paragraph after table.</p>
  `;

  const { annotatedHtml, blockCount, chunks } = annotateAndChunkChapterBlocks(sampleHtml, 2, 2000);

  assert.equal(blockCount, 4);
  assert.match(annotatedHtml, /data-block-id="c2-b0"/);
  assert.match(annotatedHtml, /data-block-id="c2-b1"/);
  assert.match(annotatedHtml, /data-block-id="c2-b2"/);
  assert.match(annotatedHtml, /data-block-id="c2-b3"/);

  // Table tag itself should contain data-block-id without splitting internal tr/td
  assert.match(annotatedHtml, /<table data-block-id="c2-b2"><tr><td>Cell 1<\/td>/);
  assert.ok(chunks.length >= 1);
});

test('ChapterHeightModel calibrates dynamically from live measurements', () => {
  const sizes = [1000, 2000, 3000];
  const model = new ChapterHeightModel(sizes);

  const initialEst0 = model.getEstimatedHeight(0);
  const initialEst1 = model.getEstimatedHeight(1);
  assert.ok(initialEst0 > 0);
  assert.ok(initialEst1 > initialEst0);

  // Calibrate chapter 0 with an empirical measurement (e.g. 1000 chars measured at 800px)
  model.calibrate(0, 800);
  assert.equal(model.getEstimatedHeight(0), 800);

  // Chapter 1 estimate should now be scaled based on updated empirical ratio (~0.8 px/char)
  const calibratedEst1 = model.getEstimatedHeight(1);
  assert.ok(Math.abs(calibratedEst1 - 1600) < 300);
});

test('computeHydrationWindow adapts to scrolling velocity', () => {
  // Resting / normal reading
  const resting = computeHydrationWindow(0.1, 800);
  assert.equal(resting.topRatio, -1.2);
  assert.equal(resting.bottomRatio, 2.0);

  // Fast downward fling
  const fastDown = computeHydrationWindow(1.8, 800);
  assert.ok(fastDown.bottomRatio > 3.0);
  assert.ok(fastDown.bottomRatio <= 4.5);

  // Fast upward fling
  const fastUp = computeHydrationWindow(-1.5, 800);
  assert.ok(fastUp.topRatio < -2.0);
  assert.ok(fastUp.topRatio >= -3.5);
});
