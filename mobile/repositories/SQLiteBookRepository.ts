/**
 * Lirune Reader Mobile — SQLite Book Repository
 * Fully persists books, collections, bookmarks, highlights, notes, progress, and preferences.
 */

import { Platform } from 'react-native';
import {
  Book,
  Collection,
  Bookmark,
  Highlight,
  Note,
  ReadingProgress,
  BookFormat,
} from '@/models/Book';
import { BookRepository } from './BookRepository';
import { getDatabase, WebStorage } from '@/services/database/Database';
import { logger } from '@/utils/logger';

const TAG = 'SQLiteBookRepository';

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  format: string;
  filePath: string;
  fileSize: number;
  coverUrl: string | null;
  coverColor: string | null;
  progress: number;
  currentCfi: string | null;
  currentChapter: string | null;
  chapterCount: number;
  isFavorite: number;
  collectionIds: string | null;
  dateAdded: number;
  lastReadDate: number | null;
  availability: string;
  metadata: string | null;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  dateCreated: number;
  dateModified: number;
}

interface BookmarkRow {
  id: string;
  bookId: string;
  cfi: string;
  chapter: string | null;
  previewText: string | null;
  dateCreated: number;
}

interface HighlightRow {
  id: string;
  bookId: string;
  cfiRange: string;
  text: string;
  color: string;
  note: string | null;
  chapter: string | null;
  dateCreated: number;
}

interface NoteRow {
  id: string;
  bookId: string;
  cfi: string;
  text: string;
  chapter: string | null;
  dateCreated: number;
  dateModified: number;
}

interface ProgressRow {
  bookId: string;
  cfi: string;
  chapter: string | null;
  progressPercent: number;
  timeSpent: number;
  lastRead: number;
}

function parseBookRow(row: BookRow): Book {
  let collectionIds: string[] = [];
  try {
    if (row.collectionIds) collectionIds = JSON.parse(row.collectionIds);
  } catch {
    collectionIds = [];
  }

  let metadata: Record<string, unknown> = {};
  try {
    if (row.metadata) metadata = JSON.parse(row.metadata);
  } catch {
    metadata = {};
  }

  return {
    id: row.id,
    title: row.title,
    author: row.author || 'Unknown Author',
    description: row.description || undefined,
    format: row.format as BookFormat,
    filePath: row.filePath,
    fileSize: row.fileSize || 0,
    coverUrl: row.coverUrl || undefined,
    coverColor: row.coverColor || '#3A3050',
    progress: row.progress || 0,
    currentCfi: row.currentCfi || undefined,
    currentChapter: row.currentChapter || undefined,
    chapterCount: row.chapterCount || 0,
    isFavorite: Boolean(row.isFavorite),
    collectionIds,
    dateAdded: row.dateAdded,
    lastReadDate: row.lastReadDate || undefined,
    availability: (row.availability as 'available' | 'missing') || 'available',
    metadata,
  };
}

export class SQLiteBookRepository implements BookRepository {
  // ================= BOOKS =================

  async getBooks(): Promise<Book[]> {
    if (Platform.OS === 'web') {
      const data = WebStorage.getItem('lirune_books');
      return data ? JSON.parse(data) : [];
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<BookRow>(
        'SELECT * FROM books ORDER BY dateAdded DESC'
      );
      return rows.map(parseBookRow);
    } catch (err) {
      logger.error(TAG, 'Error getting books', err);
      return [];
    }
  }

  async getBook(id: string): Promise<Book | null> {
    if (Platform.OS === 'web') {
      const books = await this.getBooks();
      return books.find((b) => b.id === id) || null;
    }

    const db = await getDatabase();
    if (!db) return null;
    try {
      const row = await db.getFirstAsync<BookRow>(
        'SELECT * FROM books WHERE id = ?',
        [id]
      );
      return row ? parseBookRow(row) : null;
    } catch (err) {
      logger.error(TAG, `Error getting book ${id}`, err);
      return null;
    }
  }

