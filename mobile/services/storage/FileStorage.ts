/**
 * Lirune Reader Mobile — Application File Storage Service
 * Manages persistent files in app-private storage.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getContentUriAsync } from 'expo-file-system';
import { File as ExpoFile } from 'expo-file-system';
import { logger } from '@/utils/logger';
import { nativeStorage } from './NativeStorageBridge';

const TAG = 'FileStorage';

const BOOKS_DIR = `${FileSystem.documentDirectory || ''}books/`;
const COVERS_DIR = `${FileSystem.documentDirectory || ''}covers/`;

function base64ToBuffer(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export class FileStorageService {
  private initialized = false;

  async ensureDirectories(): Promise<void> {
    if (this.initialized || Platform.OS === 'web') return;
    try {
      const booksInfo = await FileSystem.getInfoAsync(BOOKS_DIR);
      if (!booksInfo.exists) {
        await FileSystem.makeDirectoryAsync(BOOKS_DIR, { intermediates: true });
      }

      const coversInfo = await FileSystem.getInfoAsync(COVERS_DIR);
      if (!coversInfo.exists) {
        await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true });
      }

      this.initialized = true;
    } catch (err) {
      logger.error(TAG, 'Error creating storage directories', err);
      throw new Error('App storage is unavailable. Please check device storage and try again.');
    }
  }

  /**
   * Deletes half-written imports left behind by a crash or a killed process.
   *
   * `copyToAppStorage` stages every book as `<path>.part` and renames it only
   * once the size is verified, so a `.part` file is by definition garbage. Called
   * once from the app layout, off the critical path.
   */
  async cleanupPartialImports(): Promise<number> {
    if (Platform.OS === 'web') return 0;
    let removed = 0;
    try {
      const entries = await FileSystem.readDirectoryAsync(BOOKS_DIR);
      for (const entry of entries) {
        if (!entry.endsWith('.part')) continue;
        await FileSystem.deleteAsync(`${BOOKS_DIR}${entry}`, { idempotent: true });
        removed++;
      }
      if (removed > 0) logger.info(TAG, `Removed ${removed} partial import(s) from a previous session`);
    } catch (err) {
      logger.warn(TAG, 'Partial import cleanup skipped', err);
    }
    return removed;
  }

  /**
   * Fails before a copy starts when the device cannot hold the book.
   *
   * A half-written file plus a library row is worse than a clear message: the
   * import used to fail at the very end with a generic storage error.
   */
  async assertFreeSpace(requiredBytes: number): Promise<void> {
    if (Platform.OS === 'web' || requiredBytes <= 0) return;
    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      // 32MB of headroom for SQLite, the cover cache and the OS itself.
      if (free < requiredBytes + 32 * 1024 * 1024) {
        const freeMb = Math.max(1, Math.round(free / 1024 / 1024));
        const neededMb = Math.round(requiredBytes / 1024 / 1024);
        throw new Error(
          `Not enough free space to import this book (needs about ${neededMb} MB, ${freeMb} MB free).`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Not enough free space')) throw err;
      // A device that cannot report free space is not a reason to refuse an import.
      logger.warn(TAG, 'Free space check unavailable', err);
    }
  }

  /**
   * Copies a picked file from its temporary/content URI into app-managed durable storage.
   */
  async copyToAppStorage(
    sourceUri: string,
    fileId: string,
    originalName: string
  ): Promise<{ destPath: string; fileSize: number }> {
    await this.ensureDirectories();

    if (Platform.OS === 'web') {
      return { destPath: sourceUri, fileSize: 0 };
    }

    const extMatch = originalName.match(/\.([A-Za-z0-9]+)$/);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '';
    const destPath = `${BOOKS_DIR}${fileId}${ext}`;
    // Written first, renamed last: an import interrupted by a crash, a low-battery
    // shutdown or the OS killing the app left a half-written book at the final
    // path, and the library then had a row pointing at a truncated EPUB.
    const stagingPath = `${destPath}.part`;

    let normalizedSource = sourceUri;
    if (normalizedSource.startsWith('file:///sdcard/')) {
      normalizedSource = normalizedSource.replace('file:///sdcard/', 'file:///storage/emulated/0/');
    }

    // Try high-performance native stream copy first for Android content/file URIs
    const nativeBytes = await nativeStorage.copyContentUriToStorage(normalizedSource, stagingPath);
    if (nativeBytes !== null && nativeBytes > 0) {
      logger.info(TAG, `Native stream copied ${nativeBytes} bytes to ${stagingPath}`);
    } else {
      try {
        await FileSystem.copyAsync({
          from: normalizedSource,
          to: stagingPath,
        });
      } catch (copyErr) {
        logger.warn(TAG, `copyAsync failed, trying content stream fallback for: ${sourceUri}`, copyErr);
        try {
          let base64Data: string;
          if (sourceUri.startsWith('content://')) {
            base64Data = await FileSystem.StorageAccessFramework.readAsStringAsync(sourceUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } else if (sourceUri.startsWith('file://')) {
            try {
              const contentUri = await getContentUriAsync(sourceUri);
              base64Data = await FileSystem.StorageAccessFramework.readAsStringAsync(contentUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
            } catch (contentErr) {
              logger.warn(TAG, `getContentUriAsync fallback also failed for ${sourceUri}`, contentErr);
              throw new Error('The selected file could not be read via content resolver.');
            }
          } else {
            base64Data = await FileSystem.readAsStringAsync(normalizedSource, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }
          await FileSystem.writeAsStringAsync(stagingPath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (readErr) {
          logger.warn(TAG, `Failed both copyAsync and readAsString fallback for ${sourceUri}`, readErr);
          await FileSystem.deleteAsync(stagingPath, { idempotent: true }).catch(() => undefined);
          throw new Error('The selected file could not be copied into app storage.');
        }
      }
    }

    try {
      const staged = await FileSystem.getInfoAsync(stagingPath);
      const stagedSize = staged.exists && !staged.isDirectory ? staged.size ?? 0 : 0;
      if (!staged.exists || staged.isDirectory || stagedSize <= 0) {
        throw new Error('The selected file could not be copied into app storage.');
      }

      // Verified: now it becomes a book. Move is atomic within the same directory.
      await FileSystem.moveAsync({ from: stagingPath, to: destPath });

      logger.info(TAG, `Saved book to app storage: ${destPath} (${stagedSize} bytes)`);
      return { destPath, fileSize: stagedSize };
    } catch (err) {
      await FileSystem.deleteAsync(stagingPath, { idempotent: true }).catch(() => undefined);
      if (err instanceof Error && err.message === 'The selected file could not be copied into app storage.') {
        throw err;
      }
      throw new Error('The selected file could not be copied into app storage.');
    }
  }

  /**
   * Saves a base64 cover image into app storage.
   */
  async saveCoverImage(
    fileId: string,
    base64Data: string,
    extension = 'jpg'
  ): Promise<string> {
    await this.ensureDirectories();

    if (Platform.OS === 'web') {
      return `data:image/${extension};base64,${base64Data}`;
    }

    const coverPath = `${COVERS_DIR}${fileId}.${extension}`;
    try {
      // Strip data url prefix if present
      const cleanData = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      await FileSystem.writeAsStringAsync(coverPath, cleanData, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return coverPath;
    } catch (err) {
      logger.warn(TAG, `Failed to save cover image for ${fileId}`, err);
      await FileSystem.deleteAsync(coverPath, { idempotent: true }).catch(() => undefined);
      return '';
    }
  }

  /**
   * Writes a text file into app-private storage (e.g. a library export).
   * Returns the path written, or throws.
   */
  async writeTextFile(fileName: string, contents: string): Promise<string> {
    await this.ensureDirectories();
    const exportsDir = `${FileSystem.documentDirectory || ''}exports/`;
    const info = await FileSystem.getInfoAsync(exportsDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(exportsDir, { intermediates: true });
    }
    const safeName = fileName.replace(/[^\w.-]/g, '_');
    const destPath = `${exportsDir}${safeName}`;
    await FileSystem.writeAsStringAsync(destPath, contents, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return destPath;
  }

  /**
   * Returns the size of a file in bytes, or 0 when it cannot be determined.
   */
  async getFileSize(filePath: string): Promise<number> {
    if (Platform.OS === 'web') return 0;
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      return info.exists && !info.isDirectory ? info.size ?? 0 : 0;
    } catch (err) {
      logger.warn(TAG, `Unable to stat file: ${filePath}`, err);
      return 0;
    }
  }

  /**
   * Reads a byte range from a file without loading the whole file into memory.
   * `length` is a number of BYTES, not characters.
   *
   * Reads are clipped to the end of the file, so asking for more than remains is
   * safe. Returns an empty string when nothing could be read.
   */
  async readRangeAsString(
    filePath: string,
    start: number,
    length: number
  ): Promise<string> {
    if (Platform.OS === 'web') {
      const full = await this.readAsString(filePath);
      return full.slice(start, start + length);
    }

    if (length <= 0 || start < 0) return '';

    try {
      return await FileSystem.readAsStringAsync(filePath, {
        position: start,
        length: length,
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      logger.warn(TAG, `readRangeAsString failed for ${filePath}`, err);
      return '';
    }
  }

  /**
   * Reads a stored file as text (e.g., for TXT, HTML, FB2).
   */
  async readAsString(filePath: string): Promise<string> {
    if (Platform.OS === 'web') {
      const res = await fetch(filePath);
      return await res.text();
    }
    return await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  /**
   * Reads a stored file as base64 (e.g., for EPUB or CBZ processing).
   * @deprecated Use readAsArrayBuffer for better performance.
   */
  async readAsBase64(filePath: string): Promise<string> {
    if (Platform.OS === 'web') {
      const res = await fetch(filePath);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    return await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  /**
   * Reads a stored file as bytes for ZIP parsing (EPUB, CBZ, CBR).
   *
   * `expo-file-system`'s `File` API hands the bytes over directly; the legacy path
   * materialises the whole publication as a base64 string first, which costs about
   * 2.3x the file size in JS heap (base64 string, then the decoded buffer, then
   * JSZip's own copy) and was the reason large books were killed by the WebView.
   */
  async readAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
    if (Platform.OS !== 'web') {
      try {
        const bytes = await new ExpoFile(filePath).bytes();
        // Copy into a standalone ArrayBuffer: the view may be a slice of a larger
        // native allocation, and JSZip keeps the whole thing alive either way.
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
      } catch (err) {
        logger.warn(TAG, `Native byte read failed for ${filePath}, falling back to base64`, err);
      }
    }
    const base64 = await this.readAsBase64(filePath);
    return base64ToBuffer(base64);
  }

  /**
   * Deletes a book file and its cover image from app storage.
   */
  async deleteBookFiles(filePath: string, coverUrl?: string): Promise<void> {
    if (Platform.OS === 'web') return;

    // Only remove app-owned copies. `Book.uri` may be a SAF/content URI for a
    // user's original document and must never be passed to deleteAsync.
    if (filePath && filePath.startsWith(BOOKS_DIR)) {
      try {
        const bookInfo = await FileSystem.getInfoAsync(filePath);
        if (bookInfo.exists) {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
      } catch (err) {
        logger.warn(TAG, `Failed to delete book file ${filePath}`, err);
      }
    }

    if (coverUrl && coverUrl.startsWith(COVERS_DIR)) {
      try {
        const coverInfo = await FileSystem.getInfoAsync(coverUrl);
        if (coverInfo.exists) {
          await FileSystem.deleteAsync(coverUrl, { idempotent: true });
        }
      } catch (err) {
        logger.warn(TAG, `Failed to delete cover file ${coverUrl}`, err);
      }
    }
  }

  /**
   * Calculates total storage used by Lirune books and covers.
   */
  async getStorageUsage(): Promise<{ totalBytes: number; bookCount: number }> {
    if (Platform.OS === 'web') return { totalBytes: 0, bookCount: 0 };

    await this.ensureDirectories();
    let totalBytes = 0;
    let bookCount = 0;

    try {
      const [books, covers] = await Promise.all([
        FileSystem.readDirectoryAsync(BOOKS_DIR),
        FileSystem.readDirectoryAsync(COVERS_DIR),
      ]);
      const entries = await Promise.all([
        ...books.map(async (name) => ({
          kind: 'book' as const,
          info: await FileSystem.getInfoAsync(`${BOOKS_DIR}${name}`),
        })),
        ...covers.map(async (name) => ({
          kind: 'cover' as const,
          info: await FileSystem.getInfoAsync(`${COVERS_DIR}${name}`),
        })),
      ]);
      for (const { kind, info } of entries) {
        if (info.exists && !info.isDirectory) {
          totalBytes += info.size ?? 0;
          if (kind === 'book') bookCount++;
        }
      }
    } catch (err) {
      logger.warn(TAG, 'Error calculating storage usage', err);
    }

    return { totalBytes, bookCount };
  }
}

export const fileStorage = new FileStorageService();
