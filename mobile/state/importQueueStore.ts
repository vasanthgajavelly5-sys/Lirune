/**
 * Lirune Reader Mobile — Import Queue State Store (Zustand)
 * Manages atomic journaled book ingestion, progress reporting, dedup, and failures.
 */

import { create } from 'zustand';
import { nativeStorage } from '@/services/storage/NativeStorageBridge';
import { getDatabase } from '@/services/database/Database';
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';

const TAG = 'ImportQueueStore';

export interface QueueItem {
  id: number; // job id
  entryId?: number;
  uri: string;
  name: string;
  format: string;
  mode: 'managed' | 'linked';
  state: 'queued' | 'importing' | 'ready' | 'failed';
  progress: number;
  error?: string;
  bookId?: string;
  archiveHandleId?: string;
  archiveEntryPath?: string;
  sourceKind?: 'file' | 'archive';
}

export interface ImportQueueState {
  items: QueueItem[];
  isProcessing: boolean;
  unsubscriber: (() => void) | null;

  enqueue: (entries: {
    uri: string;
    name: string;
    format: string;
    mode?: 'managed' | 'linked';
    archiveHandleId?: string;
    archiveEntryPath?: string;
    sourceKind?: 'file' | 'archive';
  }[]) => Promise<void>;
  cancelItem: (id: number) => Promise<void>;
  retryItem: (id: number) => Promise<void>;
  clearCompleted: () => void;
  recoverJournalOnLaunch: () => Promise<void>;
}

export const useImportQueueStore = create<ImportQueueState>((set, get) => ({
  items: [],
  isProcessing: false,
  unsubscriber: null,

  enqueue: async (entries) => {
    const db = await getDatabase();
    const newItems: QueueItem[] = [];

    for (const entry of entries) {
      let jobId = Date.now() + Math.floor(Math.random() * 1000);
      if (db) {
        try {
          const res = await db.runAsync(
            `INSERT INTO jobs (type, state, progress, error, updated_at) VALUES ('import', 'queued', 0.0, NULL, ?);`,
            [Date.now()]
          );
          jobId = res.lastInsertRowId;
        } catch {}
      }

      newItems.push({
        id: jobId,
        uri: entry.uri,
        name: entry.name,
        format: entry.format,
        mode: entry.mode ?? ((entry.uri.startsWith('/') || entry.uri.startsWith('file://')) ? 'linked' : 'managed'),
        state: 'queued',
        progress: 0,
        archiveHandleId: entry.archiveHandleId,
        archiveEntryPath: entry.archiveEntryPath,
        sourceKind: entry.sourceKind ?? 'file',
      });
    }

    set((state) => ({ items: [...state.items, ...newItems] }));
    processQueue();
  },

  cancelItem: async (id: number) => {
    const db = await getDatabase();
    if (db) {
      await db.runAsync(`UPDATE jobs SET state = 'cancelled', updated_at = ? WHERE id = ?;`, [Date.now(), id]);
    }
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, state: 'failed', error: 'Cancelled' } : item)),
    }));
  },

  retryItem: async (id: number) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;

    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, state: 'queued', progress: 0, error: undefined } : i)),
    }));
    processQueue();
  },

  clearCompleted: () => {
    set((state) => ({
      items: state.items.filter((item) => item.state !== 'ready'),
    }));
    try {
      const { useLibraryStore } = require('@/state/libraryStore');
      void useLibraryStore.getState().loadLibrary({ force: true, silent: true });
    } catch {}
  },

  recoverJournalOnLaunch: async () => {
    try {
      const db = await getDatabase();
      if (!db) return;

      // Mark interrupted 'importing' jobs as failed
      await db.runAsync(
        `UPDATE jobs SET state = 'failed', error = 'Interrupted by app shutdown', updated_at = ? WHERE state = 'importing';`,
        [Date.now()]
      );

      const rows = await db.getAllAsync<any>(
        `SELECT id, state, progress, error, updated_at FROM jobs ORDER BY id DESC LIMIT 50;`
      );
      logger.info(TAG, `Journal recovered: found ${rows.length} recorded jobs`);
    } catch (err) {
      logger.warn(TAG, 'recoverJournalOnLaunch error', err);
    }
  },
}));

let isProcessingQueue = false;

