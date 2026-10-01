/**
 * Lirune Reader Mobile — File Import Service
 * Handles Android document picker, format validation, storage copy, metadata extraction,
 * and database registration.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Book,
  BookFormat,
  getFormatFromExtension,
} from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { fileStorage } from '@/services/storage/FileStorage';
import { MetadataExtractor } from '@/services/metadata/MetadataExtractor';
import { FormatDetector } from '@/services/discovery/FormatDetector';
import {
  AppError,
  UnsupportedFormatError,
  ImportFailureError,
} from '@/utils/errors';
import { logger } from '@/utils/logger';

const TAG = 'ImportService';
const MAX_IMPORT_BYTES = 512 * 1024 * 1024;

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
  private static isPickingActive = false;

  public static isBusy(): boolean {
    return this.isPickingActive;
  }

  public static acquireLock(): boolean {
    if (this.isPickingActive) return false;
    this.isPickingActive = true;
    return true;
  }

  public static releaseLock(): void {
    this.isPickingActive = false;
  }

  /**
   * Prompts the user to pick a document, validates the format, copies it to local app storage,
   * extracts metadata & cover, and persists it to the database.
   */
  static async pickAndImportBook(): Promise<ImportResult> {
    if (!this.acquireLock()) {
      logger.warn(TAG, 'Document picker already active, ignoring duplicate invocation');
      return { success: false, cancelled: true };
    }

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
          'application/vnd.comicbook-rar',
          'application/x-mobipocket-ebook',
          'application/vnd.amazon.ebook',
          'application/x-mobi8-ebook',
          'image/vnd.djvu',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/rtf',
          'application/vnd.oasis.opendocument.text',
          'application/vnd.ms-htmlhelp',
          'application/zip',
          'application/x-rar-compressed',
          '*/*', // Universal fallback for Android content providers
        ],
        copyToCacheDirectory: true,
        // Must be explicit: this legacy API defaults base64 to TRUE, which
        // makes the native picker base64-encode the entire picked file before
        // any JS runs. Nothing here uses `asset.base64`, so on a large comic or
        // PDF that is tens of megabytes of dead string on the JS heap.
        base64: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        logger.info(TAG, 'Document picker cancelled');
        return { success: false, cancelled: true };
      }

      const asset = result.assets[0];
      return await this.importFile(asset.uri, asset.name, asset.size);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        msg.includes('Different document picking in progress') ||
        msg.includes('Await other document picking')
      ) {
        logger.warn(TAG, 'Concurrent document picker request gracefully suppressed');
        return { success: false, cancelled: true };
      }
      logger.error(TAG, 'Failed during document picker flow', err);
      const appErr =
        err instanceof AppError
          ? err
          : new ImportFailureError(
              'Selected file',
              (err as Error).message || 'Unable to import this file.'
            );
      return { success: false, error: appErr };
    } finally {
      this.releaseLock();
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

      // 1. Initial format check by extension
      let formatInfo = getFormatFromExtension(fileName);
      let preliminaryFormat: BookFormat | undefined = formatInfo.supported ? (formatInfo.id as BookFormat) : undefined;

      if (fileSizeHint !== undefined && fileSizeHint > MAX_IMPORT_BYTES) {
        throw new ImportFailureError(
          fileName,
          'This file is too large to import safely. Choose a file smaller than 512 MB.'
        );
      }

      // 2. Check for duplicate by filename and size if already in library
      const existingBooks = await repo.getBooks();
      const cleanFileName = fileName.replace(/\.[^/.]+$/, '').toLowerCase();
      const normFileName = cleanFileName.replace(/[^a-z0-9]/g, '');
      const duplicate = existingBooks.find(
        (b) => {
          if (preliminaryFormat && b.format !== preliminaryFormat) return false;
          const bTitle = b.title.toLowerCase();
          const normTitle = bTitle.replace(/[^a-z0-9]/g, '');
          return (
            bTitle === cleanFileName ||
            (normFileName.length > 3 && normTitle.includes(normFileName)) ||
            (normTitle.length > 3 && normFileName.includes(normTitle)) ||
            (fileSizeHint && b.fileSize === fileSizeHint && b.fileSize > 0)
          );
        }
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

      try {
        if (fileSize > MAX_IMPORT_BYTES) {
          throw new ImportFailureError(
            fileName,
            'This file is too large to import safely. Choose a file smaller than 512 MB.'
          );
        }

        // Verify format via magic bytes from the copied file to prevent false routing (e.g. DOCX -> EPUB)
        let resolvedFormat = preliminaryFormat;
        try {
          const sampleBase64 = await FileSystem.readAsStringAsync(destPath, {
            encoding: FileSystem.EncodingType.Base64,
            length: 2048,
          });
          if (sampleBase64) {
            const binaryString = atob(sampleBase64);
            const rawBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              rawBytes[i] = binaryString.charCodeAt(i);
            }
            const detected = FormatDetector.fromMagicBytes(rawBytes, fileName);
            if (detected.supported) {
              resolvedFormat = detected.id as BookFormat;
            }
          }
        } catch {
          // If sample read fails, fallback to preliminary format
        }

        if (!resolvedFormat) {
          throw new UnsupportedFormatError(
            fileName.split('.').pop() || 'unknown',
            'This document format is not supported.'
          );
        }

        const format = resolvedFormat;

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
          uri: sourceUri,
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
      } catch (innerErr) {
        // Clean up copied file so a failed import does not leave orphaned files on disk
        await fileStorage.deleteBookFiles(destPath);
        throw innerErr;
      }
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
