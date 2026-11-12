/**
 * Reader layout tests: display cutouts, size classes and the column rule.
 *
 * The layout is derived from measured dimensions plus real insets, so these
 * tests are the only place the cutout and column arithmetic can be pinned down
 * without a device in landscape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeReaderLayout, type ReaderInsets } from '../../services/reader/readerLayout.ts';
import {
  COLUMN_HYSTERESIS_DP,
  TWO_COLUMN_MIN_WIDTH,
  computeReaderGeometry,
  resolveTwoColumn,
  type ReaderGeometrySettings,
} from '../../services/epub/readerGeometry.ts';

const NO_INSETS: ReaderInsets = { top: 0, bottom: 0, left: 0, right: 0 };

function layout(overrides: Partial<Parameters<typeof computeReaderLayout>[0]> = {}) {
  return computeReaderLayout({
    containerWidth: 412,
    containerHeight: 915,
    insets: NO_INSETS,
    fontSize: 18,
    userMargin: 12,
    pageGap: 16,
    fontScale: 1,
    ...overrides,
  });
}

const SETTINGS: ReaderGeometrySettings = {
  flow: 'paginated',
  theme: 'day',
  fontFamily: 'system',
  fontSize: 18,
  lineHeight: 1.6,
  margin: 12,
  pageGap: 16,
  alignment: 'left',
  paragraphSpacing: 1,
};

test('a punch-hole cutout on the left is never covered by text', () => {
  const result = layout({
    containerWidth: 915,
    containerHeight: 412,
    insets: { top: 0, bottom: 0, left: 48, right: 0 },
  });
  // The reading column has to start to the right of the hole, and it has to end
  // before the right edge of the window.
  assert.ok(result.sideOffset >= 48, `sideOffset ${result.sideOffset} must clear a 48dp cutout`);
  assert.ok(result.sideOffset + result.contentWidth <= result.viewportWidth);
});

test('the reader margin can never pull the column under the cutout', () => {
  for (const margin of [0, 12, 24, 64, 200]) {
    const result = layout({
      containerWidth: 915,
      containerHeight: 412,
      insets: { top: 0, bottom: 0, left: 48, right: 16 },
      userMargin: margin,
    });
    assert.ok(result.sideOffset >= 48, `margin ${margin}: sideOffset ${result.sideOffset}`);
  }
});

test('a cutout in landscape reports as a side inset the layout honours', () => {
  const portrait = layout({ containerWidth: 412, containerHeight: 915, insets: { top: 48, bottom: 24, left: 0, right: 0 } });
  const landscape = layout({ containerWidth: 915, containerHeight: 412, insets: { top: 0, bottom: 24, left: 48, right: 0 } });
  assert.ok(landscape.isLandscape);
  assert.ok(portrait.padTop >= 48);
  assert.ok(landscape.sideOffset >= 48);
});

test('chrome keeps a minimum padding when the inset is zero', () => {
  const result = layout({ insets: NO_INSETS });
  assert.ok(result.padTop >= 8);
  assert.ok(result.bottomSafe >= 8);
  assert.ok(result.padBottom > result.progressBarHeight);
});

test('a phone in portrait stays single-column', () => {
  assert.equal(resolveTwoColumn({ settings: SETTINGS, layout: layout(), previousTwoColumn: false }), false);
});

test('a tablet gets two columns only when each column stays readable', () => {
  const tablet = layout({ containerWidth: 1024, containerHeight: 768 });
  assert.equal(resolveTwoColumn({ settings: SETTINGS, layout: tablet, previousTwoColumn: false }), true);

  // Large type pushes the minimum measure past half the window: one column.
  const hugeType = layout({ containerWidth: 1024, containerHeight: 768, fontSize: 40 });
  assert.equal(resolveTwoColumn({ settings: { ...SETTINGS, fontSize: 40 }, layout: hugeType, previousTwoColumn: false }), false);
});

test('the column decision does not flip on a few dp of noise', () => {
  // Switching on needs the +24dp band on both tests, so the window floor moves
  // from 720 to 744dp; switching off uses the -24dp band, so it holds down to 696dp.
  const justOn = layout({ containerWidth: 744, containerHeight: 900, userMargin: 0 });
  const justOff = layout({ containerWidth: 743, containerHeight: 900, userMargin: 0 });

  assert.equal(resolveTwoColumn({ settings: SETTINGS, layout: justOn, previousTwoColumn: false }), true);
  assert.equal(resolveTwoColumn({ settings: SETTINGS, layout: justOff, previousTwoColumn: false }), false);
  // Already two columns: a one dp wobble must not throw the reader back to one.
  assert.equal(resolveTwoColumn({ settings: SETTINGS, layout: justOff, previousTwoColumn: true }), true);
  assert.equal(
    resolveTwoColumn({
      settings: SETTINGS,
      layout: layout({ containerWidth: TWO_COLUMN_MIN_WIDTH - COLUMN_HYSTERESIS_DP - 1, containerHeight: 900, userMargin: 0 }),
      previousTwoColumn: true,
    }),
    false
  );
});

test('a phone-sized landscape window below the width floor stays single-column', () => {
  const narrow = layout({ containerWidth: TWO_COLUMN_MIN_WIDTH - 60, containerHeight: 412 });
  assert.equal(resolveTwoColumn({ settings: SETTINGS, layout: narrow, previousTwoColumn: true }), false);
});

test('the reader setting overrides the automatic decision', () => {
  const tablet = layout({ containerWidth: 1024, containerHeight: 768 });
  assert.equal(resolveTwoColumn({ settings: { ...SETTINGS, columns: 1 }, layout: tablet, previousTwoColumn: true }), false);
  assert.equal(
    resolveTwoColumn({ settings: { ...SETTINGS, columns: 2 }, layout: layout(), previousTwoColumn: false }),
    true
  );
});

test('the column setting is part of the document identity', () => {
  const at = layout({ containerWidth: 1024, containerHeight: 768 });
  const auto = computeReaderGeometry(SETTINGS, at);
  const forcedOne = computeReaderGeometry({ ...SETTINGS, columns: 1 }, at);
  assert.notEqual(auto.key, forcedOne.key);
  assert.equal(auto.twoColumn, true);
  assert.equal(forcedOne.twoColumn, false);
});

test('available width is what the column rule compares against', () => {
  const result = layout({ containerWidth: 1024, containerHeight: 768, userMargin: 12 });
  assert.equal(result.availableWidth, 1024 - 24);
  // The measure is capped for reading comfort long before the window is full.
  assert.ok(result.contentWidth <= result.availableWidth);
});