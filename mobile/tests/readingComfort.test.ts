/**
 * Lirune Reader Mobile — reading comfort and continuous-scroll regressions.
 *
 * These cover the defects reported against the Android reader:
 *
 *  - continuous scroll mode could open onto nothing but chapter headings and
 *    "Loading chapter…" placeholders, and stay that way;
 *  - the reader re-resolved and re-opened its document every time an engine
 *    reported a chapter count, so the position was thrown away;
 *  - the header and the footer reported different chapter numbers;
 *  - the first frames of a freshly opened book showed unstyled content.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_READER_SETTINGS,
  MIN_READER_BRIGHTNESS,
  clampReaderBrightness,
} from '../models/Book.ts';
import { buildContinuousShell, buildReaderDocument } from '../services/epub/readerDocument.ts';
import { parseSpineTarget, createSpineTarget } from '../services/epub/navigation.ts';
import { computeReaderLayout } from '../services/reader/readerLayout.ts';
import { computeReaderGeometry } from '../services/epub/readerGeometry.ts';

const PALETTE = { bg: '#FFFFFF', text: '#111111', muted: '#777777', link: '#2255AA' };

function documentFor(mode: 'paginated' | 'continuous') {
  return buildReaderDocument({
    mode,
    bookCss: '',
    body: mode === 'continuous' ? buildContinuousShell(3, ['One', 'Two', 'Three'], 1, '<p>Two</p>') : '<p>x</p>',
    palette: PALETTE,
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    alignment: 'left',
    paragraphSpacing: 1,
    layout: computeReaderLayout({
      containerWidth: 360,
      containerHeight: 640,
      insets: { top: 24, bottom: 24, left: 0, right: 0 },
      fontSize: 18,
      userMargin: DEFAULT_READER_SETTINGS.margin,
      pageGap: 16,
      fontScale: 1,
    }),
    twoColumn: false,
    startAtEnd: false,
    initialScrollY: 0,
  });
}

// ---------------------------------------------------------------------------
// Default margins
// ---------------------------------------------------------------------------

test('the reader opens with standard margins, not the compact preset', () => {
  assert.equal(DEFAULT_READER_SETTINGS.margin, 20);
  // "Standard" is the middle preset in the appearance panel, so the default has
  // to match it or the panel opens with nothing selected.
  const presets = [12, 20, 28];
  assert.ok(presets.includes(DEFAULT_READER_SETTINGS.margin));
});

test('reader margins never reflow the document on their own', () => {
  const layout = computeReaderLayout({
    containerWidth: 360,
    containerHeight: 640,
    insets: { top: 24, bottom: 24, left: 0, right: 0 },
    fontSize: 18,
    userMargin: 20,
    pageGap: 16,
    fontScale: 1,
  });
  const geometry = computeReaderGeometry(DEFAULT_READER_SETTINGS, layout, false);
  assert.match(geometry.key, /\|20\|/);
});

// ---------------------------------------------------------------------------
// Brightness + keep screen awake
// ---------------------------------------------------------------------------

test('brightness is clamped into the range the edge gesture can produce', () => {
  assert.equal(clampReaderBrightness(100), 100);
  assert.equal(clampReaderBrightness(70), 70);
  assert.equal(clampReaderBrightness(0), MIN_READER_BRIGHTNESS);
  assert.equal(clampReaderBrightness(-25), MIN_READER_BRIGHTNESS);
  assert.equal(clampReaderBrightness(1000), 100);
});

test('a settings blob without the new keys still yields a usable brightness', () => {
  // Settings written before brightness existed have no such key at all.
  assert.equal(clampReaderBrightness(undefined), 100);
  // A hand-edited or corrupted store must not put the reader in the dark.
  assert.equal(clampReaderBrightness(Number.NaN), 100);
  assert.equal(clampReaderBrightness('60' as unknown as number), 100);
});

test('keep screen awake is on by default so the screen does not sleep mid-chapter', () => {
  assert.equal(DEFAULT_READER_SETTINGS.keepScreenAwake, true);
});

test('brightness and keep-awake are not part of the rendered document identity', () => {
  // Both are read by the host, not the WebView: if they entered the geometry
  // key, dimming the page would reload the document and lose the reading
  // position on every step of the gesture.
  const layout = computeReaderLayout({
    containerWidth: 360,
    containerHeight: 640,
    insets: { top: 24, bottom: 24, left: 0, right: 0 },
    fontSize: 18,
    userMargin: 20,
    pageGap: 16,
    fontScale: 1,
  });
  const base = computeReaderGeometry(DEFAULT_READER_SETTINGS, layout, false);
  const dimmedSettings = { ...DEFAULT_READER_SETTINGS, brightness: 40, keepScreenAwake: false };
  const dimmed = computeReaderGeometry(dimmedSettings, layout, false);
  assert.equal(dimmed.key, base.key);
});

// ---------------------------------------------------------------------------
// First frame
// ---------------------------------------------------------------------------

test('both reader modes announce their own first painted frame', () => {
  for (const mode of ['paginated', 'continuous'] as const) {
    const html = documentFor(mode);
    assert.match(html, /type: 'readerReady'/, `${mode} must announce its first paint`);
    // Announced after two frames, not on load: `load` still precedes the frame
    // the reader can see, which is what produced the unstyled flash.
    const announce = html.indexOf('readerReady');
    const rafCount = html.slice(0, announce).split('requestAnimationFrame').length - 1;
    assert.ok(rafCount >= 2, `${mode} must wait for two frames before revealing`);
  }
});

// ---------------------------------------------------------------------------
// Page turn feel
// ---------------------------------------------------------------------------

test('a page turn animates, but a re-measure or zoom does not', () => {
  const html = documentFor('paginated');

  assert.match(html, /#book-content\.no-anim/, 'there must be a no-animation class');
  assert.match(html, /transition: transform 240ms/, 'the turn itself is a transition');
  // goToPage is the reader-driven turn and must animate.
  assert.match(html, /currentPage = p;\s*updateTransform\(true\)/);
  // A zoom, the load-time restore and a post-remeasure clamp must not queue
  // behind an easing turn, which is what read as lag.
  assert.match(html, /measurePages\(\);\s*updateTransform\(false\)/);
  assert.match(html, /currentPage = startAtEnd \? Math\.max\(0, totalPages - 1\) : 0;\s*updateTransform\(false\)/);
});

// ---------------------------------------------------------------------------
// Continuous scroll hydration
// ---------------------------------------------------------------------------

test('continuous mode asks the host for the chapters it can actually see', () => {
  const html = documentFor('continuous');

  // Demand-driven hydration is the fix for a book that opened onto nothing but
  // headings: the document names the unloaded sections near the viewport.
  assert.match(html, /chapter-section\[data-loaded="false"\]/);
  assert.match(html, /type: 'hydrateRequest'/);
  assert.match(html, /window\.__liruneScanPending = scanPendingChapters/);
  // Scrolling is what surfaces new sections, so a scroll must ask as well.
  const scrollHandler = html.slice(html.indexOf("addEventListener('scroll'"));
  assert.match(scrollHandler, /scanPendingChapters\(false\)/);
});

test('continuous mode stops suppressing scroll progress once hydration is done', () => {
  const html = documentFor('continuous');
  assert.match(html, /window\.__epubHydrating = true/);
  assert.match(html, /if \(window\.__epubHydrating\) return;/);
});

test('a tap that actually scrolled never turns a chapter', () => {
  const html = documentFor('continuous');
  const tap = html.slice(html.indexOf('document.addEventListener(\'touchend\''));

  // Movement, duration and the scroll offset all have to agree this was a tap.
  // The offset is the one that catches a fling whose finger ends where it began.
  assert.match(tap, /Math\.abs\(dx\) > 10 \|\| Math\.abs\(dy\) > 10/);
  assert.match(tap, /elapsed > 320/);
  assert.match(tap, /Math\.abs\(window\.pageYOffset - touchStartScrollY\) > 4/);
});

test('the edge zones reserved for brightness leave the page-turn zones free', () => {
  const html = documentFor('continuous');
  const tap = html.slice(html.indexOf('document.addEventListener(\'touchend\''));
  // The chapter-turn zones stay narrower than the 22% the edge gesture covers,
  // so a swipe on the edge is never also read as a chapter change.
  assert.match(tap, /ratio < 0\.18/);
  assert.match(tap, /ratio > 0\.82/);
});

test('a continuous shell marks only the seeded chapter as loaded', () => {
  const shell = buildContinuousShell(4, ['A', 'B', 'C', 'D'], 2, '<p>C body</p>');
  const loaded = shell.match(/data-loaded="true"/g) ?? [];
  assert.equal(loaded.length, 1, 'only the seeded section may claim to be loaded');
  // The rest must stay discoverable by the hydration scanner.
  assert.equal((shell.match(/data-loaded="false"/g) ?? []).length, 3);
  assert.match(shell, /id="chapter-body-0"/);
  assert.match(shell, /id="chapter-body-3"/);
});

// ---------------------------------------------------------------------------
// Chapter number agreement
// ---------------------------------------------------------------------------

test('a published scroll position and a chapter jump address the same chapter', () => {
  // The header counts from the published CFI; the footer counts from the engine's
  // spine index. They can only agree if both parse the same token, so the two
  // shapes a continuous reader emits have to parse identically.
  const scrolled = parseSpineTarget('spine:6:scroll:1840');
  const jumped = parseSpineTarget(createSpineTarget(6));
  assert.equal(scrolled?.spineIndex, jumped?.spineIndex);
  assert.equal(scrolled?.scrollY, 1840);
});

test('an unparseable position reports no chapter rather than chapter zero', () => {
  assert.equal(parseSpineTarget('page:12'), null);
  assert.equal(parseSpineTarget(''), null);
  assert.equal(parseSpineTarget('spine:abc'), null);
});