/**
 * Lirune Reader Mobile — Scan State Store (Zustand)
 * Manages streaming discovery, incremental diff scanning, and candidate entries.
 */

import { create } from 'zustand';
import { nativeStorage, ScanBatchEntry } from '@/services/storage/NativeStorageBridge';
import { getDatabase } from '@/services/database/Database';
import { logger } from '@/utils/logger';

const TAG = 'ScanStore';

export interface ScanStoreState {
  isScanning: boolean;
  currentDir: string;
  foundCount: number;
  entries: ScanBatchEntry[];
  unsubscribers: (() => void)[];

  startScan: (options?: { treeUri?: string; localPath?: string; maxDepth?: number }) => Promise<void>;
  cancelScan: () => Promise<void>;
  clearEntries: () => void;
  loadPersistedEntries: (sourceId?: number) => Promise<void>;
}

export const useScanStore = create<ScanStoreState>((set, get) => ({
  isScanning: false,
  currentDir: '',
  foundCount: 0,
  entries: [],
  unsubscribers: [],

  startScan: async (options = {}) => {
    // Clean up any existing listeners
    get().unsubscribers.forEach((unsub) => unsub());

    set({ isScanning: true, foundCount: 0, currentDir: '', unsubscribers: [] });

    const unsubs: (() => void)[] = [];

    unsubs.push(
      nativeStorage.onScanProgress(({ found, currentDir }) => {
        set({ foundCount: found, currentDir });
      })
    );

    unsubs.push(
      nativeStorage.onScanBatch(async ({ entries: batch }) => {
        set((state) => ({
          entries: [...state.entries, ...batch],
          foundCount: state.entries.length + batch.length,
        }));

        // Persist batch into SQLite entries table in transaction
        try {
          const db = await getDatabase();
          if (db) {
            await db.withTransactionAsync(async () => {
              for (const entry of batch) {
                await db.runAsync(
                  `INSERT INTO entries (doc_id, uri, parent_doc_id, name, size, mtime, sniff_format, confidence, quick_fp, state, fail_reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(source_id, doc_id) DO UPDATE SET
                     size = excluded.size,
                     mtime = excluded.mtime,
                     sniff_format = excluded.sniff_format,
                     confidence = excluded.confidence,
                     quick_fp = excluded.quick_fp,
                     state = excluded.state,
                     fail_reason = excluded.fail_reason;`,
                  [
                    entry.docId,
                    entry.uri,
                    entry.parentDocId ?? '',
                    entry.name,
                    entry.size,
                    entry.mtime,
                    entry.sniffFormat,
                    entry.confidence,
                    entry.quickFp,
                    entry.state,
                    entry.failReason ?? '',
                  ]
                );
              }
            });
          }
        } catch (err) {
          logger.warn(TAG, 'Failed to persist scan batch into SQLite', err);
        }
      })
    );

    unsubs.push(
      nativeStorage.onScanDone(({ total, durationMs }) => {
        logger.info(TAG, `Scan completed: ${total} files in ${durationMs}ms`);
        set({ isScanning: false });
      })
    );

    unsubs.push(
      nativeStorage.onScanCancelled(() => {
        logger.info(TAG, 'Scan was cancelled');
        set({ isScanning: false });
      })
    );

    unsubs.push(
      nativeStorage.onScanError(({ error }) => {
        logger.error(TAG, 'Scan error encountered', error);
        set({ isScanning: false });
      })
    );

    set({ unsubscribers: unsubs });
    await nativeStorage.startScan(options);
  },

  cancelScan: async () => {
    await nativeStorage.cancelScan();
    set({ isScanning: false });
  },

  clearEntries: () => {
    set({ entries: [], foundCount: 0, currentDir: '' });
  },

  loadPersistedEntries: async (sourceId?: number) => {
    try {
      const db = await getDatabase();
      if (!db) return;

      const rows = sourceId
        ? await db.getAllAsync<any>('SELECT * FROM entries WHERE source_id = ? ORDER BY id DESC', [sourceId])
        : await db.getAllAsync<any>('SELECT * FROM entries ORDER BY id DESC LIMIT 500');

      const mapped: ScanBatchEntry[] = rows.map((r) => ({
        docId: r.doc_id,
        uri: r.uri,
        parentDocId: r.parent_doc_id,
        name: r.name,
        size: r.size,
        mtime: r.mtime,
        sniffFormat: r.sniff_format,
        confidence: r.confidence,
        quickFp: r.quick_fp,
        state: r.state,
        failReason: r.fail_reason,
      }));

      set({ entries: mapped, foundCount: mapped.length });
    } catch (err) {
      logger.warn(TAG, 'loadPersistedEntries failed', err);
    }
  },
}));
