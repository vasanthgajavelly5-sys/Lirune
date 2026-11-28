/**
 * Runtime & regression tests guarding the Chromium Blink cover layout crash,
 * duplicate cover suppression, and WebView recovery behavior.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReaderDocument } from '../services/epub/readerDocument.ts';
import { computeReaderLayout } from '../services/reader/readerLayout.ts';
import {
  hasStandaloneCoverContent,
  firstChapterMatchesCover,
  resolveInitialCoverHtml,
} from '../services/epub/coverHelper.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

test('Calibre nested .svg_outer/.svg_inner covers never combine display:flex with page-break-inside:avoid', () => {
  const layout = computeReaderLayout({
    containerWidth: 412,
    containerHeight: 800,
    insets: { top: 24, bottom: 24, left: 0, right: 0 },
    fontSize: 18,
    userMargin: 20,
    pageGap: 20,
    fontScale: 1.0,
  });

  const html = buildReaderDocument({
    mode: 'paginated',
    bookCss: '',
    body: '<div class="svg_outer"><div class="svg_inner"><div class="epub-cover-container"><img src="data:image/jpeg;base64,AAA" alt="Cover" data-cover="true" /></div></div></div>',
    palette: {
      bg: '#FDFCF8',
      text: '#1A1410',
      muted: '#6B6055',
      link: '#245A8D',
    },
    fontFamily: 'Serif',
    fontSize: 18,
    lineHeight: 1.6,
    alignment: 'left',
    paragraphSpacing: 0.8,
    layout,
    twoColumn: false,
    startAtEnd: false,
    initialScrollY: 0,
  });

  // Only .epub-cover-container may own display:flex + page-break-inside:avoid;
  // applying those to .svg_outer/.svg_inner caused Blink tile-memory crash (code -1).
  const outerRuleMatch = html.match(/\.svg_outer[^{]*\{([^}]*)\}/);
  assert.ok(outerRuleMatch, 'Generated CSS should include .svg_outer normalization rule');
  const outerRule = outerRuleMatch[1];
  assert.ok(!/display\s*:\s*flex/i.test(outerRule), '.svg_outer/.svg_inner must NOT force display:flex');
  assert.ok(!/page-break-inside\s*:\s*avoid/i.test(outerRule), '.svg_outer/.svg_inner must NOT force page-break-inside:avoid');
  assert.match(html, /\.epub-cover-container\s*\{[^}]*page-break-inside\s*:\s*avoid/);
});

test('Cover resolution skips prepending coverHtml when chapter 0 already shows a standalone cover', async () => {
  const standaloneChapter = {
    id: 'ch0',
    itemPath: 'Text/cover.xhtml',
    title: 'Cover',
    body: '<div class="svg_outer"><img src="data:image/png;base64,AAA" /></div>',
  };

  assert.equal(hasStandaloneCoverContent(standaloneChapter, 0), true);
  assert.equal(firstChapterMatchesCover(standaloneChapter), true);

  let dataUriCalls = 0;
  const resolved = await resolveInitialCoverHtml({
    initialIdx: 0,
    initialChapter: standaloneChapter,
    loadedChapters: [standaloneChapter],
    archiveCoverPath: 'Images/cover.jpg',
    bookCoverUrl: '/data/covers/cover.jpg',
    archive: {
      dataUri: async () => {
        dataUriCalls++;
        return 'data:image/jpeg;base64,BBB';
      },
    },
    readCoverBase64: async () => 'CCC',
  });

  assert.equal(resolved, undefined, 'Must not double-render cover when chapter 0 already has one');
  assert.equal(dataUriCalls, 0);
});

test('Cover resolution falls back cleanly to base64 disk cover without Buffer global', async () => {
  const chapter0 = {
    id: 'ch1',
    itemPath: 'Text/chapter1.xhtml',
    title: 'Chapter 1',
    body: '<p>' + 'Story text '.repeat(80) + '</p>',
  };

  const resolved = await resolveInitialCoverHtml({
    initialIdx: 0,
    initialChapter: chapter0,
    loadedChapters: [chapter0],
    archiveCoverPath: undefined,
    bookCoverUrl: '/data/user/0/com.lirune.reader/files/covers/book.webp',
    archive: { dataUri: async () => null },
    readCoverBase64: async () => 'QUJD',
  });

  assert.ok(resolved?.includes('src="data:image/webp;base64,QUJD"'), 'Must wrap disk cover as webp base64 data URI');
  assert.ok(resolved?.includes('class="epub-cover-container"'));
});

test('useWebViewRecovery does not misclassify clean OS termination (didCrash omitted/false) as a crash loop', () => {
  const recoverySrc = fs.readFileSync(path.join(mobileRoot, 'hooks', 'useWebViewRecovery.ts'), 'utf8');
  assert.match(
    recoverySrc,
    /nativeEvent\?\.didCrash\s*\?\?\s*nativeEvent\?\.crashed\s*\?\?\s*false/,
    'Default didCrash fallback must be false so clean OS memory reaps do not trigger crash remount loops'
  );
  assert.ok(!/nativeEvent\?\.crashed\s*\?\?\s*true/.test(recoverySrc), 'Must never default didCrash/crashed to true');
});
