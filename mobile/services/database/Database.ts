/**
 * Lirune Reader Mobile — Durable SQLite Database Service
 * Uses official expo-sqlite with migrations and WAL mode.
 */

import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { logger } from '@/utils/logger';

const TAG = 'Database';
const DB_NAME = 'lirune.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

// In-memory web fallback store if running in browser
const webStore: Record<string, string> = {};

export async function getDatabase(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (dbInstance) {
    return dbInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      logger.info(TAG, `Opening database: ${DB_NAME}`);
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await initSchema(db);
      dbInstance = db;
      logger.info(TAG, 'Database initialized successfully');
      return db;
    } catch (err) {
      logger.error(TAG, 'Failed to initialize SQLite database', err);
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  // Enable WAL mode and foreign keys for high performance and durability
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      format TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      coverUrl TEXT,
      coverColor TEXT,
      progress REAL DEFAULT 0,
      currentCfi TEXT,
      currentChapter TEXT,
      chapterCount INTEGER DEFAULT 0,
      isFavorite INTEGER DEFAULT 0,
      collectionIds TEXT DEFAULT '[]',
      dateAdded INTEGER NOT NULL,
      lastReadDate INTEGER,
      availability TEXT DEFAULT 'available',
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      dateCreated INTEGER NOT NULL,
      dateModified INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_collections (
      bookId TEXT NOT NULL,
      collectionId TEXT NOT NULL,
      PRIMARY KEY (bookId, collectionId),
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (collectionId) REFERENCES collections(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL,
      cfi TEXT NOT NULL,
      chapter TEXT,
      previewText TEXT,
      dateCreated INTEGER NOT NULL,
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL,
      cfiRange TEXT NOT NULL,
      text TEXT NOT NULL,
      color TEXT NOT NULL,
      note TEXT,
      chapter TEXT,
      dateCreated INTEGER NOT NULL,
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL,
      cfi TEXT NOT NULL,
      text TEXT NOT NULL,
      chapter TEXT,
      dateCreated INTEGER NOT NULL,
      dateModified INTEGER NOT NULL,
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      bookId TEXT PRIMARY KEY,
      cfi TEXT NOT NULL,
      chapter TEXT,
      progressPercent REAL DEFAULT 0,
      timeSpent INTEGER DEFAULT 0,
      lastRead INTEGER NOT NULL,
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_books_format ON books(format);
    CREATE INDEX IF NOT EXISTS idx_books_last_read ON books(lastReadDate);
    CREATE INDEX IF NOT EXISTS idx_books_favorite ON books(isFavorite);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(bookId);
    CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(bookId);
    CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(bookId);
  `);
}

/** Web Fallback Storage API */
export const WebStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
      return webStore[key] ?? null;
    } catch {
      return webStore[key] ?? null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      webStore[key] = value;
    } catch {
      webStore[key] = value;
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      delete webStore[key];
    } catch {
      delete webStore[key];
    }
  },
};
