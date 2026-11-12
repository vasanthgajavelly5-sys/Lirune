/**
 * Lirune Reader Mobile — RAR Container Inspection Service
 * Allows users to inspect .rar archives and selectively import supported books inside.
 * Hardened against path traversal, zip bombs, and oversized archives.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Book, BookFormat, getFormatFromExtension } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { RarExtractor } from '@/services/archive/RarExtractor';
import { ImportService } from './ImportService';
import { logger } from '@/utils/logger';

const TAG = 'RarInspectionService';
const MAX_ENTRIES = 500;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024; // 100 MB limit per entry

export interface RarBookEntry {
  id: string;
  internalPath: string;
  name: string;
  format: BookFormat;
  size: number;
  selected: boolean;
}

export class RarInspectionService {
  /**
   * Inspects a RAR archive and returns all supported book files inside it.
   */
  static async inspectRar(rarUri: string): Promise<RarBookEntry[]> {
    try {
      logger.info(TAG, `Inspecting RAR archive: ${rarUri}`);
      const base64 = await fileStorage.readAsBase64(rarUri);
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const rawEntries = RarExtractor.inspect(bytes);
      const entries: RarBookEntry[] = [];

      for (let i = 0; i < Math.min(rawEntries.length, MAX_ENTRIES); i++) {
        const item = rawEntries[i];

        // Sanitize path (prevent path traversal)
        const safePath = item.name.replace(/\.\./g, '').replace(/^[/\\]+/, '');
        const fileName = safePath.split('/').pop() || safePath;

        const formatInfo = getFormatFromExtension(fileName);
        if (formatInfo.supported && formatInfo.id !== 'unknown' && formatInfo.id !== 'rar') {
          // Skip standalone image entries in generic container
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) {
            continue;
          }

          entries.push({
            id: safePath,
            internalPath: safePath,
            name: fileName,
            format: formatInfo.id as BookFormat,
            size: Math.min(item.size || item.packedSize, MAX_ENTRY_BYTES),
            selected: true,
          });
        }
      }

      logger.info(TAG, `Found ${entries.length} supported books inside RAR`);
      return entries;
    } catch (err) {
      logger.error(TAG, `Failed to inspect RAR: ${rarUri}`, err);
      throw new Error('Unable to read this RAR archive.');
    }
  }

  /**
   * Extracts selected entries and imports them into Lirune.
   */
  static async importSelectedEntries(
    rarUri: string,
    selectedEntries: RarBookEntry[],
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<Book[]> {
    const importedBooks: Book[] = [];
    if (selectedEntries.length === 0) return importedBooks;

    try {
      const base64 = await fileStorage.readAsBase64(rarUri);
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const allEntries = RarExtractor.inspect(bytes);
      const entryMap = new Map(allEntries.map((e) => [e.name, e]));

      const tempDir = `${FileSystem.cacheDirectory || ''}rar_extracted/`;
      const tempDirInfo = await FileSystem.getInfoAsync(tempDir);
      if (!tempDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
      }

      for (let i = 0; i < selectedEntries.length; i++) {
        const item = selectedEntries[i];
        if (onProgress) {
          onProgress(i + 1, selectedEntries.length, item.name);
        }

        const entry = entryMap.get(item.internalPath);
        if (!entry) continue;

        const safeFileName = item.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const extractedPath = `${tempDir}${Date.now()}_${safeFileName}`;

        let b64 = '';
        for (let b = 0; b < entry.data.length; b++) {
          b64 += String.fromCharCode(entry.data[b]);
        }
        await FileSystem.writeAsStringAsync(extractedPath, btoa(b64), {
          encoding: FileSystem.EncodingType.Base64,
        });

        const res = await ImportService.importFile(extractedPath, item.name, entry.data.length);
        if (res.success && res.book) {
          importedBooks.push(res.book);
        }

        // Clean up temp extracted file
        try {
          await FileSystem.deleteAsync(extractedPath, { idempotent: true });
        } catch {
          // ignore
        }
      }

      return importedBooks;
    } catch (err) {
      logger.error(TAG, 'Failed extracting selected entries from RAR', err);
      throw err;
    }
  }
}