async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  const db = await getDatabase();
  const repo = getBookRepository();

  try {
    while (true) {
      const nextItem = useImportQueueStore.getState().items.find((item) => item.state === 'queued');
      if (!nextItem) break;

      // Set to importing
      useImportQueueStore.setState((s) => ({
        items: s.items.map((i) => (i.id === nextItem.id ? { ...i, state: 'importing', progress: 10 } : i)),
      }));

      if (db) {
        await db.runAsync(`UPDATE jobs SET state = 'importing', progress = 0.1, updated_at = ? WHERE id = ?;`, [
          Date.now(),
          nextItem.id,
        ]);
      }

      try {
        // Query existing sha256 to avoid duplicates
        const existingShaList: string[] = [];
        if (db) {
          const shaRows = await db.getAllAsync<{ sha256: string }>(
            `SELECT sha256 FROM books WHERE sha256 IS NOT NULL;`
          );
          existingShaList.push(...shaRows.map((r) => r.sha256));
        }

        let ingestResult: any = null;

        if (nextItem.archiveHandleId && nextItem.archiveEntryPath) {
          ingestResult = await nativeStorage.extractEntryToImport({
            handleId: nextItem.archiveHandleId,
            entryPath: nextItem.archiveEntryPath,
            jobId: nextItem.id,
            existingSha256List: existingShaList,
          });
        } else {
          // Guard: sniff before ingesting to guarantee kind == 'book'
          const sniff = await nativeStorage.sniff(nextItem.uri, nextItem.name);
          if (sniff.kind !== 'book') {
            throw new Error(`Unsupported: Cannot import ${sniff.kind} item as a book (${sniff.reason})`);
          }

          ingestResult = await nativeStorage.ingestFile({
            uri: nextItem.uri,
            mode: nextItem.mode,
            name: nextItem.name,
            format: nextItem.format,
            existingSha256List: existingShaList,
            jobId: nextItem.id,
          });
        }

        if (!ingestResult) {
          throw new Error('Native ingest returned null');
        }

        if (ingestResult.isDuplicate) {
          logger.info(TAG, `Book already exists with SHA-256 ${ingestResult.sha256}`);
        } else {
          const bookFormat = ((ingestResult.format as any) || nextItem.format);
          let extractedMeta: any = null;
          try {
            const { MetadataExtractor } = await import('@/services/metadata/MetadataExtractor');
            extractedMeta = await MetadataExtractor.extract(
              ingestResult.pathOrUri,
              bookFormat,
              nextItem.name,
              ingestResult.bookId
            );
          } catch (mErr) {
            logger.warn(TAG, `Metadata extraction failed during queued ingest for ${nextItem.name}`, mErr);
          }

          let thumbnailUrl: string | undefined;
          if (extractedMeta?.coverUrl) {
            try {
              const { ThumbnailService } = await import('@/services/storage/ThumbnailService');
              const thumb = await ThumbnailService.generateThumbnail(extractedMeta.coverUrl);
              if (thumb) thumbnailUrl = thumb;
            } catch (tErr) {
              logger.warn(TAG, `Thumbnail generation failed during queued ingest for ${nextItem.name}`, tErr);
            }
          }

          const bookTitle = extractedMeta?.title || ingestResult.title || nextItem.name;
          const bookAuthor =
            extractedMeta?.author && extractedMeta.author !== 'Unknown Author'
              ? extractedMeta.author
              : (ingestResult.author || 'Unknown');
          const bookCoverColor = extractedMeta?.coverColor || '#3A3050';

          // Add to repository
          await repo.addBook({
            id: ingestResult.bookId,
            title: bookTitle,
            author: bookAuthor,
            description: extractedMeta?.description,
            format: bookFormat,
            uri: ingestResult.pathOrUri,
            filePath: ingestResult.pathOrUri,
            fileSize: ingestResult.size,
            coverUrl: extractedMeta?.coverUrl,
            thumbnailUrl: thumbnailUrl || extractedMeta?.coverUrl,
            coverColor: bookCoverColor,
            chapterCount: extractedMeta?.chapterCount || 1,
            progress: 0,
            isFavorite: false,
            collectionIds: [],
            dateAdded: Date.now(),
            availability: 'available',
            metadata: {
              ...(extractedMeta?.metadata || {}),
              sha256: ingestResult.sha256,
              sourceFileName: nextItem.name,
            },
          });

          // Link in book_files and books sha256
          if (db) {
            await db.runAsync(
              `UPDATE books SET sha256 = ?, authors = ?, added_at = ?, cover_path = ? WHERE id = ?;`,
              [
                ingestResult.sha256,
                bookAuthor,
                Date.now(),
                extractedMeta?.coverUrl || null,
                ingestResult.bookId,
              ]
            );
            await db.runAsync(
              `INSERT OR REPLACE INTO book_files (book_id, mode, path_or_uri, size, seekable) VALUES (?, ?, ?, ?, 1);`,
              [ingestResult.bookId, ingestResult.mode, ingestResult.pathOrUri, ingestResult.size]
            );
          }

          // Live update library store as each book is added
          try {
            const { useLibraryStore } = await import('@/state/libraryStore');
            void useLibraryStore.getState().loadLibrary({ force: true, silent: true });
          } catch {}
        }

        if (db) {
          await db.runAsync(`UPDATE jobs SET state = 'ready', progress = 1.0, updated_at = ? WHERE id = ?;`, [
            Date.now(),
            nextItem.id,
          ]);
        }

        useImportQueueStore.setState((s) => ({
          items: s.items.map((i) =>
            i.id === nextItem.id ? { ...i, state: 'ready', progress: 100, bookId: ingestResult.bookId } : i
          ),
        }));
      } catch (err: any) {
        logger.error(TAG, `Failed to ingest ${nextItem.name}`, err);
        const errMsg = err?.message || 'Ingest failed';

        if (db) {
          await db.runAsync(`UPDATE jobs SET state = 'failed', error = ?, updated_at = ? WHERE id = ?;`, [
            errMsg,
            Date.now(),
            nextItem.id,
          ]);
        }

        useImportQueueStore.setState((s) => ({
          items: s.items.map((i) => (i.id === nextItem.id ? { ...i, state: 'failed', error: errMsg } : i)),
        }));
      }
    }
  } finally {
    isProcessingQueue = false;
    try {
      const { useLibraryStore } = await import('@/state/libraryStore');
      await useLibraryStore.getState().loadLibrary({ force: true });
    } catch (e) {
      logger.warn(TAG, 'Failed to reload library store after queue processing', e);
    }
  }
}
