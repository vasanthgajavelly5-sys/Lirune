/**
 * Lirune Reader Mobile — Source Resolver Service
 * Canonical architecture for resolving book documents from SAF content:// URIs,
 * app storage, and temporary seekable cache.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Book } from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { SourceUnavailableError } from '@/utils/errors';
import { logger } from '@/utils/logger';

const TAG = 'SourceResolver';
const CACHE_DIR = `${FileSystem.cacheDirectory || ''}lirune_cache/`;

export interface ResolvedSource {
  localPath: string;
  isTemporaryCache: boolean;
  canonicalUri: string;
  fileSize: number;
}

export class SourceResolver {
  private static isEnsuredCacheDir = false;

  private static async ensureCacheDir(): Promise<void> {
    if (this.isEnsuredCacheDir || Platform.OS === 'web') return;
    try {
      const info = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }
      this.isEnsuredCacheDir = true;
    } catch (err) {
      logger.warn(TAG, 'Failed to create cache directory', err);
    }
  }

  /**
   * Resolves a Book's canonical URI into an accessible local file path.
   * If the book is stored in app storage or is already a local file, it returns it directly.
   * If it is a SAF content:// URI, it checks the local cache or stages a copy into bounded cache.
   */
  static async resolve(book: Book): Promise<ResolvedSource> {
    const startTime = Date.now();
    const canonicalUri = book.uri || book.filePath || '';

    if (!canonicalUri) {
      logger.error(TAG, `Book "${book.title}" (${book.id}) has neither URI nor filePath`);
      throw new SourceUnavailableError('unknown', 'No valid URI or file path recorded for this book.');
    }

    if (Platform.OS === 'web') {
      return {
        localPath: canonicalUri,
        isTemporaryCache: false,
        canonicalUri,
        fileSize: book.fileSize,
      };
    }

    // 1. Check if book.filePath exists on disk
    if (book.filePath) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(book.filePath);
        if (fileInfo.exists && !fileInfo.isDirectory) {
          logger.info(TAG, `Resolved "${book.title}" from direct filePath in ${Date.now() - startTime}ms`);
          return {
            localPath: book.filePath,
            isTemporaryCache: false,
            canonicalUri,
            fileSize: fileInfo.size ?? book.fileSize,
          };
        }
      } catch (err) {
        logger.warn(TAG, `Direct filePath check failed for ${book.filePath}`, err);
      }
    }

    // 2. Check if canonicalUri is a direct file:// path
    if (canonicalUri.startsWith('file://')) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(canonicalUri);
        if (fileInfo.exists && !fileInfo.isDirectory) {
          logger.info(TAG, `Resolved "${book.title}" from file:// URI in ${Date.now() - startTime}ms`);
          return {
            localPath: canonicalUri,
            isTemporaryCache: false,
            canonicalUri,
            fileSize: fileInfo.size ?? book.fileSize,
          };
        }
      } catch (err) {
        logger.warn(TAG, `file:// URI check failed for ${canonicalUri}`, err);
      }
    }

    // 3. For SAF content:// URI or missing filePath, use bounded temporary cache
    await this.ensureCacheDir();

    // Derive extension from title, format, or uri
    const ext = book.format ? `.${book.format}` : '.bin';
    const bookCacheDir = `${CACHE_DIR}${book.id}/`;
    const cachedFilePath = `${bookCacheDir}source${ext}`;

    try {
      const cacheInfo = await FileSystem.getInfoAsync(cachedFilePath);
      if (cacheInfo.exists && !cacheInfo.isDirectory && (cacheInfo.size || 0) > 0) {
        logger.info(TAG, `Resolved "${book.title}" from existing cache: ${cachedFilePath} (${Date.now() - startTime}ms)`);
        return {
          localPath: cachedFilePath,
          isTemporaryCache: true,
          canonicalUri,
          fileSize: cacheInfo.size ?? book.fileSize,
        };
      }
    } catch {
      // cache entry check failed, proceed to recreate
    }

    // Staging into cache from canonical URI
    logger.info(TAG, `Staging canonical SAF source into cache for "${book.title}": ${canonicalUri}`);
    try {
      const dirInfo = await FileSystem.getInfoAsync(bookCacheDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(bookCacheDir, { intermediates: true });
      }

      if (canonicalUri.startsWith('content://')) {
        // Try direct copy first
        try {
          await FileSystem.copyAsync({
            from: canonicalUri,
            to: cachedFilePath,
          });
        } catch (copyErr) {
          logger.warn(TAG, `copyAsync failed for SAF URI, falling back to base64 stream`, copyErr);
          let base64Data: string;
          if (FileSystem.StorageAccessFramework?.readAsStringAsync) {
            base64Data = await FileSystem.StorageAccessFramework.readAsStringAsync(canonicalUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } else {
            base64Data = await FileSystem.readAsStringAsync(canonicalUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }
          await FileSystem.writeAsStringAsync(cachedFilePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
      } else {
        await FileSystem.copyAsync({
          from: canonicalUri,
          to: cachedFilePath,
        });
      }

      const postInfo = await FileSystem.getInfoAsync(cachedFilePath);
      if (!postInfo.exists || postInfo.isDirectory || (postInfo.size ?? 0) === 0) {
        throw new Error('Cached file verification failed (0 bytes or missing)');
      }

      logger.info(TAG, `Successfully cached source for "${book.title}" in ${Date.now() - startTime}ms (${postInfo.size} bytes)`);
      return {
        localPath: cachedFilePath,
        isTemporaryCache: true,
        canonicalUri,
        fileSize: postInfo.size ?? book.fileSize,
      };
    } catch (err: any) {
      logger.error(TAG, `Failed to resolve or cache source for "${book.title}" (${canonicalUri})`, err);

      // Mark book as missing in database so library can display appropriate indicator
      try {
        const repo = getBookRepository();
        await repo.updateBook({ ...book, availability: 'missing' });
      } catch (repoErr) {
        logger.warn(TAG, 'Failed to update book availability to missing', repoErr);
      }

      throw new SourceUnavailableError(
        canonicalUri,
        err?.message || 'Could not access file. Permission may have expired or file was moved.'
      );
    }
  }

  /**
   * Re-links a missing book to a new SAF or local URI.
   */
  static async relinkSource(book: Book, newUri: string): Promise<Book> {
    logger.info(TAG, `Re-linking book "${book.title}" (${book.id}) to new URI: ${newUri}`);
    const repo = getBookRepository();
    const updatedBook: Book = {
      ...book,
      uri: newUri,
      availability: 'available',
    };
    await repo.updateBook(updatedBook);

    // Validate resolution
    await this.resolve(updatedBook);
    return updatedBook;
  }

  /**
   * Cleans the entire temporary cache directory.
   */
  static async clearCache(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      const info = await FileSystem.getInfoAsync(CACHE_DIR);
      if (info.exists) {
        await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
        this.isEnsuredCacheDir = false;
        await this.ensureCacheDir();
        logger.info(TAG, 'Temporary source cache cleared successfully');
      }
    } catch (err) {
      logger.warn(TAG, 'Error clearing temporary source cache', err);
    }
  }

  /**
   * Returns the total storage used by temporary cache files in bytes.
   */
  static async getCacheSize(): Promise<number> {
    if (Platform.OS === 'web') return 0;
    try {
      const info = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!info.exists) return 0;

      let total = 0;
      const subdirs = await FileSystem.readDirectoryAsync(CACHE_DIR);
      for (const dir of subdirs) {
        const subPath = `${CACHE_DIR}${dir}/`;
        const subInfo = await FileSystem.getInfoAsync(subPath);
        if (subInfo.exists && subInfo.isDirectory) {
          const files = await FileSystem.readDirectoryAsync(subPath);
          for (const f of files) {
            const fInfo = await FileSystem.getInfoAsync(`${subPath}${f}`);
            if (fInfo.exists && !fInfo.isDirectory) {
              total += fInfo.size ?? 0;
            }
          }
        }
      }
      return total;
    } catch {
      return 0;
    }
  }
}
