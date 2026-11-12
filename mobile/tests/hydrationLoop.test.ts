/**
 * Regression test for duplicate library hydration.
 *
 * The real bug was a duplicate in-flight load from the store and the global
 * annotation screen. We validate the guard function directly so the test stays
 * runnable in plain Node without the app's bundler-specific alias resolution.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldSkipLibraryLoad } from '../state/hydrationGuard.ts';

test('shouldSkipLibraryLoad prevents duplicate in-flight loads', () => {
  assert.equal(
    shouldSkipLibraryLoad({ isLoading: true, hasLoaded: false }),
    true,
    'a second load should be skipped while the first is still active'
  );

  assert.equal(
    shouldSkipLibraryLoad({ isLoading: false, hasLoaded: false }),
    false,
    'the first data fetch must still be allowed'
  );

  assert.equal(
    shouldSkipLibraryLoad({ isLoading: false, hasLoaded: true }),
    false,
    'a refresh/reload should still be permitted after hydration'
  );
});
