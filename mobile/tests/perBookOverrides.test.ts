/**
 * Unit tests for per-book reader-setting overrides in libraryStore.
 *
 * Tests run against an inline stand-in that mirrors setBookOverride /
 * clearBookOverride logic, with no external dependencies.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal ReaderSettings used by the tests
// ---------------------------------------------------------------------------
interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: string;
  lineHeight: number;
  paragraphSpacing: number;
  margin: number;
  flow: string;
  alignment: string;
  pageGap: number;
  columns: number;
  keepScreenAwake: boolean;
}

const DEFAULT_RS: ReaderSettings = {
  fontSize: 18,
  fontFamily: 'Georgia',
  theme: 'light',
  lineHeight: 1.6,
  paragraphSpacing: 1,
  margin: 16,
  flow: 'paginated',
  alignment: 'left',
  pageGap: 0.06,
  columns: 1,
  keepScreenAwake: true,
};

function validateRS(raw: any): ReaderSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RS };
  return {
    fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : DEFAULT_RS.fontSize,
    fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : DEFAULT_RS.fontFamily,
    theme: typeof raw.theme === 'string' ? raw.theme : DEFAULT_RS.theme,
    lineHeight: typeof raw.lineHeight === 'number' ? raw.lineHeight : DEFAULT_RS.lineHeight,
    paragraphSpacing: typeof raw.paragraphSpacing === 'number' ? raw.paragraphSpacing : DEFAULT_RS.paragraphSpacing,
    margin: typeof raw.margin === 'number' ? raw.margin : DEFAULT_RS.margin,
    flow: typeof raw.flow === 'string' ? raw.flow : DEFAULT_RS.flow,
    alignment: typeof raw.alignment === 'string' ? raw.alignment : DEFAULT_RS.alignment,
    pageGap: typeof raw.pageGap === 'number' ? raw.pageGap : DEFAULT_RS.pageGap,
    columns: typeof raw.columns === 'number' ? raw.columns : DEFAULT_RS.columns,
    keepScreenAwake: typeof raw.keepScreenAwake === 'boolean' ? raw.keepScreenAwake : DEFAULT_RS.keepScreenAwake,
  };
}

// ---------------------------------------------------------------------------
// Minimal in-memory stand-in mirroring the per-book override actions
// ---------------------------------------------------------------------------
function makeStore() {
  let bookOverrides: Record<string, ReaderSettings> = {};
  const persisted: Record<string, any> = {};

  const repo = {
    async setPreference(key: string, value: any) { persisted[key] = value; },
    async getPreference(key: string, def: any) { return persisted[key] ?? def; },
  };

  function get() { return { bookOverrides }; }
  function set(partial: Partial<{ bookOverrides: Record<string, ReaderSettings> }>) {
    if (partial.bookOverrides !== undefined) bookOverrides = partial.bookOverrides;
  }

  return {
    get bookOverrides() { return bookOverrides; },
    get persisted() { return persisted; },

    async setBookOverride(bookId: string, settings: ReaderSettings) {
      const valid = validateRS(settings);
      const updated = { ...get().bookOverrides, [bookId]: valid };
      set({ bookOverrides: updated });
      try { await repo.setPreference('bookOverrides', updated); } catch {}
    },

    async clearBookOverride(bookId: string) {
      const updated = { ...get().bookOverrides };
      delete updated[bookId];
      set({ bookOverrides: updated });
      try { await repo.setPreference('bookOverrides', updated); } catch {}
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('setBookOverride stores settings for a bookId', async () => {
  const store = makeStore();
  const override: ReaderSettings = { ...DEFAULT_RS, fontSize: 20, theme: 'sepia' };

  await store.setBookOverride('book-001', override);

  assert.ok('book-001' in store.bookOverrides);
  assert.equal(store.bookOverrides['book-001'].fontSize, 20);
  assert.equal(store.bookOverrides['book-001'].theme, 'sepia');
  assert.deepEqual(store.persisted['bookOverrides']['book-001'], store.bookOverrides['book-001']);
});

test('setBookOverride validates and coerces settings', async () => {
  const store = makeStore();

  // Pass a corrupt value for fontSize; validateRS should fall back to default
  await store.setBookOverride('book-001', { ...DEFAULT_RS, fontSize: 'big' as any });

  assert.equal(store.bookOverrides['book-001'].fontSize, DEFAULT_RS.fontSize);
});

test('clearBookOverride removes the override for a bookId', async () => {
  const store = makeStore();
  await store.setBookOverride('book-001', { ...DEFAULT_RS, fontSize: 20 });
  assert.ok('book-001' in store.bookOverrides);

  await store.clearBookOverride('book-001');

  assert.ok(!('book-001' in store.bookOverrides));
  assert.ok(!('book-001' in (store.persisted['bookOverrides'] ?? {})));
});

test('overrides for different books do not interfere', async () => {
  const store = makeStore();
  await store.setBookOverride('book-A', { ...DEFAULT_RS, fontSize: 16 });
  await store.setBookOverride('book-B', { ...DEFAULT_RS, fontSize: 24, theme: 'dark' });

  assert.equal(store.bookOverrides['book-A'].fontSize, 16);
  assert.equal(store.bookOverrides['book-B'].fontSize, 24);
  assert.equal(store.bookOverrides['book-B'].theme, 'dark');

  await store.clearBookOverride('book-A');

  assert.ok(!('book-A' in store.bookOverrides));
  assert.ok('book-B' in store.bookOverrides);
  assert.equal(store.bookOverrides['book-B'].fontSize, 24);
});

test('clearBookOverride for non-existent bookId leaves others intact', async () => {
  const store = makeStore();
  await store.setBookOverride('book-keep', { ...DEFAULT_RS, fontSize: 22 });

  await store.clearBookOverride('book-nonexistent');

  assert.ok('book-keep' in store.bookOverrides);
});
