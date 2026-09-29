/**
 * Lirune Reader Mobile — Application File Storage Service
 * Manages persistent files in app-private storage.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '@/utils/logger';

const TAG = 'FileStorage';

const BOOKS_DIR = `${FileSystem.documentDirectory || ''}books/`;
const COVERS_DIR = `${FileSystem.documentDirectory || ''}covers/`;

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

    try {
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destPath,
      });

      const info = await FileSystem.getInfoAsync(destPath);
      const fileSize = info.exists && !info.isDirectory ? info.size : 0;

      logger.info(TAG, `Saved book to app storage: ${destPath} (${fileSize} bytes)`);
      return { destPath, fileSize };
    } catch (err) {
      logger.error(TAG, `Failed to copy file to storage: ${sourceUri}`, err);
      throw err;
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
   * Deletes a book file and its cover image from app storage.
   */
  async deleteBookFiles(filePath: string, coverUrl?: string): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      const bookInfo = await FileSystem.getInfoAsync(filePath);
      if (bookInfo.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }

      if (coverUrl && coverUrl.startsWith(COVERS_DIR)) {
        const coverInfo = await FileSystem.getInfoAsync(coverUrl);
        if (coverInfo.exists) {
          await FileSystem.deleteAsync(coverUrl, { idempotent: true });
        }
      }
    } catch (err) {
      logger.warn(TAG, `Failed to delete files for ${filePath}`, err);
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
      const books = await FileSystem.readDirectoryAsync(BOOKS_DIR);
      bookCount = books.length;
      for (const name of books) {
        const info = await FileSystem.getInfoAsync(`${BOOKS_DIR}${name}`);
        if (info.exists && !info.isDirectory) {
          totalBytes += info.size;
        }
      }

      const covers = await FileSystem.readDirectoryAsync(COVERS_DIR);
      for (const name of covers) {
        const info = await FileSystem.getInfoAsync(`${COVERS_DIR}${name}`);
        if (info.exists && !info.isDirectory) {
          totalBytes += info.size;
        }
      }
    } catch (err) {
      logger.warn(TAG, 'Error calculating storage usage', err);
    }

    return { totalBytes, bookCount };
  }
}

export const fileStorage = new FileStorageService();