  async addBook(book: Book): Promise<void> {
    if (Platform.OS === 'web') {
      const books = await this.getBooks();
      const updated = [book, ...books.filter((b) => b.id !== book.id)];
      WebStorage.setItem('lirune_books', JSON.stringify(updated));
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO books (
          id, title, author, description, format, filePath, fileSize,
          coverUrl, coverColor, progress, currentCfi, currentChapter,
          chapterCount, isFavorite, collectionIds, dateAdded, lastReadDate,
          availability, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          book.id,
          book.title,
          book.author,
          book.description || null,
          book.format,
          book.filePath,
          book.fileSize,
          book.coverUrl || null,
          book.coverColor,
          book.progress,
          book.currentCfi || null,
          book.currentChapter || null,
          book.chapterCount || 0,
          book.isFavorite ? 1 : 0,
          JSON.stringify(book.collectionIds || []),
          book.dateAdded,
          book.lastReadDate || null,
          book.availability || 'available',
          JSON.stringify(book.metadata || {}),
        ]
      );

      // Sync book_collections join table
      await db.runAsync('DELETE FROM book_collections WHERE bookId = ?', [book.id]);
      for (const collId of book.collectionIds || []) {
        await db.runAsync(
          'INSERT OR IGNORE INTO book_collections (bookId, collectionId) VALUES (?, ?)',
          [book.id, collId]
        );
      }
    } catch (err) {
      logger.error(TAG, 'Error adding book', err);
      throw err;
    }
  }

  async removeBook(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      const books = await this.getBooks();
      WebStorage.setItem(
        'lirune_books',
        JSON.stringify(books.filter((b) => b.id !== id))
      );
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM books WHERE id = ?', [id]);
    } catch (err) {
      logger.error(TAG, `Error removing book ${id}`, err);
      throw err;
    }
  }

  async updateBook(book: Book): Promise<void> {
    await this.addBook(book);
  }

  async searchBooks(query: string): Promise<Book[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.getBooks();

    if (Platform.OS === 'web') {
      const books = await this.getBooks();
      return books.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.format.toLowerCase().includes(q)
      );
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<BookRow>(
        `SELECT * FROM books
         WHERE LOWER(title) LIKE ? OR LOWER(author) LIKE ? OR LOWER(format) LIKE ?
         ORDER BY dateAdded DESC`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
      return rows.map(parseBookRow);
    } catch (err) {
      logger.error(TAG, 'Error searching books', err);
      return [];
    }
  }

  async getBooksByCollection(collectionId: string): Promise<Book[]> {
    if (Platform.OS === 'web') {
      const books = await this.getBooks();
      return books.filter((b) => b.collectionIds.includes(collectionId));
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<BookRow>(
        `SELECT b.* FROM books b
         INNER JOIN book_collections bc ON b.id = bc.bookId
         WHERE bc.collectionId = ?
         ORDER BY b.dateAdded DESC`,
        [collectionId]
      );
      return rows.map(parseBookRow);
    } catch (err) {
      logger.error(TAG, `Error getting books for collection ${collectionId}`, err);
      return [];
    }
  }

  async getFavoriteBooks(): Promise<Book[]> {
    if (Platform.OS === 'web') {
      const books = await this.getBooks();
      return books.filter((b) => b.isFavorite);
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<BookRow>(
        'SELECT * FROM books WHERE isFavorite = 1 ORDER BY dateAdded DESC'
      );
      return rows.map(parseBookRow);
    } catch (err) {
      logger.error(TAG, 'Error getting favorite books', err);
      return [];
    }
  }

  async getRecentBooks(limit = 10): Promise<Book[]> {
    if (Platform.OS === 'web') {
      const books = await this.getBooks();
      return books
        .filter((b) => b.lastReadDate)
        .sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))
        .slice(0, limit);
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<BookRow>(
        'SELECT * FROM books WHERE lastReadDate IS NOT NULL ORDER BY lastReadDate DESC LIMIT ?',
        [limit]
      );
      return rows.map(parseBookRow);
    } catch (err) {
      logger.error(TAG, 'Error getting recent books', err);
      return [];
    }
  }

  // ================= COLLECTIONS =================

  async getCollections(): Promise<Collection[]> {
    if (Platform.OS === 'web') {
      const data = WebStorage.getItem('lirune_collections');
      return data ? JSON.parse(data) : [];
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<CollectionRow>(
        'SELECT * FROM collections ORDER BY name ASC'
      );
      const collections: Collection[] = [];
      for (const row of rows) {
        const bookRows = await db.getAllAsync<{ bookId: string }>(
          'SELECT bookId FROM book_collections WHERE collectionId = ?',
          [row.id]
        );
        collections.push({
          id: row.id,
          name: row.name,
          description: row.description || undefined,
          color: row.color,
          bookIds: bookRows.map((r) => r.bookId),
          dateCreated: row.dateCreated,
          dateModified: row.dateModified,
        });
      }
      return collections;
    } catch (err) {
      logger.error(TAG, 'Error getting collections', err);
      return [];
    }
  }

  async getCollection(id: string): Promise<Collection | null> {
    const colls = await this.getCollections();
    return colls.find((c) => c.id === id) || null;
  }

  async addCollection(collection: Collection): Promise<void> {
    if (Platform.OS === 'web') {
      const colls = await this.getCollections();
      const updated = [
        collection,
        ...colls.filter((c) => c.id !== collection.id),
      ];
      WebStorage.setItem('lirune_collections', JSON.stringify(updated));
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO collections (id, name, description, color, dateCreated, dateModified)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          collection.id,
          collection.name,
          collection.description || null,
          collection.color,
          collection.dateCreated,
          collection.dateModified,
        ]
      );
    } catch (err) {
      logger.error(TAG, 'Error adding collection', err);
      throw err;
    }
  }

  async removeCollection(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      const colls = await this.getCollections();
      WebStorage.setItem(
        'lirune_collections',
        JSON.stringify(colls.filter((c) => c.id !== id))
      );
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM collections WHERE id = ?', [id]);
      await db.runAsync('DELETE FROM book_collections WHERE collectionId = ?', [id]);
    } catch (err) {
      logger.error(TAG, `Error removing collection ${id}`, err);
      throw err;
    }
  }

  async updateCollection(collection: Collection): Promise<void> {
    await this.addCollection(collection);
  }

  async addBookToCollection(bookId: string, collectionId: string): Promise<void> {
    const book = await this.getBook(bookId);
    if (!book) return;
    if (!book.collectionIds.includes(collectionId)) {
      book.collectionIds.push(collectionId);
      await this.updateBook(book);
    }
  }

  async removeBookFromCollection(
    bookId: string,
    collectionId: string
  ): Promise<void> {
    const book = await this.getBook(bookId);
    if (!book) return;
    book.collectionIds = book.collectionIds.filter((id) => id !== collectionId);
    await this.updateBook(book);
  }

  // ================= BOOKMARKS =================

  async getBookmarks(bookId: string): Promise<Bookmark[]> {
    if (Platform.OS === 'web') {
      const data = WebStorage.getItem(`lirune_bookmarks_${bookId}`);
      return data ? JSON.parse(data) : [];
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<BookmarkRow>(
        'SELECT * FROM bookmarks WHERE bookId = ? ORDER BY dateCreated DESC',
        [bookId]
      );
      return rows.map((r) => ({
        id: r.id,
        bookId: r.bookId,
        cfi: r.cfi,
        chapter: r.chapter || 'Chapter',
        previewText: r.previewText || undefined,
        dateCreated: r.dateCreated,
      }));
    } catch (err) {
      logger.error(TAG, `Error getting bookmarks for book ${bookId}`, err);
      return [];
    }
  }

  async addBookmark(bookmark: Bookmark): Promise<void> {
    if (Platform.OS === 'web') {
      const bookmarks = await this.getBookmarks(bookmark.bookId);
      const updated = [bookmark, ...bookmarks.filter((b) => b.id !== bookmark.id)];
      WebStorage.setItem(
        `lirune_bookmarks_${bookmark.bookId}`,
        JSON.stringify(updated)
      );
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO bookmarks (id, bookId, cfi, chapter, previewText, dateCreated)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          bookmark.id,
          bookmark.bookId,
          bookmark.cfi,
          bookmark.chapter,
          bookmark.previewText || null,
          bookmark.dateCreated,
        ]
      );
    } catch (err) {
      logger.error(TAG, 'Error adding bookmark', err);
      throw err;
    }
  }

  async removeBookmark(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM bookmarks WHERE id = ?', [id]);
    } catch (err) {
      logger.error(TAG, `Error removing bookmark ${id}`, err);
      throw err;
    }
  }

  // ================= HIGHLIGHTS =================

  async getHighlights(bookId: string): Promise<Highlight[]> {
    if (Platform.OS === 'web') {
      const data = WebStorage.getItem(`lirune_highlights_${bookId}`);
      return data ? JSON.parse(data) : [];
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<HighlightRow>(
        'SELECT * FROM highlights WHERE bookId = ? ORDER BY dateCreated DESC',
        [bookId]
      );
      return rows.map((r) => ({
        id: r.id,
        bookId: r.bookId,
        cfiRange: r.cfiRange,
        text: r.text,
        color: r.color,
        note: r.note || undefined,
        chapter: r.chapter || undefined,
        dateCreated: r.dateCreated,
      }));
    } catch (err) {
      logger.error(TAG, `Error getting highlights for book ${bookId}`, err);
      return [];
    }
  }

  async addHighlight(highlight: Highlight): Promise<void> {
    if (Platform.OS === 'web') {
      const highlights = await this.getHighlights(highlight.bookId);
      const updated = [
        highlight,
        ...highlights.filter((h) => h.id !== highlight.id),
      ];
      WebStorage.setItem(
        `lirune_highlights_${highlight.bookId}`,
        JSON.stringify(updated)
      );
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO highlights (id, bookId, cfiRange, text, color, note, chapter, dateCreated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          highlight.id,
          highlight.bookId,
          highlight.cfiRange,
          highlight.text,
          highlight.color,
          highlight.note || null,
          highlight.chapter || null,
          highlight.dateCreated,
        ]
      );
    } catch (err) {
      logger.error(TAG, 'Error adding highlight', err);
      throw err;
    }
  }

  async removeHighlight(id: string): Promise<void> {
    if (Platform.OS === 'web') return;

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM highlights WHERE id = ?', [id]);
    } catch (err) {
      logger.error(TAG, `Error removing highlight ${id}`, err);
      throw err;
    }
  }

  // ================= NOTES =================

  async getNotes(bookId: string): Promise<Note[]> {
    if (Platform.OS === 'web') {
      const data = WebStorage.getItem(`lirune_notes_${bookId}`);
      return data ? JSON.parse(data) : [];
    }

    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<NoteRow>(
        'SELECT * FROM notes WHERE bookId = ? ORDER BY dateCreated DESC',
        [bookId]
      );
      return rows.map((r) => ({
        id: r.id,
        bookId: r.bookId,
        cfi: r.cfi,
        text: r.text,
        chapter: r.chapter || undefined,
        dateCreated: r.dateCreated,
        dateModified: r.dateModified,
      }));
    } catch (err) {
      logger.error(TAG, `Error getting notes for book ${bookId}`, err);
      return [];
    }
  }

  async addNote(note: Note): Promise<void> {
    if (Platform.OS === 'web') {
      const notes = await this.getNotes(note.bookId);
      const updated = [note, ...notes.filter((n) => n.id !== note.id)];
      WebStorage.setItem(`lirune_notes_${note.bookId}`, JSON.stringify(updated));
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO notes (id, bookId, cfi, text, chapter, dateCreated, dateModified)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          note.id,
          note.bookId,
          note.cfi,
          note.text,
          note.chapter || null,
          note.dateCreated,
          note.dateModified,
        ]
      );
    } catch (err) {
      logger.error(TAG, 'Error adding note', err);
      throw err;
    }
  }

  async updateNote(note: Note): Promise<void> {
    await this.addNote(note);
  }

  async removeNote(id: string): Promise<void> {
    if (Platform.OS === 'web') return;

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
    } catch (err) {
      logger.error(TAG, `Error removing note ${id}`, err);
      throw err;
    }
  }

  // ================= READING PROGRESS =================

  async getReadingProgress(bookId: string): Promise<ReadingProgress | null> {
    if (Platform.OS === 'web') {
      const data = WebStorage.getItem(`lirune_progress_${bookId}`);
      return data ? JSON.parse(data) : null;
    }

    const db = await getDatabase();
    if (!db) return null;
    try {
      const row = await db.getFirstAsync<ProgressRow>(
        'SELECT * FROM reading_progress WHERE bookId = ?',
        [bookId]
      );
      if (!row) return null;
      return {
        bookId: row.bookId,
        cfi: row.cfi,
        chapter: row.chapter || 'Chapter',
        progressPercent: row.progressPercent || 0,
        timeSpent: row.timeSpent || 0,
        lastRead: row.lastRead,
      };
    } catch (err) {
      logger.error(TAG, `Error getting reading progress for book ${bookId}`, err);
      return null;
    }
  }

  async updateReadingProgress(progress: ReadingProgress): Promise<void> {
    if (Platform.OS === 'web') {
      WebStorage.setItem(
        `lirune_progress_${progress.bookId}`,
        JSON.stringify(progress)
      );
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO reading_progress (bookId, cfi, chapter, progressPercent, timeSpent, lastRead)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          progress.bookId,
          progress.cfi,
          progress.chapter,
          progress.progressPercent,
          progress.timeSpent,
          progress.lastRead,
        ]
      );

      // Also update books table with last read date and progress
      await db.runAsync(
        `UPDATE books
         SET progress = ?, currentCfi = ?, currentChapter = ?, lastReadDate = ?
         WHERE id = ?`,
        [
          progress.progressPercent,
          progress.cfi,
          progress.chapter,
          progress.lastRead,
          progress.bookId,
        ]
      );
    } catch (err) {
      logger.error(TAG, 'Error updating reading progress', err);
      throw err;
    }
  }

  // ================= PREFERENCES =================

  async getPreference<T>(key: string, defaultValue: T): Promise<T> {
    if (Platform.OS === 'web') {
      const val = WebStorage.getItem(`lirune_pref_${key}`);
      return val ? JSON.parse(val) : defaultValue;
    }

    const db = await getDatabase();
    if (!db) return defaultValue;
    try {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM preferences WHERE key = ?',
        [key]
      );
      if (!row) return defaultValue;
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  async setPreference<T>(key: string, value: T): Promise<void> {
    if (Platform.OS === 'web') {
      WebStorage.setItem(`lirune_pref_${key}`, JSON.stringify(value));
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync(
        'INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)',
        [key, JSON.stringify(value)]
      );
    } catch (err) {
      logger.error(TAG, `Error setting preference ${key}`, err);
    }
  }

  // ================= DATA MANAGEMENT =================

  async exportData(): Promise<string> {
    const books = await this.getBooks();
    const collections = await this.getCollections();
    return JSON.stringify({ books, collections, exportedAt: Date.now() }, null, 2);
  }

  async importData(json: string): Promise<void> {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed.books)) {
        for (const b of parsed.books) {
          await this.addBook(b);
        }
      }
      if (Array.isArray(parsed.collections)) {
        for (const c of parsed.collections) {
          await this.addCollection(c);
        }
      }
    } catch (err) {
      logger.error(TAG, 'Error importing data', err);
      throw err;
    }
  }

  async clearAllData(): Promise<void> {
    if (Platform.OS === 'web') {
      return;
    }

    const db = await getDatabase();
    if (!db) return;
    try {
      await db.execAsync(`
        DELETE FROM books;
        DELETE FROM collections;
        DELETE FROM book_collections;
        DELETE FROM bookmarks;
        DELETE FROM highlights;
        DELETE FROM notes;
        DELETE FROM reading_progress;
        DELETE FROM preferences;
      `);
    } catch (err) {
      logger.error(TAG, 'Error clearing all data', err);
      throw err;
    }
  }
}
