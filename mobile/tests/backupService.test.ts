import { BackupService } from '../services/storage/BackupService';
// Mock getBookRepository
jest.mock('../repositories', () => ({
  getBookRepository: () => ({
    getBooks: async () => [{ id: 'b1', title: 'Test' }],
    getCollections: async () => [],
    getAnnotations: async () => [],
    getPreference: async () => null,
    setPreference: jest.fn(),
    saveAnnotation: jest.fn(),
  }),
}));
test('exportLibrary produces valid JSON', async () => {
  const json = await BackupService.exportLibrary();
  const parsed = JSON.parse(json);
  expect(parsed.version).toBe(1);
  expect(Array.isArray(parsed.books)).toBe(true);
});
test('importLibrary round-trip restores settings', async () => {
  const json = await BackupService.exportLibrary();
  const result = await BackupService.importLibrary(json);
  expect(result).toHaveProperty('annotations');
});
test('importLibrary throws on bad JSON', async () => {
  await expect(BackupService.importLibrary('not json')).rejects.toThrow();
});
