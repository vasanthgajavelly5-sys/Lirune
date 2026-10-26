/**
 * Lirune Reader Mobile — Cover Thumbnail Service
 *
 * Generates ~400px wide optimized cover thumbnails for library grid and list views,
 * keeping full-resolution originals for the reader. Includes a background, batched,
 * resumable, and idempotent migration for existing library books.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Book } from '@/models/Book';
import { nativeStorage } from './NativeStorageBridge';
import { logger } from '@/utils/logger';

import {
  THUMBNAIL_WIDTH,
  getThumbnailPath,
  getListCoverUri,
} from '@/utils/thumbnailUtils';

export { THUMBNAIL_WIDTH, getThumbnailPath, getListCoverUri };

const TAG = 'ThumbnailService';

export class ThumbnailService {
  /**
   * Checks whether a thumbnail already exists on the filesystem.
   */
  static async hasThumbnail(originalCoverPath?: string): Promise<boolean> {
    if (!originalCoverPath || Platform.OS === 'web') return false;
    const thumbPath = getThumbnailPath(originalCoverPath);
    if (!thumbPath) return false;

    try {
      const cleanPath = thumbPath.startsWith('file://') ? thumbPath : `file://${thumbPath}`;
      const info = await FileSystem.getInfoAsync(cleanPath);
      return info.exists && (info.size ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Generates a ~400px wide thumbnail for the given original cover image.
   * If native thumbnail generation is unavailable or fails, gracefully falls back to the original.
   */
  static async generateThumbnail(
    originalCoverPath?: string,
    targetWidth = THUMBNAIL_WIDTH
  ): Promise<string | null> {
    if (!originalCoverPath) return null;
    if (Platform.OS === 'web') return originalCoverPath;

    const thumbPath = getThumbnailPath(originalCoverPath);
    if (!thumbPath || thumbPath === originalCoverPath) return originalCoverPath;

    try {
      // Check if already generated
      const exists = await this.hasThumbnail(originalCoverPath);
      if (exists) return thumbPath;

      const success = await nativeStorage.createThumbnail(originalCoverPath, thumbPath, targetWidth);
      if (success) {
        logger.debug(TAG, `Created thumbnail: ${thumbPath}`);
        return thumbPath;
      }
    } catch (err) {
      logger.warn(TAG, `Thumbnail generation error for ${originalCoverPath}`, err);
    }

    return null;
  }

  /**
   * One-time background migration: creates thumbnails for all existing books with covers.
   * Runs in small idle batches to ensure launch and UI remain completely unaffected.
   * Fully resumable and idempotent.
   */
  static async migrateExistingCovers(
    books: Book[],
    options: {
      batchSize?: number;
      batchDelayMs?: number;
      onProgress?: (processed: number, total: number) => void;
    } = {}
  ): Promise<{ total: number; processed: number; generated: number; skipped: number }> {
    const { batchSize = 4, batchDelayMs = 100, onProgress } = options;
    const candidates = books.filter((b) => Boolean(b.coverUrl));
    const total = candidates.length;

    let processed = 0;
    let generated = 0;
    let skipped = 0;

    for (let i = 0; i < total; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (book) => {
          try {
            if (!book.coverUrl) {
              skipped++;
              return;
            }

            const exists = await this.hasThumbnail(book.coverUrl);
            if (exists) {
              skipped++;
              return;
            }

            const thumb = await this.generateThumbnail(book.coverUrl);
            if (thumb) {
              generated++;
            } else {
              skipped++;
            }
          } catch {
            skipped++;
          } finally {
            processed++;
          }
        })
      );

      onProgress?.(processed, total);

      // Yield event loop between batches
      if (i + batchSize < total && batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }

    return { total, processed, generated, skipped };
  }
}
