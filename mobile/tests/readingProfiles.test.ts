/**
 * Unit tests for reading-profiles actions in settingsStore.
 *
 * We exercise the action logic directly by building a minimal
 * in-memory stand-in that mirrors the shape of the Zustand store,
 * so the tests run with zero external dependencies (no React Native,
 * no repository, no TTS service).
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
// Minimal in-memory store that mirrors the profile actions in settingsStore
// ---------------------------------------------------------------------------
function makeStore() {
  let readerSettings: ReaderSettings = { ...DEFAULT_RS };
  let profiles: Record<string, ReaderSettings> = {};
  const persisted: Record<string, any> = {};

  const repo = {
    async setPreference(key: string, value: any) { persisted[key] = value; },
    async getPreference(key: string, def: any) { return persisted[key] ?? def; },
  };

  function get() { return { readerSettings, profiles }; }
  function set(partial: Partial<{ readerSettings: ReaderSettings; profiles: Record<string, ReaderSettings> }>) {
    if (partial.readerSettings !== undefined) readerSettings = partial.readerSettings;
    if (partial.profiles !== undefined) profiles = partial.profiles;
  }

  return {
    get readerSettings() { return readerSettings; },
    get profiles() { return profiles; },
    get persisted() { return persisted; },

    setReaderSettings(rs: ReaderSettings) { readerSettings = rs; },

    async saveProfile(name: string) {
      const current = get().readerSettings;
      const updated = { ...get().profiles, [name]: current };
      set({ profiles: updated });
      try { await repo.setPreference('readingProfiles', updated); } catch {}
    },

    async loadProfile(name: string) {
      const profile = get().profiles[name];
      if (!profile) return;
      const valid = validateRS(profile);
      set({ readerSettings: valid });
      try { await repo.setPreference('readerSettings', valid); } catch {}
    },

    async deleteProfile(name: string) {
      const updated = { ...get().profiles };
      delete updated[name];
      set({ profiles: updated });
      try { await repo.setPreference('readingProfiles', updated); } catch {}
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('saveProfile stores current readerSettings under the given name', async () => {
  const store = makeStore();
  const customRS: ReaderSettings = { ...DEFAULT_RS, fontSize: 22, theme: 'dark' };
  store.setReaderSettings(customRS);

  await store.saveProfile('night');

  assert.deepEqual(store.profiles['night'], customRS);
  assert.deepEqual(store.persisted['readingProfiles']['night'], customRS);
});

test('saveProfile for a second name does not overwrite the first', async () => {
  const store = makeStore();
  store.setReaderSettings({ ...DEFAULT_RS, fontSize: 20 });
  await store.saveProfile('small');
  store.setReaderSettings({ ...DEFAULT_RS, fontSize: 24 });
  await store.saveProfile('large');

  assert.equal(store.profiles['small'].fontSize, 20);
  assert.equal(store.profiles['large'].fontSize, 24);
});

test('loadProfile applies a saved profile to readerSettings', async () => {
  const store = makeStore();
  const nightRS: ReaderSettings = { ...DEFAULT_RS, fontSize: 20, theme: 'dark' };
  store.setReaderSettings(nightRS);
  await store.saveProfile('night');

  // Switch back to default
  store.setReaderSettings({ ...DEFAULT_RS });
  assert.equal(store.readerSettings.fontSize, DEFAULT_RS.fontSize);

  await store.loadProfile('night');

  assert.equal(store.readerSettings.fontSize, 20);
  assert.equal(store.readerSettings.theme, 'dark');
});

test('loadProfile for non-existent name does nothing', async () => {
  const store = makeStore();
  const before = { ...store.readerSettings };

  await store.loadProfile('ghost');

  assert.deepEqual(store.readerSettings, before);
});

test('deleteProfile removes the profile', async () => {
  const store = makeStore();
  store.setReaderSettings({ ...DEFAULT_RS, fontSize: 22 });
  await store.saveProfile('myProfile');
  assert.ok('myProfile' in store.profiles);

  await store.deleteProfile('myProfile');

  assert.ok(!('myProfile' in store.profiles));
  assert.ok(!('myProfile' in (store.persisted['readingProfiles'] ?? {})));
});

test('deleteProfile for non-existent name leaves others intact', async () => {
  const store = makeStore();
  store.setReaderSettings({ ...DEFAULT_RS, fontSize: 22 });
  await store.saveProfile('keep');

  await store.deleteProfile('nonexistent');

  assert.ok('keep' in store.profiles);
});
