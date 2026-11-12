/**
 * Lirune Reader Mobile — ZIP Container Inspection Service
 * Allows users to inspect .zip archives and selectively import supported books inside.
 */

import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { Book, BookFormat, getFormatFromExtension } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { ImportService } from './ImportService';
import { logger } from '@/utils/logger';

const TAG = 'ZipInspectionService';

export interface ZipBookEntry {
  id: string;
  internalPath: string;
  name: string;
  format: BookFormat;
  size: number;
  selected: boolean;
}

export class ZipInspectionService {
  /**
   * Inspects a ZIP file and returns all supported book files inside it.
   * Does NOT extract file contents into memory upfront.
   */
  static async inspectZip(zipUri: string): Promise<ZipBookEntry[]> {
    try {
      logger.info(TAG, `Inspecting ZIP archive: ${zipUri}`);
      const base64 = await fileStorage.readAsBase64(zipUri);
      const zip = await JSZip.loadAsync(base64, { base64: true });

      const entries: ZipBookEntry[] = [];

      for (const [entryPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;

        // Skip macOS metadata and hidden files
        if (entryPath.includes('__MACOSX') || entryPath.split('/').some((seg) => seg.startsWith('.'))) {
          continue;
        }

        const fileName = entryPath.split('/').pop() || entryPath;
        const formatInfo = getFormatFromExtension(fileName);

        // Only include officially supported book formats
        if (formatInfo.supported && formatInfo.id !== 'unknown') {
          // If the entry itself is an image, ignore it (it's not an independent book)
          const ext = fileName.split('.').pop()?.toLowerCase();
          if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext || '')) {
            continue;
          }

          const rawData: any = (entry as any)._data;
          const uncompressedSize = rawData?.uncompressedSize || 0;

          entries.push({
            id: entryPath,
            internalPath: entryPath,
            name: fileName,
            format: formatInfo.id as BookFormat,
            size: uncompressedSize,
            selected: true, // Default to selected
          });
        }
      }

      logger.info(TAG, `Found ${entries.length} supported books inside ZIP`);
      return entries;
    } catch (err) {
      logger.error(TAG, `Failed to inspect ZIP: ${zipUri}`, err);
      throw new Error('Unable to read this ZIP archive.');
    }
  }

  /**
   * Extracts ONLY the user-selected entries and imports them into Lirune.
   */
  static async importSelectedEntries(
    zipUri: string,
    selectedEntries: ZipBookEntry[],
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<Book[]> {
    const importedBooks: Book[] = [];
    if (selectedEntries.length === 0) return importedBooks;

    try {
      const base64 = await fileStorage.readAsBase64(zipUri);
      const zip = await JSZip.loadAsync(base64, { base64: true });

      const tempDir = `${FileSystem.cacheDirectory || ''}zip_extracted/`;
      const tempDirInfo = await FileSystem.getInfoAsync(tempDir);
      if (!tempDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
      }

      for (let i = 0; i < selectedEntries.length; i++) {
        const item = selectedEntries[i];
        if (onProgress) {
          onProgress(i + 1, selectedEntries.length, item.name);
        }

        const entry = zip.file(item.internalPath);
        if (!entry) continue;

        const entryBase64 = await entry.async('base64');
        const tempFilePath = `${tempDir}${Date.now()}_${item.name.replace(/[^\w.-]/g, '_')}`;

        await FileSystem.writeAsStringAsync(tempFilePath, entryBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        try {
          const res = await ImportService.importFile(tempFilePath, item.name, item.size);
          if (res.success && res.book) {
            importedBooks.push(res.book);
          }
        } finally {
          // Clean up temp file
          await FileSystem.deleteAsync(tempFilePath, { idempotent: true });
        }
      }
    } catch (err) {
      logger.error(TAG, 'Error during selective ZIP import', err);
      throw err;
    }

    return importedBooks;
  }
}
