import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpineTarget, parseSpineTarget } from '../services/epub/navigation.ts';

test('EPUB navigation preserves and decodes an internal fragment', () => {
  const target = createSpineTarget(3, '#chapter:one');

  assert.equal(target, 'spine:3:anchor:chapter%3Aone');
  assert.deepEqual(parseSpineTarget(target), { spineIndex: 3, anchor: 'chapter:one' });
});

test('EPUB navigation restores global continuous-scroll position without changing its meaning', () => {
  assert.deepEqual(parseSpineTarget('spine:4:scroll:1200'), { spineIndex: 4, scrollY: 1200 });
  assert.deepEqual(parseSpineTarget('spine:4:scroll:-10'), { spineIndex: 4, scrollY: 0 });
});

test('EPUB navigation rejects malformed chapter targets', () => {
  assert.equal(parseSpineTarget('spine:bad'), null);
  assert.equal(parseSpineTarget('page:3'), null);
});
