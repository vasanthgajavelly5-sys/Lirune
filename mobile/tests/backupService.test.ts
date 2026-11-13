import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackupService } from '../services/storage/BackupService.ts';

const mockRepo = {
  getBooks: async () => [{ id: 'b1', title: 'Test Book', author: 'Author' }],
  getCollections: async () => [{ id: 'c1', name: 'Favorites' }],
  getAnnotations: async () => [{ id: 'a1', text: 'My note' }],
  getPreference: async (key: string) => {
    if (key === 'appTheme') return 'dark';
    if (key === 'readerSettings') return { fontSize: 20 };
    return null;
  },
  setPreference: async (_key: string, _val: any) => {},
  saveAnnotation: async (_ann: any) => {},
};

test('exportLibrary produces valid JSON with version and metadata', async () => {
  const json = await BackupService.exportLibrary(mockRepo);
  assert.ok(typeof json === 'string');
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, 1);
  assert.ok(Array.isArray(parsed.books));
  assert.equal(parsed.books.length, 1);
  assert.equal(parsed.books[0].title, 'Test Book');
  assert.equal(parsed.settings.appTheme, 'dark');
});

test('importLibrary round-trip restores settings and annotations', async () => {
  const savedSettings: Record<string, any> = {};
  const savedAnnotations: any[] = [];
  const trackingRepo = {
    ...mockRepo,
    setPreference: async (k: string, v: any) => { savedSettings[k] = v; },
    saveAnnotation: async (a: any) => { savedAnnotations.push(a); },
  };

  const json = await BackupService.exportLibrary(mockRepo);
  const result = await BackupService.importLibrary(json, trackingRepo);

  assert.equal(result.annotations, 1);
  assert.equal(savedSettings.appTheme, 'dark');
  assert.equal(savedAnnotations[0].text, 'My note');
});

test('importLibrary throws on invalid JSON or future version', async () => {
  await assert.rejects(
    async () => BackupService.importLibrary('not json', mockRepo),
    /Invalid backup file/
  );

  const futureBackup = JSON.stringify({ version: 999 });
  await assert.rejects(
    async () => BackupService.importLibrary(futureBackup, mockRepo),
    /Unsupported backup version/
  );
});
