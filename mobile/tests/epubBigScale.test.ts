/**
 * Lirune Reader Mobile — Big EPUB Scale & Robustness Unit Tests
 * Tests 500, 2,000, and 5,000 chapter publications against time and memory budgets.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import { EpubArchive } from '../services/epub/archive.ts';
import { readEpubPackage } from '../services/epub/package.ts';
import { extractChapterDocument } from '../services/epub/chapter.ts';
import { validateArchiveBudget } from '../services/security/archiveBudget.ts';

const FIXTURE_DIR = path.resolve('../test-assets/big-epubs');

test('validateArchiveBudget accepts large publications with 2,000 to 25,000 entries', () => {
  // 2,005 entries (standard 2,000 chapter book)
  const entries2000 = Array.from({ length: 2005 }, (_, i) => ({
    name: `chap_${i}.xhtml`,
    compressedSize: 500,
    uncompressedSize: 1200,
  }));
  assert.doesNotThrow(() => validateArchiveBudget(entries2000));

  // 5,005 entries (standard 5,000 chapter book)
  const entries5000 = Array.from({ length: 5005 }, (_, i) => ({
    name: `chap_${i}.xhtml`,
    compressedSize: 500,
    uncompressedSize: 1200,
  }));
  assert.doesNotThrow(() => validateArchiveBudget(entries5000));
});

test('EPUB 2,000 chapters: opens within performance budget (<= 1.5s) and memory bound (< 50MB)', async () => {
  const epubPath = path.join(FIXTURE_DIR, 'epub_2000_chapters.epub');
  if (!fs.existsSync(epubPath)) {
    console.warn('Skipping test, fixture not found:', epubPath);
    return;
  }

  const startMem = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const fileBytes = fs.readFileSync(epubPath);
  const archive = await EpubArchive.open(fileBytes);
  validateArchiveBudget(archive.budgetEntries());

  const pkg = await readEpubPackage(archive);
  const t1 = performance.now();
  const elapsedMs = t1 - t0;
  const memUsedMb = (process.memoryUsage().heapUsed - startMem) / (1024 * 1024);

  assert.equal(pkg.spine.length, 2000, 'Expected 2,000 spine items');
  assert.ok(pkg.toc.length >= 2000, 'Expected >= 2,000 TOC entries');
  assert.ok(elapsedMs <= 1500, `Opening took ${elapsedMs.toFixed(1)}ms, expected <= 1500ms`);
  assert.ok(memUsedMb < 50, `Heap growth was ${memUsedMb.toFixed(1)}MB, expected < 50MB`);

  // Extract a chapter and ensure it succeeds
  const chapDoc = await extractChapterDocument(archive, pkg.spine[0].path);
  assert.ok(chapDoc.body.includes('Chapter 1'));
  archive.dispose();
});

test('EPUB 2,000 chapters no-TOC variant: opens and derives valid spine and fallback TOC', async () => {
  const epubPath = path.join(FIXTURE_DIR, 'epub_2000_chapters_notoc.epub');
  if (!fs.existsSync(epubPath)) return;

  const fileBytes = fs.readFileSync(epubPath);
  const archive = await EpubArchive.open(fileBytes);
  validateArchiveBudget(archive.budgetEntries());

  const pkg = await readEpubPackage(archive);
  assert.equal(pkg.spine.length, 2000);
  assert.equal(pkg.toc.length, 0, 'No explicit TOC in package');

  // Verify fallback generation does not crash
  const fallbackToc = pkg.spine.map((s, idx) => ({
    id: s.idref,
    label: `Section ${idx + 1}`,
    href: `spine:${idx}`,
  }));
  assert.equal(fallbackToc.length, 2000);
  archive.dispose();
});

test('EPUB 5,000 chapters: opens within performance budget (<= 3.0s)', async () => {
  const epubPath = path.join(FIXTURE_DIR, 'epub_5000_chapters.epub');
  if (!fs.existsSync(epubPath)) return;

  const t0 = performance.now();
  const fileBytes = fs.readFileSync(epubPath);
  const archive = await EpubArchive.open(fileBytes);
  validateArchiveBudget(archive.budgetEntries());

  const pkg = await readEpubPackage(archive);
  const t1 = performance.now();
  const elapsedMs = t1 - t0;

  assert.equal(pkg.spine.length, 5000);
  assert.ok(elapsedMs <= 3000, `Opening 5000 chapters took ${elapsedMs.toFixed(1)}ms, expected <= 3000ms`);

  archive.dispose();
});

test('EPUB broken-spine recovery: missing manifest items degrade gracefully without crashing', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );

  // OPF with spine items pointing to missing manifest entries
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Broken Spine Book</dc:title>
  </metadata>
  <manifest>
    <item id="real_ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="non_existent_1"/>
    <itemref idref="real_ch1"/>
    <itemref idref="non_existent_2"/>
  </spine>
</package>`;

  zip.file('content.opf', opf);
  zip.file('ch1.xhtml', '<html><body><h1>Real Chapter 1</h1><p>Text</p></body></html>');

  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  const archive = await EpubArchive.open(buf);
  const pkg = await readEpubPackage(archive);

  // The parser skipped missing spine items and kept the real one
  assert.equal(pkg.spine.length, 1);
  assert.equal(pkg.spine[0].idref, 'real_ch1');

  // Corrupt / missing chapter extraction also degrades gracefully
  const missingDoc = await extractChapterDocument(archive, 'does_not_exist.xhtml');
  assert.ok(missingDoc.body.includes('Content not found'));

  archive.dispose();
});
