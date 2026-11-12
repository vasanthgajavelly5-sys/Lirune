import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressPersistenceQueue } from '../state/progressPersistenceQueue.ts';
import type { ReadingProgress } from '../models/Book.ts';

const progress = (value: number): ReadingProgress => ({
  bookId: 'book-1',
  cfi: `cfi:${value}`,
  chapter: `Chapter ${value}`,
  progressPercent: value,
  timeSpent: 0,
  lastRead: value,
});

test('ProgressPersistenceQueue coalesces pending writes and preserves final ordering', async () => {
  const writes: number[] = [];
  let releaseFirst!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const queue = new ProgressPersistenceQueue(async (value) => {
    writes.push(value.progressPercent);
    if (value.progressPercent === 1) await firstWrite;
  });

  const first = queue.enqueue(progress(1));
  const second = queue.enqueue(progress(2));
  const third = queue.enqueue(progress(3));

  await Promise.resolve();
  assert.deepEqual(writes, [1]);
  releaseFirst();
  await Promise.all([first, second, third]);
  assert.deepEqual(writes, [1, 3]);
});

test('ProgressPersistenceQueue flush waits for the latest pending write', async () => {
  const writes: number[] = [];
  const queue = new ProgressPersistenceQueue(async (value) => {
    writes.push(value.progressPercent);
  });

  queue.enqueue(progress(10));
  queue.enqueue(progress(20));
  await queue.flush('book-1');

  assert.deepEqual(writes, [10, 20]);
});