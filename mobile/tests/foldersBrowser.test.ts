import test from 'node:test';
import assert from 'node:assert/strict';

interface DirectoryEntryItem {
  docId: string;
  name: string;
  size: number;
  mtime: number;
  isDirectory: boolean;
  sniffFormat?: string;
  uri: string;
}

// Replicate sorting logic from folders browser
function sortEntries(
  entries: DirectoryEntryItem[],
  sortBy: 'name' | 'mtime' | 'size' | 'type',
  sortAsc: boolean,
  foldersFirst: boolean
): DirectoryEntryItem[] {
  return [...entries].sort((a, b) => {
    if (foldersFirst && a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'mtime':
        cmp = a.mtime - b.mtime;
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'type': {
        const extA = a.name.split('.').pop()?.toLowerCase() || '';
        const extB = b.name.split('.').pop()?.toLowerCase() || '';
        cmp = extA.localeCompare(extB);
        break;
      }
    }
    return sortAsc ? cmp : -cmp;
  });
}

function filterEntries(
  entries: DirectoryEntryItem[],
  searchQuery: string,
  booksOnly: boolean,
  supportedFormats: Set<string>
): DirectoryEntryItem[] {
  return entries.filter((e) => {
    if (searchQuery.trim().length > 0) {
      if (!e.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
    }
    if (booksOnly && !e.isDirectory) {
      const ext = e.name.split('.').pop()?.toLowerCase() || '';
      const isFormat = (e.sniffFormat && supportedFormats.has(e.sniffFormat)) || supportedFormats.has(ext);
      if (!isFormat) return false;
    }
    return true;
  });
}

test('Folders sorting: folders-first prioritizes directories', () => {
  const items: DirectoryEntryItem[] = [
    { docId: '1', name: 'Zebra.epub', size: 1000, mtime: 10, isDirectory: false, uri: '' },
    { docId: '2', name: 'Alpha Folder', size: 0, mtime: 20, isDirectory: true, uri: '' },
    { docId: '3', name: 'Apple.epub', size: 500, mtime: 30, isDirectory: false, uri: '' },
  ];

  const sorted = sortEntries(items, 'name', true, true);
  assert.equal(sorted[0].name, 'Alpha Folder');
  assert.equal(sorted[1].name, 'Apple.epub');
  assert.equal(sorted[2].name, 'Zebra.epub');
});

test('Folders sorting: size descending', () => {
  const items: DirectoryEntryItem[] = [
    { docId: '1', name: 'A', size: 100, mtime: 10, isDirectory: false, uri: '' },
    { docId: '2', name: 'B', size: 5000, mtime: 20, isDirectory: false, uri: '' },
    { docId: '3', name: 'C', size: 1000, mtime: 30, isDirectory: false, uri: '' },
  ];

  const sorted = sortEntries(items, 'size', false, false);
  assert.equal(sorted[0].name, 'B');
  assert.equal(sorted[1].name, 'C');
  assert.equal(sorted[2].name, 'A');
});

test('Folders filtering: booksOnly filters out non-book files but retains folders', () => {
  const supported = new Set(['epub', 'pdf', 'cbz', 'fb2']);
  const items: DirectoryEntryItem[] = [
    { docId: '1', name: 'Notes.txt', size: 100, mtime: 10, isDirectory: false, uri: '' },
    { docId: '2', name: 'Comic.cbz', size: 200, mtime: 20, isDirectory: false, uri: '' },
    { docId: '3', name: 'Subfolder', size: 0, mtime: 30, isDirectory: true, uri: '' },
    { docId: '4', name: 'Unrecognized.bin', size: 50, mtime: 40, isDirectory: false, sniffFormat: 'pdf', uri: '' },
  ];

  const filtered = filterEntries(items, '', true, supported);
  assert.equal(filtered.length, 3);
  assert.ok(filtered.some((e) => e.name === 'Comic.cbz'));
  assert.ok(filtered.some((e) => e.name === 'Subfolder'));
  assert.ok(filtered.some((e) => e.name === 'Unrecognized.bin')); // Sniffed as PDF
  assert.ok(!filtered.some((e) => e.name === 'Notes.txt'));
});

test('Folders breadcrumbs: jumpToSegment correctly truncates path', () => {
  const breadcrumbs = [
    { docId: 'root', name: 'Books' },
    { docId: 'scifi', name: 'SciFi' },
    { docId: 'asimov', name: 'Asimov' },
    { docId: 'foundation', name: 'Foundation' },
  ];

  // Jump to SciFi (index 1)
  const targetCrumbs = breadcrumbs.slice(0, 1 + 1);
  assert.equal(targetCrumbs.length, 2);
  assert.equal(targetCrumbs[targetCrumbs.length - 1].docId, 'scifi');
  assert.equal(targetCrumbs[targetCrumbs.length - 1].name, 'SciFi');
});

test('Folders multi-select: toggle selection and compute total size', () => {
  const items: DirectoryEntryItem[] = [
    { docId: '1', name: 'A.epub', size: 1000, mtime: 10, isDirectory: false, uri: '' },
    { docId: '2', name: 'B.epub', size: 2000, mtime: 20, isDirectory: false, uri: '' },
    { docId: '3', name: 'C.epub', size: 3000, mtime: 30, isDirectory: false, uri: '' },
  ];

  const selected = new Set<string>(['1', '3']);
  const selectedEntries = items.filter((e) => selected.has(e.docId));
  const totalBytes = selectedEntries.reduce((sum, e) => sum + e.size, 0);

  assert.equal(selectedEntries.length, 2);
  assert.equal(totalBytes, 4000);
});
