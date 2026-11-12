/**
 * Chapter-header tests for continuous mode.
 *
 * Continuous mode injects its own `<h2 class="chapter-marker">` above every spine
 * item. When the chapter document also opens with its own heading the reader
 * printed the title twice, and when the publication never named a spine item the
 * header printed a positional "Chapter 5" for what is really chapter three.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import { EpubArchive } from '../../services/epub/archive.ts';
import { extractChapterDocument } from '../../services/epub/chapter.ts';
import { startsWithHeading } from '../../services/epub/markup.ts';
import { buildContinuousShell } from '../../services/epub/readerDocument.ts';

async function openChapter(files: Record<string, string>, chapterPath: string) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const archive = await EpubArchive.open(await zip.generateAsync({ type: 'uint8array' }));
  return extractChapterDocument(archive, chapterPath);
}

test('a body opening with an h1-h3 is reported as starting with a heading', () => {
  assert.equal(startsWithHeading('<div><h1>Ch 3</h1><p>Text</p></div>'), true);
  assert.equal(startsWithHeading('<h2 class="x">Second</h2><p>Text</p>'), true);
  assert.equal(startsWithHeading('  \n <section><article><h3>Third</h3></article></section>'), true);
  assert.equal(startsWithHeading('<div><img src="a.png"/><h1>Ch 4</h1></div>'), true);
});

test('a body that starts with prose is not reported as starting with a heading', () => {
  assert.equal(startsWithHeading('<p>Once upon a time</p><h2>Later</h2>'), false);
  assert.equal(startsWithHeading('<ul><li>One</li></ul>'), false);
  assert.equal(startsWithHeading('<h4>Too deep</h4><h1>Real</h1>'), false);
  assert.equal(startsWithHeading('<div><a href="x.html">Link</a><h1>Real</h1></div>'), false);
});

test('an image-only heading is not a chapter heading', () => {
  assert.equal(startsWithHeading('<h1><img src="logo.png"/></h1><p>Text</p>'), false);
  assert.equal(startsWithHeading('<h1><svg viewBox="0 0 1 1"></svg></h1>'), false);
  assert.equal(startsWithHeading(''), false);
});

test('the extracted chapter document reports whether it carries its own heading', async () => {
  const files = {
    'mimetype': 'application/epub+zip',
    'withHeading.xhtml': `<html><body><div class="c"><h1>Chapter One</h1><p>Once…</p></div></body></html>`,
    'withoutHeading.xhtml': '<html><body><p>Once upon a time…</p></body></html>',
  };

  const withHeading = await openChapter(files, 'withHeading.xhtml');
  assert.equal(withHeading.hasLeadingHeading, true);
  assert.equal(withHeading.title, 'Chapter One');

  const withoutHeading = await openChapter(files, 'withoutHeading.xhtml');
  assert.equal(withoutHeading.hasLeadingHeading, false);
});

test('a missing chapter document reports no heading instead of throwing', async () => {
  const files = { 'mimetype': 'application/epub+zip' };
  const doc = await openChapter(files, 'nope.xhtml');
  assert.equal(doc.hasLeadingHeading, false);
});

test('the continuous shell hides its header when the chapter brings its own', () => {
  const shell = buildContinuousShell(2, ['Chapter One', 'Chapter Two'], 0, '<h1>Chapter One</h1><p>x</p>', {
    activeHasLeadingHeading: true,
  });
  assert.match(shell, /id="chapter-0"[^>]*data-has-heading="true"/);
  // The CSS rule that hides it lives in the reader stylesheet.
  assert.match(shell, /<h2 class="chapter-marker">Chapter One<\/h2>/);
});

test('the continuous shell prints no positional label for an unnamed chapter', () => {
  const shell = buildContinuousShell(3, ['', 'Real Title', ''], 0, '<p>Cover</p>');
  assert.doesNotMatch(shell, /Chapter \d/);
  assert.match(shell, /<h2 class="chapter-marker">Real Title<\/h2>/);
  // Sections with no title keep the header element so the injected script can
  // fill it in later, but start hidden.
  assert.match(shell, /<div class="chapter-header" style="display:none"><\/div>/);
});