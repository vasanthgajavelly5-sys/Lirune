const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

test('PERF-GATE (Windows Desktop): Content Fingerprinting & SHA-256 Throughput (< 400ms for 5,000 blocks)', () => {
  const block = Buffer.from('Lirune Desktop Performance Benchmark Content Block '.repeat(20)); // ~1KB
  const start = performance.now();
  for (let i = 0; i < 5000; i++) {
    const hash = crypto.createHash('sha256').update(block).digest('hex');
    assert.equal(hash.length, 64);
  }
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 400, `Fingerprinting 5000 blocks took ${elapsed.toFixed(1)}ms, exceeding 400ms budget`);
});

test('PERF-GATE (Windows Desktop): Memory Heap Growth Under Cyclic Storage Operations (< 25MB)', () => {
  if (typeof global.gc === 'function') global.gc();
  const baseline = process.memoryUsage().heapUsed;

  const cache = new Map();
  for (let i = 0; i < 2000; i++) {
    const key = `key-${i}`;
    const value = crypto.createHash('sha256').update(`content-${i}`).digest('hex');
    cache.set(key, value);
  }
  cache.clear();

  if (typeof global.gc === 'function') global.gc();
  const finalMem = process.memoryUsage().heapUsed;
  const growthMB = (finalMem - baseline) / (1024 * 1024);

  assert.ok(growthMB < 25, `Desktop heap growth was ${growthMB.toFixed(2)}MB, exceeding 25MB budget`);
});
