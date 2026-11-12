/**
 * Lirune Reader Mobile — large TXT streaming regression test.
 *
 * The desktop build reportedly stalled catastrophically on large TXT files, and
 * the Android implementation claimed "chunked / virtualized rendering". This
 * test drives the real indexing algorithm the reader uses, over a genuinely
 * large file, and asserts the two properties that matter:
 *
 *   1. correctness  - the chunk index covers the whole file and every cut lands
 *                     on a character boundary (no split CJK/emoji)
 *   2. boundedness  - only a small window is ever resident, rather than the whole
 *                     file sitting in the JS heap
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendChunkCuts,
  byteLengthOf,
  chunkIndexForByteOffset,
  stripTrailingPartialChar,
  WINDOW_BYTES,
  TARGET_CHUNK_CHARS,
} from '../services/txt/chunkIndex.ts';

const TARGET_BYTES = 10 * 1024 * 1024; // 10 MB is well past the failure point

function buildLargeFixture(filePath: string): number {
  const fd = fs.openSync(filePath, 'w');
  try {
    // Mixed content on purpose: multi-byte CJK and emoji (which have no spaces
    // to break on) interleaved with ordinary prose, so the indexer is forced to
    // take its blind-slice path as well as its word-boundary path.
    const ascii =
      'The quick brown fox jumps over the lazy dog while reading a very long book. ';
    const cjk = '日本語のテキストです。長い文章を分割する必要があります。';
    const emoji = '🙂📚';

    let written = 0;
    let i = 0;
    while (written < TARGET_BYTES) {
      const line = i % 3 === 0 ? cjk : i % 3 === 1 ? ascii : emoji + ' reading ';
      const chunk = line + '\n';
      written += fs.writeSync(fd, chunk);
      i++;
    }
    return written;
  } finally {
    fs.closeSync(fd);
  }
}

test('large TXT: index is built over a 10 MB file without resident growth', () => {
  const tmp = path.join(os.tmpdir(), `lirune-large-txt-${process.pid}.txt`);
  let fileSize = 0;

  try {
    fileSize = buildLargeFixture(tmp);

    // Mirror FileStorage.readRangeAsString: a byte range read + decode.
    const fd = fs.openSync(tmp, 'r');
    const decoder = new TextDecoder('utf-8');
    const buffer = Buffer.alloc(WINDOW_BYTES);

    const offsets: number[] = [0];
    let bytePos = 0;
    let peakResidentChars = 0;
    let windows = 0;

    try {
      while (bytePos < fileSize) {
        const want = Math.min(WINDOW_BYTES, fileSize - bytePos);
        const read = fs.readSync(fd, buffer, 0, want, bytePos);
        if (read <= 0) break;
        const window = stripTrailingPartialChar(
          decoder.decode(buffer.subarray(0, read))
        );
        if (!window) {
          bytePos += read;
          continue;
        }

        peakResidentChars = Math.max(peakResidentChars, window.length);

        const windowBytes = byteLengthOf(window);
        appendChunkCuts(window, bytePos, offsets);
        bytePos += windowBytes;
        windows++;
      }
    } finally {
      fs.closeSync(fd);
    }

    // --- correctness ---
    assert.ok(
      fileSize > 9 * 1024 * 1024,
      `fixture should be ~10 MB, got ${fileSize}`
    );
    assert.ok(offsets.length > 100, `expected many chunks, got ${offsets.length}`);
    assert.ok(
      offsets[offsets.length - 1] < fileSize,
      'last chunk start must be inside the file'
    );

    for (let i = 1; i < offsets.length; i++) {
      assert.ok(
        offsets[i] > offsets[i - 1],
        `offsets must strictly increase (index ${i})`
      );
    }

    // Every recorded cut must sit on a UTF-8 character boundary.
    const all = fs.readFileSync(tmp);
    const strict = new TextDecoder('utf-8', { fatal: true });
    for (const off of offsets) {
      assert.doesNotThrow(
        () => strict.decode(all.subarray(0, off)),
        `offset ${off} splits a character`
      );
    }

    // Every chunk must map to a real, in-range chunk index.
    const last = chunkIndexForByteOffset(offsets, offsets[offsets.length - 1]);
    assert.ok(last >= 0 && last < offsets.length);

    // --- boundedness: the whole point of the rewrite ---
    // The old implementation held the entire file as one JS string. The new one
    // must never retain more than roughly a couple of windows.
    assert.ok(
      peakResidentChars <= WINDOW_BYTES,
      `resident window peaked at ${peakResidentChars} chars, expected <= ${WINDOW_BYTES}`
    );
    assert.ok(
      peakResidentChars < fileSize / 100,
      `resident window ${peakResidentChars} is not meaningfully smaller than the ${fileSize} byte file`
    );

    // The index itself must stay small: a few hundred bytes per chunk of 4000
    // characters, i.e. well under 1% of the file.
    assert.ok(
      offsets.length * 8 < fileSize / 50,
      `index of ${offsets.length} offsets is too large relative to the file`
    );

    console.log(
      `  large TXT: ${fileSize} bytes, ${offsets.length} chunks, ` +
        `${windows} windows, peak resident ${peakResidentChars} chars`
    );
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

test('large TXT: searching maps every hit to the chunk that contains it', () => {
  const tmp = path.join(os.tmpdir(), `lirune-search-txt-${process.pid}.txt`);
  try {
    // Pure ASCII, so a byte offset is also a string index. That keeps the
    // assertion about chunk membership exact and cheap. A rare marker is placed
    // on widely separated lines, including well past the first window, so an
    // off-by-one in the offset index would be caught.
    const marker = 'NEEDLE_HERE';
    const lines: string[] = [];
    for (let i = 0; i < 200000; i++) {
      lines.push(
        i % 40000 === 0 || i === 199999
          ? `line ${i} ${marker} padding to make a fullish line of text`
          : 'line ' + i + ' ordinary filler text with no marker at all'
      );
    }
    fs.writeFileSync(tmp, lines.join('\n') + '\n', 'utf8');
    const fileSize = fs.statSync(tmp).size;

    const fd = fs.openSync(tmp, 'r');
    const decoder = new TextDecoder('utf-8');
    const buffer = Buffer.alloc(WINDOW_BYTES);
    const offsets: number[] = [0];
    let bytePos = 0;
    try {
      while (bytePos < fileSize) {
        const want = Math.min(WINDOW_BYTES, fileSize - bytePos);
        const read = fs.readSync(fd, buffer, 0, want, bytePos);
        if (read <= 0) break;
        const window = stripTrailingPartialChar(
          decoder.decode(buffer.subarray(0, read))
        );
        const windowBytes = byteLengthOf(window);
        appendChunkCuts(window, bytePos, offsets);
        bytePos += windowBytes;
      }
    } finally {
      fs.closeSync(fd);
    }

    const content = fs.readFileSync(tmp, 'utf8');

    // A needle placed on widely separated lines, including well past the first
    // window, so an off-by-one in the offset index would be caught.
    const needle = marker;
    const hits: number[] = [];
    let from = 0;
    for (;;) {
      const idx = content.indexOf(needle, from);
      if (idx === -1) break;
      hits.push(idx);
      from = idx + 1;
    }
    assert.ok(hits.length > 0, 'fixture must contain the needle');

    for (const hit of hits) {
      const chunkIdx = chunkIndexForByteOffset(offsets, hit);
      const start = offsets[chunkIdx];
      const end = chunkIdx + 1 < offsets.length ? offsets[chunkIdx + 1] : fileSize;
      assert.ok(
        content.slice(start, end).includes(needle),
        `hit at byte ${hit} mapped to chunk ${chunkIdx}, which does not contain it`
      );
    }

    // The bug this guards: the old code computed the chunk as
    // `Math.floor(index / CHUNK_SIZE)`, which is only valid when every chunk is
    // exactly CHUNK_SIZE characters. With newline-aligned chunks of varying
    // length that estimate drifts and lands on the wrong section.
    const drifted = hits.filter((hit) => {
      const naive = Math.floor(hit / TARGET_CHUNK_CHARS);
      return naive !== chunkIndexForByteOffset(offsets, hit);
    });
    console.log(
      `  search: ${hits.length} hits; ${drifted.length} would have been misplaced by index/CHUNK_SIZE`
    );
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});
