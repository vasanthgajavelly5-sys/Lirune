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
      uri TEXT NOT NULL,
      filePath TEXT,
      fileSize INTEGER DEFAULT 0,
      coverUrl TEXT,
      thumbnailUrl TEXT,
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

    CREATE TABLE IF NOT EXISTS saved_words (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      definition TEXT NOT NULL,
      bookId TEXT,
      bookTitle TEXT,
      context TEXT,
      dateCreated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_fonts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fontUri TEXT NOT NULL,
      dateAdded INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_books_format ON books(format);
    CREATE INDEX IF NOT EXISTS idx_books_last_read ON books(lastReadDate);
    CREATE INDEX IF NOT EXISTS idx_books_favorite ON books(isFavorite);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(bookId);
    CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(bookId);
    CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(bookId);
    CREATE INDEX IF NOT EXISTS idx_saved_words_word ON saved_words(word);
    CREATE INDEX IF NOT EXISTS idx_saved_words_book ON saved_words(bookId);

    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  // Versioned migration runner
  try {
    const appliedRows = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_versions');
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    if (!appliedVersions.has(2)) {
      logger.info(TAG, 'Running database migration v2: Storage and Format Architecture tables');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tree_uri TEXT UNIQUE,
          label TEXT,
          volume_id TEXT,
          status TEXT,
          last_scan_at INTEGER,
          grant_valid INTEGER DEFAULT 1,
          import_mode TEXT DEFAULT 'managed'
        );

        CREATE TABLE IF NOT EXISTS entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
          doc_id TEXT,
          uri TEXT,
          parent_doc_id TEXT,
          name TEXT,
          size INTEGER,
          mtime INTEGER,
          sniff_format TEXT,
          confidence REAL,
          quick_fp TEXT,
          state TEXT,
          fail_reason TEXT,
          UNIQUE(source_id, doc_id)
        );

        CREATE TABLE IF NOT EXISTS book_files (
          book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
          mode TEXT CHECK(mode IN ('managed','linked')),
          path_or_uri TEXT,
          size INTEGER,
          seekable INTEGER,
          PRIMARY KEY (book_id, path_or_uri)
        );

        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT,
          entry_id INTEGER,
          state TEXT,
          progress REAL,
          error TEXT,
          updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS book_locations (
          book_id TEXT NOT NULL,
          spine_index INTEGER NOT NULL,
          cfi TEXT,
          char_count INTEGER,
          progress REAL,
          PRIMARY KEY (book_id, spine_index)
        );

        CREATE INDEX IF NOT EXISTS idx_entries_state ON entries(state);
        CREATE INDEX IF NOT EXISTS idx_entries_fp ON entries(quick_fp);
      `);

      // Add columns to books if not already present
      const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(books)');
      const columns = new Set(tableInfo.map((col) => col.name));

      if (!columns.has('uri')) {
        await db.execAsync("ALTER TABLE books ADD COLUMN uri TEXT DEFAULT '';");
      }
      if (!columns.has('availability')) {
        await db.execAsync("ALTER TABLE books ADD COLUMN availability TEXT DEFAULT 'available';");
      }
      if (!columns.has('metadata')) {
        await db.execAsync("ALTER TABLE books ADD COLUMN metadata TEXT DEFAULT '{}';");
      }
      if (!columns.has('authors')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN authors TEXT;');
        await db.execAsync('UPDATE books SET authors = author WHERE authors IS NULL;');
      }
      if (!columns.has('sha256')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN sha256 TEXT;');
      }
      if (!columns.has('quick_fp')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN quick_fp TEXT;');
      }
      if (!columns.has('cover_path')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN cover_path TEXT;');
        await db.execAsync('UPDATE books SET cover_path = coverUrl WHERE cover_path IS NULL;');
      }
      if (!columns.has('meta_json')) {
        await db.execAsync("ALTER TABLE books ADD COLUMN meta_json TEXT DEFAULT '{}';");
        await db.execAsync('UPDATE books SET meta_json = metadata WHERE meta_json IS NULL OR meta_json = "{}"');
      }
      if (!columns.has('added_at')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN added_at INTEGER;');
        await db.execAsync('UPDATE books SET added_at = dateAdded WHERE added_at IS NULL;');
      }
      if (!columns.has('thumbnailUrl')) {
        await db.execAsync('ALTER TABLE books ADD COLUMN thumbnailUrl TEXT;');
      }

      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_books_sha256 ON books(sha256) WHERE sha256 IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_books_quick_fp ON books(quick_fp);

        INSERT OR IGNORE INTO book_files (book_id, mode, path_or_uri, size, seekable)
        SELECT id, 'managed', COALESCE(NULLIF(filePath, ''), uri), fileSize, 1
        FROM books
        WHERE uri IS NOT NULL OR filePath IS NOT NULL;

        INSERT INTO schema_versions (version, applied_at) VALUES (2, unixepoch());
      `);
      logger.info(TAG, 'Database migration v2 applied successfully');
    }
  } catch (e) {
    logger.warn(TAG, 'Database migration execution failed or partially complete', String(e));
  }
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
