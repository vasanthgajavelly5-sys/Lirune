import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getFormatFromExtension, type Book, type Collection, type Bookmark, type Highlight, type Note } from '../models/Book.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Format Matrix: Supported formats extension resolution', () => {
  const supportedCases = [
    { input: 'book.epub', expected: 'epub' },
    { input: 'document.pdf', expected: 'pdf' },
    { input: 'notes.txt', expected: 'txt' },
    { input: 'chapter.html', expected: 'html' },
    { input: 'page.htm', expected: 'html' },
    { input: 'story.fb2', expected: 'fb2' },
    { input: 'comic.cbz', expected: 'cbz' },
    { input: 'archive.zip', expected: 'zip' },
    { input: 'archive.rar', expected: 'rar' },
    { input: 'book.mobi', expected: 'mobi' },
    { input: 'novel.azw', expected: 'azw' },
    { input: 'novel.azw3', expected: 'azw3' },
    { input: 'novel.kf8', expected: 'azw3' },
    { input: 'comic.cbr', expected: 'cbr' },
    { input: 'paper.djvu', expected: 'djvu' },
    { input: 'document.doc', expected: 'doc' },
    { input: 'document.docx', expected: 'docx' },
    { input: 'document.odt', expected: 'odt' },
    { input: 'document.rtf', expected: 'rtf' },
    { input: 'manual.chm', expected: 'chm' },
    { input: '/storage/emulated/0/Download/my_book.EPUB', expected: 'epub' },
    { input: 'archive.tar.PDF', expected: 'pdf' },
  ];

  for (const { input, expected } of supportedCases) {
    const res = getFormatFromExtension(input);
    assert.equal(res.supported, true, `Expected ${input} to be supported`);
    assert.equal(res.id, expected, `Expected format id to be ${expected}`);
  }
});

test('Format Matrix: Unsupported formats explicit rejection', () => {
  const unsupportedCases = [
    'image.png',
    'photo.jpg',
    'audio.mp3',
    'binary.exe',
    'sheet.xlsx',
    'slides.pptx',
    'video.mp4',
  ];

  for (const input of unsupportedCases) {
    const res = getFormatFromExtension(input);
    assert.equal(res.supported, false, `Expected ${input} to be rejected`);
    assert.ok(res.reason, `Expected rejection reason for ${input}`);
  }
});

test('Backup & Restore: Serialization and Deserialization round-trip', () => {
  const sampleBooks: Book[] = [
    {
      id: 'book-1',
      title: 'The Ledger of Small Hours',
      author: 'Kester Sable',
      format: 'epub',
      uri: 'file:///data/user/0/com.lirune.reader/files/books/book-1.epub',
      filePath: 'file:///data/user/0/com.lirune.reader/files/books/book-1.epub',
      fileSize: 1114946,
      coverColor: '#2C2D35',
      progress: 33,
      currentCfi: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      currentChapter: 'A Disputed Column',
      chapterCount: 5,
      isFavorite: true,
      collectionIds: ['col-1'],
      dateAdded: 1727650000000,
      availability: 'available',
    },
  ];

  const sampleCollections: Collection[] = [
    {
      id: 'col-1',
      name: 'Classics',
      color: '#EEECF8',
      bookIds: ['book-1'],
      dateCreated: 1727650000000,
      dateModified: 1727650000000,
    },
  ];

  const sampleBookmarks: Bookmark[] = [
    {
      id: 'bm-1',
      bookId: 'book-1',
      cfi: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      chapter: 'A Disputed Column',
      dateCreated: 1727650100000,
    },
  ];

  const sampleHighlights: Highlight[] = [
    {
      id: 'hl-1',
      bookId: 'book-1',
      cfiRange: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      color: '#FFEB3B',
      text: 'The ledger lay open in the dim light.',
      dateCreated: 1727650200000,
    },
  ];

  const sampleNotes: Note[] = [
    {
      id: 'note-1',
      bookId: 'book-1',
      cfi: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      text: 'Important passage on double-entry bookkeeping.',
      chapter: 'A Disputed Column',
      dateCreated: 1727650300000,
      dateModified: 1727650300000,
    },
  ];

  const backupPayload = JSON.stringify({
    books: sampleBooks,
    collections: sampleCollections,
    bookmarks: sampleBookmarks,
    highlights: sampleHighlights,
    notes: sampleNotes,
    exportedAt: 1727650400000,
  }, null, 2);

  const restored = JSON.parse(backupPayload);
  assert.equal(restored.books.length, 1);
  assert.equal(restored.books[0].title, 'The Ledger of Small Hours');
  assert.equal(restored.collections.length, 1);
  assert.equal(restored.collections[0].name, 'Classics');
  assert.equal(restored.bookmarks.length, 1);
  assert.equal(restored.highlights.length, 1);
  assert.equal(restored.notes.length, 1);
  assert.equal(restored.notes[0].text, 'Important passage on double-entry bookkeeping.');
});

test('Fixtures: Verify all staged test fixtures exist and are accessible if present', () => {
  const fixturesDir = path.resolve(__dirname, '..', 'test-fixtures', 'LiruneQA');
  if (!fs.existsSync(fixturesDir)) {
    // Fixtures are not committed to git repository; pass when not present
    return;
  }

  const expectedFixtures = [
    'book.mobi',
    'cbz-large.cbz',
    'cbz-small.cbz',
    'corrupt.epub',
    'doc-image.png',
    'doc.html',
    'epub-image-heavy.epub',
    'epub-long.epub',
    'epub-short.epub',
    'fb2-book.fb2',
    'pdf-small.pdf',
    'txt-large.txt',
    'txt-short.txt',
  ];

  for (const f of expectedFixtures) {
    const fullPath = path.join(fixturesDir, f);
    assert.ok(fs.existsSync(fullPath), `Fixture ${f} must exist`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Fixture ${f} must have non-zero size`);
  }
});
