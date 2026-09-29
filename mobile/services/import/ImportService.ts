/**
 * Lirune Reader Mobile — File Import Service
 * Handles Android document picker, format validation, storage copy, metadata extraction,
 * and database registration.
 */

import * as DocumentPicker from 'expo-document-picker';
import {
  Book,
  BookFormat,
  getFormatFromExtension,
} from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { fileStorage } from '@/services/storage/FileStorage';
import { MetadataExtractor } from '@/services/metadata/MetadataExtractor';
import {
  AppError,
  UnsupportedFormatError,
  ImportFailureError,
} from '@/utils/errors';
import { logger } from '@/utils/logger';

const TAG = 'ImportService';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ImportResult {
  success: boolean;
  book?: Book;
  error?: AppError;
  cancelled?: boolean;
}

export class ImportService {
  /**
   * Prompts the user to pick a document, validates the format, copies it to local app storage,
   * extracts metadata & cover, and persists it to the database.
   */
  static async pickAndImportBook(): Promise<ImportResult> {
    try {
      logger.info(TAG, 'Opening document picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/epub+zip',
          'application/pdf',
          'text/plain',
          'text/html',
          'application/x-fictionbook+xml',
          'application/vnd.comicbook+zip',
          '*/*', // Allow Android file managers that might not report specific MIME types
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        logger.info(TAG, 'Document picker cancelled');
        return { success: false, cancelled: true };
      }

      const asset = result.assets[0];
      return await this.importFile(asset.uri, asset.name, asset.size);
    } catch (err) {
      logger.error(TAG, 'Failed during document picker flow', err);
      const appErr =
        err instanceof AppError
          ? err
          : new ImportFailureError(
              'Selected file',
              (err as Error).message || 'Unable to import this file.'
            );
      return { success: false, error: appErr };
    }
  }

  /**
   * Imports a specific file URI into Lirune Reader.
   */
  static async importFile(
    sourceUri: string,
    fileName: string,
    fileSizeHint?: number
  ): Promise<ImportResult> {
    const repo = getBookRepository();

    try {
      logger.info(TAG, `Processing import for file: ${fileName}`);

      // 1. Identify format by extension
      const formatInfo = getFormatFromExtension(fileName);
      if (!formatInfo.supported) {
        throw new UnsupportedFormatError(
          fileName.split('.').pop() || 'unknown',
          formatInfo.reason
        );
      }

      const format = formatInfo.id as BookFormat;

      // 2. Check for duplicate by filename and size if already in library
      const existingBooks = await repo.getBooks();
      const duplicate = existingBooks.find(
        (b) =>
          b.title.toLowerCase() === fileName.replace(/\.[^/.]+$/, '').toLowerCase() &&
          b.format === format
      );
      if (duplicate) {
        logger.info(TAG, `Book already exists in library: ${duplicate.title}`);
        return { success: true, book: duplicate };
      }

      // 3. Generate unique stable ID & copy into application-managed storage
      const bookId = generateUUID();
      const { destPath, fileSize } = await fileStorage.copyToAppStorage(
        sourceUri,
        bookId,
        fileName
      );

      // 4. Extract format-specific metadata & cover
      const metadata = await MetadataExtractor.extract(
        destPath,
        format,
        fileName,
        bookId
      );

      // 5. Construct domain Book record
      const now = Date.now();
      const newBook: Book = {
        id: bookId,
        title: metadata.title,
        author: metadata.author,
        description: metadata.description,
        format,
        filePath: destPath,
        fileSize: fileSize || fileSizeHint || 0,
        coverUrl: metadata.coverUrl,
        coverColor: metadata.coverColor,
        progress: 0,
        currentCfi: undefined,
        currentChapter: undefined,
        chapterCount: metadata.chapterCount || 1,
        isFavorite: false,
        collectionIds: [],
        dateAdded: now,
        lastReadDate: undefined,
        availability: 'available',
        metadata: metadata.metadata,
      };

      // 6. Persist to SQLite
      await repo.addBook(newBook);
      logger.info(TAG, `Book successfully imported: "${newBook.title}" (${newBook.id})`);

      return { success: true, book: newBook };
    } catch (err) {
      logger.error(TAG, `Import failed for "${fileName}"`, err);
      const appErr =
        err instanceof AppError
          ? err
          : new ImportFailureError(
              fileName,
              (err as Error).message || 'An unexpected error occurred during import.'
            );
      return { success: false, error: appErr };
    }
  }
}
