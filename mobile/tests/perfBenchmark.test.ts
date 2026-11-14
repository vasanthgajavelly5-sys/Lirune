/**
 * Lirune Mobile - Automated Performance & Memory Regression Suite
 *
 * Enforces strict latency and memory growth regression budgets for the mobile
 * reader pipeline. Executed as part of the mandatory release gate pipeline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { EpubArchive } from '../services/epub/archive.ts';
import { sanitizeHtml } from '../services/security/sanitizeHtml.ts';
import { appendChunkCuts } from '../services/txt/chunkIndex.ts';

test('PERF-GATE: EPUB Archive Decompression & Entry Indexing Latency (< 500ms)', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  
  for (let i = 1; i <= 50; i++) {
    zip.file(`OEBPS/ch${i}.xhtml`, `<?xml version="1.0" encoding="utf-8"?><html><head><title>Chapter ${i}</title></head><body><h1>Chapter ${i}</h1><p>Performance benchmark test content paragraph for chapter ${i}.</p></body></html>`);
  }

  const opf = `<?xml version="1.0" encoding="utf-8"?>
  <package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Perf Benchmark Book</dc:title>
      <dc:language>en</dc:language>
    </metadata>
    <manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
    <spine toc="ncx"></spine>
  </package>`;
  zip.file('OEBPS/content.opf', opf);

  const buffer = await zip.generateAsync({ type: 'arraybuffer' });

  const start = performance.now();
  const archive = await EpubArchive.open(buffer);
  const text = await archive.readText('OEBPS/content.opf');
  const elapsed = performance.now() - start;

  assert.ok(archive.has('OEBPS/ch50.xhtml'), 'Must index all 50 chapters');
  assert.ok(text && text.includes('Perf Benchmark Book'), 'Must read OPF text');
  assert.ok(elapsed < 500, `EPUB archive load took ${elapsed.toFixed(1)}ms, exceeding 500ms gate budget`);
});

test('PERF-GATE: Document HTML Sanitization Throughput (< 300ms for 200 blocks)', () => {
  const hostilePayload = `<div onclick="alert(1)"><h2>Header</h2><p>Safe text with <a href="javascript:void(0)">evil link</a></p><script>evil()</script><iframe src="https://attacker.com"></iframe><img src="data:image/png;base64,iVBOR" onerror="alert(2)" /></div>`;

  const start = performance.now();
  for (let i = 0; i < 200; i++) {
    const cleaned = sanitizeHtml(hostilePayload);
    assert.ok(!cleaned.includes('<script'), 'Must strip script tags');
    assert.ok(!cleaned.includes('onclick'), 'Must strip event handlers');
  }
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 300, `200 sanitization passes took ${elapsed.toFixed(1)}ms, exceeding 300ms gate budget`);
});

test('PERF-GATE: TXT Large Chunk Indexing Throughput (< 200ms for 50,000 chars)', () => {
  const sample = 'The quick brown fox jumps over the lazy dog. A calm home for your books. '.repeat(700); // ~51,000 chars

  const cuts: number[] = [];
  const start = performance.now();
  appendChunkCuts(sample, 0, cuts);
  const elapsed = performance.now() - start;

  assert.ok(cuts.length > 0, 'Must produce chunk cuts');
  assert.ok(elapsed < 200, `Large text indexing took ${elapsed.toFixed(1)}ms, exceeding 200ms gate budget`);
});

test('PERF-GATE: Memory Heap Stability Under Cyclic Processing (< 20MB Growth)', () => {
  if (typeof global.gc === 'function') global.gc();
  const baselineMem = process.memoryUsage().heapUsed;

  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    const data = 'Performance memory test cycle '.repeat(1000);
    const cuts: number[] = [];
    appendChunkCuts(data, 0, cuts);
  }

  if (typeof global.gc === 'function') global.gc();
  const finalMem = process.memoryUsage().heapUsed;
  const growthMB = (finalMem - baselineMem) / (1024 * 1024);

  assert.ok(growthMB < 20, `Heap grew by ${growthMB.toFixed(2)}MB, exceeding 20MB budget`);
});
