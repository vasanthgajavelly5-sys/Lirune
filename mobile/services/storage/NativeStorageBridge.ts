/**
 * Lirune Reader Mobile — Native Storage & Discovery Bridge
 * Interfaces with the native LiruneStorageModule on Android for MediaStore queries,
 * high-performance filesystem traversals, and SAF tree scanning.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { BookFormat } from '@/models/Book';
import { logger } from '@/utils/logger';

const TAG = 'NativeStorageBridge';

const { LiruneStorage } = NativeModules;

// A missing module is the single most common reason Scan Phone silently returns
// nothing: `expo prebuild --clean` regenerates `android/` and drops the Kotlin
// sources unless the config plugin re-installs them. Say so once, loudly.
if (Platform.OS === 'android' && !LiruneStorage) {
  logger.error(
    TAG,
    'LiruneStorage native module is missing from this build — run `npx expo prebuild` so plugins/withLiruneStorage.js can restore it'
  );
}

export interface DiscoveredNativeFile {
  id: string;
  uri: string;
  path?: string;
  name: string;
  size: number;
  /** Null when the source does not resolve the format (native full-storage scan). */
  format: BookFormat | null;
  folderName: string;
  mimeType?: string;
}

export interface FullScanOptions {
  /** Extension allow-list. Omit for the default book formats. */
  extensions?: string[];
  maxDepth?: number;
  maxResults?: number;
  timeBudgetMs?: number;
  minBytes?: number;
}

export interface ScanProgress {
  found: number;
  currentDir: string;
}

export const LIRUNE_SCAN_PROGRESS_EVENT = 'LiruneScanProgress';

export const nativeStorage = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!LiruneStorage;
  },

  async hasAllFilesAccess(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.hasAllFilesAccess();
    } catch (err) {
      logger.warn(TAG, 'hasAllFilesAccess check failed', err);
      return false;
    }
  },

  async requestAllFilesAccess(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.requestAllFilesAccess();
    } catch (err) {
      logger.warn(TAG, 'requestAllFilesAccess failed', err);
      return false;
    }
  },

  async hasStoragePermission(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.hasStoragePermission();
    } catch (err) {
      logger.warn(TAG, 'hasStoragePermission check failed', err);
      return false;
    }
  },

  async scanMediaStore(): Promise<DiscoveredNativeFile[]> {
    if (!this.isAvailable()) return [];
    try {
      const items = await LiruneStorage.scanMediaStore();
      return Array.isArray(items) ? items : [];
    } catch (err) {
      logger.warn(TAG, 'scanMediaStore failed', err);
      return [];
    }
  },

  async scanDirectories(paths: string[], maxDepth = 5): Promise<DiscoveredNativeFile[]> {
    if (!this.isAvailable()) return [];
    try {
      const items = await LiruneStorage.scanDirectories(paths, maxDepth);
      return Array.isArray(items) ? items : [];
    } catch (err) {
      logger.warn(TAG, 'scanDirectories failed', err);
      return [];
    }
  },

  async scanSafTree(treeUri: string, maxDepth = 5): Promise<DiscoveredNativeFile[]> {
    if (!this.isAvailable()) return [];
    try {
      const items = await LiruneStorage.scanSafTree(treeUri, maxDepth);
      return Array.isArray(items) ? items : [];
    } catch (err) {
      logger.warn(TAG, 'scanSafTree failed', err);
      return [];
    }
  },

  /**
   * Walks every readable volume for book files.
   *
   * Requires All files access: MediaStore does not index EPUBs or PDFs, and the
   * SAF picker cannot hand out the storage root or the Download folder, so this
   * is the only way to see a library the user keeps there.
   */
  async scanAllStorage(options: FullScanOptions = {}): Promise<DiscoveredNativeFile[]> {
    if (!this.isAvailable()) return [];
    try {
      const items = await LiruneStorage.scanAllStorage(options);
      return Array.isArray(items) ? items : [];
    } catch (err) {
      logger.warn(TAG, 'scanAllStorage failed', err);
      return [];
    }
  },

  /** Stops an in-flight `scanAllStorage`. */
  async cancelScan(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.cancelScan();
    } catch (err) {
      logger.warn(TAG, 'cancelScan failed', err);
      return false;
    }
  },

  /** Subscribes to native scan progress; returns an unsubscribe function. */
  onScanProgress(listener: (progress: ScanProgress) => void): () => void {
    if (!this.isAvailable()) return () => undefined;
    const emitter = new NativeEventEmitter(LiruneStorage);
    const subscription = emitter.addListener(LIRUNE_SCAN_PROGRESS_EVENT, listener);
    return () => subscription.remove();
  },

  /**
   * Reads one entry of a ZIP container as text, streaming from disk.
   *
   * Used to read an EPUB's `META-INF/container.xml` and its OPF for discovery
   * without loading the whole publication into JS. `file://` paths only.
   */
  async readZipEntryText(path: string, entryPath: string, maxBytes = 1024 * 1024): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiruneStorage.readZipEntryText(path, entryPath, maxBytes);
    } catch (err) {
      logger.warn(TAG, `readZipEntryText failed for ${entryPath}`, err);
      return null;
    }
  },

  async copyContentUriToStorage(sourceUri: string, destPath: string): Promise<number | null> {
    if (!this.isAvailable()) return null;
    try {
      const bytes = await LiruneStorage.copyContentUriToStorage(sourceUri, destPath);
      return typeof bytes === 'number' ? bytes : null;
    } catch (err) {
      logger.warn(TAG, `copyContentUriToStorage failed for ${sourceUri}`, err);
      return null;
    }
  },

  /**
   * Resets MainActivity's launch intent to standard launcher so app relaunches don't re-trigger it.
   */
  async clearCurrentIntent(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.clearCurrentIntent();
    } catch {
      return false;
    }
  },
};
