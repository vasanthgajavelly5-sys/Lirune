/**
 * Lirune Mobile - Performance Instrumentation Tests
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perf } from '../utils/perf.ts';

test('perf instrumentation: mark, measure, now, and clear', () => {
  assert.equal(typeof perf.now(), 'number');
  assert.ok(perf.now() > 0);

  // Mark and measure
  perf.mark('test-operation');
  const duration = perf.measure('test-operation');
  assert.equal(typeof duration, 'number');
  assert.ok(duration >= 0);

  // Measure with non-existent mark returns 0
  assert.equal(perf.measure('non-existent-mark'), 0);

  // Clear specific mark
  perf.mark('op-1');
  perf.clear('op-1');
  assert.equal(perf.measure('op-1'), 0);

  // Clear all marks
  perf.mark('op-2');
  perf.clear();
  assert.equal(perf.measure('op-2'), 0);
});
