/**
 * Lirune Reader Mobile — Backup / Restore Service
 * Exports the full library state (books metadata, settings, annotations) as JSON.
 * Does NOT export binary book files — only metadata and preferences.
 */
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';

const TAG = 'BackupService';
const BACKUP_VERSION = 1;

export interface LiruneBackup {
  version: number;
  exportedAt: string;
  books: unknown[];
  collections: unknown[];
  settings: Record<string, unknown>;
  annotations: unknown[];
}

export const BackupService = {
  /**
   * Collect all library data and return a JSON string ready to write to a file.
   */
  async exportLibrary(): Promise<string> {
    const repo = getBookRepository() as any;
    try {
      const [books, collections, annotations] = await Promise.all([
        repo.getBooks?.() ?? [],
        repo.getCollections?.() ?? [],
        repo.getAnnotations?.() ?? [],
      ]);

      const settingKeys = [
        'appTheme', 'accentColor', 'readerSettings', 'readingProfiles',
        'accessibility', 'authorizedFolderUris', 'bookOverrides',
      ];
      const settings: Record<string, unknown> = {};
      for (const key of settingKeys) {
        settings[key] = await repo.getPreference?.(key, null);
      }

      const backup: LiruneBackup = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        books,
        collections,
        settings,
        annotations,
      };
      return JSON.stringify(backup, null, 2);
    } catch (err) {
      logger.error(TAG, 'exportLibrary failed', err);
      throw err;
    }
  },

  /**
   * Parse a backup JSON string and restore data into the repository.
   * Returns a summary of what was restored.
   */
  async importLibrary(json: string): Promise<{ books: number; annotations: number }> {
    let backup: LiruneBackup;
    try {
      backup = JSON.parse(json);
    } catch {
      throw new Error('Invalid backup file: could not parse JSON');
    }
    if (!backup.version || backup.version > BACKUP_VERSION) {
      throw new Error(`Unsupported backup version: ${backup.version}`);
    }

    const repo = getBookRepository() as any;
    let restoredBooks = 0;
    let restoredAnnotations = 0;

    // Restore settings preferences
    if (backup.settings) {
      for (const [key, value] of Object.entries(backup.settings)) {
        if (value !== null && value !== undefined) {
          await repo.setPreference?.(key, value);
        }
      }
    }

    // Restore annotations
    if (Array.isArray(backup.annotations)) {
      for (const ann of backup.annotations) {
        try {
          await repo.saveAnnotation?.(ann);
          restoredAnnotations++;
        } catch { /* skip duplicates */ }
      }
    }

    logger.info(TAG, `Restored ${restoredBooks} books, ${restoredAnnotations} annotations`);
    return { books: restoredBooks, annotations: restoredAnnotations };
  },
};
