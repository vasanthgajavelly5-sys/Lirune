/**
 * Lirune Reader Mobile — Native Storage & Discovery Bridge
 * Interfaces with the native LiruneStorageModule on Android for MediaStore queries,
 * high-performance filesystem traversals, SAF tree scanning, BookSession handles,
 * and custom in-app folder browsing.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { BookFormat } from '@/models/Book';
import { FormatDetector } from '@/services/discovery/FormatDetector';
import { logger } from '@/utils/logger';

const TAG = 'NativeStorageBridge';

const { LiruneStorage } = NativeModules;

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
  format: BookFormat | null;
  folderName: string;
  mimeType?: string;
}

export interface FullScanOptions {
  extensions?: string[];
  maxDepth?: number;
  maxResults?: number;
  timeBudgetMs?: number;
  minBytes?: number;
  treeUri?: string;
  localPath?: string;
}

export interface ScanProgress {
  found: number;
  currentDir: string;
}

export interface ScanBatchEntry {
  docId: string;
  uri: string;
  parentDocId: string | null;
  name: string;
  size: number;
  mtime: number;
  sniffFormat: string;
  confidence: number;
  quickFp: string;
  state: string;
  failReason: string | null;
  path?: string;
}

export interface StorageVolume {
  id: string;
  label: string;
  isRemovable: boolean;
  freeBytes: number;
  totalBytes: number;
  isPrimary: boolean;
  path: string | null;
}

export interface NativeDirEntry {
  docId: string;
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  mimeType: string | null;
  format: string | null;
  uri: string;
}

export interface NativeSniffResult {
  format: string;
  confidence: number;
  reason: string;
  isDrm: boolean;
  drmReason: string | null;
  quickFp: string | null;
  kind: 'book' | 'container' | 'blocked';
  needsPassword?: boolean;
}

export interface NativeIngestResult {
  bookId: string;
  sha256: string;
  size: number;
  mode: 'managed' | 'linked';
  pathOrUri: string;
  title: string;
  author: string | null;
  format: string;
  isDuplicate: boolean;
}

export interface BookSessionHandle {
  handleId: string;
  size: number;
  seekable: boolean;
}

export const LIRUNE_SCAN_PROGRESS_EVENT = 'LiruneScanProgress';

const eventEmitter = Platform.OS === 'android' && LiruneStorage ? new NativeEventEmitter(LiruneStorage) : null;

export const nativeStorage = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!LiruneStorage;
  },

  // ==========================================
  // Permissions & Volumes
  // ==========================================

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

  async getStorageVolumes(): Promise<StorageVolume[]> {
    if (!this.isAvailable()) return [];
    try {
      const res = await LiruneStorage.getStorageVolumes();
      return Array.isArray(res) ? res : [];
    } catch (err) {
      logger.warn(TAG, 'getStorageVolumes failed', err);
      return [];
    }
  },

  async buildInitialPickerIntent(volumeId?: string, hint?: string): Promise<string> {
    if (!this.isAvailable()) return '';
    try {
      return await LiruneStorage.buildInitialPickerIntent(volumeId ?? null, hint ?? null);
    } catch (err) {
      logger.warn(TAG, 'buildInitialPickerIntent failed', err);
      return '';
    }
  },

  // ==========================================
  // SAF Grants
  // ==========================================

  async validatePersistedGrants(knownUris: string[]): Promise<{ validUris: string[]; revokedUris: string[] }> {
    if (!this.isAvailable()) return { validUris: knownUris, revokedUris: [] };
    try {
      return await LiruneStorage.validatePersistedGrants(knownUris);
    } catch (err) {
      logger.warn(TAG, 'validatePersistedGrants failed', err);
      return { validUris: knownUris, revokedUris: [] };
    }
  },

  async takePersistableGrant(treeUri: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.takePersistableGrant(treeUri);
    } catch (err) {
      logger.warn(TAG, 'takePersistableGrant failed', err);
      return false;
    }
  },

  async releasePersistableGrant(treeUri: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.releasePersistableGrant(treeUri);
    } catch (err) {
      logger.warn(TAG, 'releasePersistableGrant failed', err);
      return false;
    }
  },

  async pruneGrantsIfNeeded(lruUris: string[] = []): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.pruneGrantsIfNeeded(lruUris);
    } catch (err) {
      logger.warn(TAG, 'pruneGrantsIfNeeded failed', err);
      return false;
    }
  },

  async observeDirectory(treeUri: string, docId?: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.observeDirectory(treeUri, docId ?? null);
    } catch {
      return false;
    }
  },

  async stopObserving(treeUri: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.stopObserving(treeUri);
    } catch {
      return false;
    }
  },

  // ==========================================
  // Streaming Queue Scanner
  // ==========================================

  async startScan(options: { treeUri?: string; localPath?: string; maxDepth?: number }): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.startScan(options);
    } catch (err) {
      logger.warn(TAG, 'startScan failed', err);
      return false;
    }
  },

  async cancelScan(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.cancelScan();
    } catch (err) {
      logger.warn(TAG, 'cancelScan failed', err);
      return false;
    }
  },

  // ==========================================
  // Format Sniffing & Ingestion
  // ==========================================

  async sniffFile(uriOrPath: string, fallbackFilename?: string): Promise<NativeSniffResult | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiruneStorage.sniffFile(uriOrPath, fallbackFilename ?? null);
    } catch (err) {
      logger.warn(TAG, 'sniffFile failed', err);
      return null;
    }
  },

  async ingestFile(options: {
    uri: string;
    mode?: 'managed' | 'linked';
    name: string;
    format: string;
    existingSha256List?: string[];
    jobId?: number;
  }): Promise<NativeIngestResult | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiruneStorage.ingestFile(options);
    } catch (err) {
      logger.warn(TAG, 'ingestFile failed', err);
      return null;
    }
  },

  // ==========================================
  // BookSession & Local Resource Server
  // ==========================================

  async openBookSession(pathOrUri: string): Promise<BookSessionHandle | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiruneStorage.openBookSession(pathOrUri);
    } catch (err) {
      logger.warn(TAG, 'openBookSession failed', err);
      return null;
    }
  },

  async readBookSession(handleId: string, offset: number, length: number): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiruneStorage.readBookSession(handleId, offset, length);
    } catch (err) {
      logger.warn(TAG, 'readBookSession failed', err);
      return null;
    }
  },

  async closeBookSession(handleId: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.closeBookSession(handleId);
    } catch {
      return false;
    }
  },

  async getResourceServerUrl(handleId: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiruneStorage.getResourceServerUrl(handleId);
    } catch (err) {
      logger.warn(TAG, 'getResourceServerUrl failed', err);
      return null;
    }
  },

  // ==========================================
  // In-App Directory Browsing (Workstream C)
  // ==========================================

  async listDirectory(
    treeUri: string,
    docId?: string,
    options: { batchSize?: number; backend?: 'saf' | 'allFiles' } = {}
  ): Promise<{ requestId: string }> {
    if (!this.isAvailable()) return { requestId: '' };
    try {
      return await LiruneStorage.listDirectory(treeUri, docId ?? null, options);
    } catch (err) {
      logger.warn(TAG, 'listDirectory failed', err);
      return { requestId: '' };
    }
  },

  async cancelListing(requestId: string): Promise<boolean> {
    if (!this.isAvailable() || !requestId) return false;
    try {
      return await LiruneStorage.cancelListing(requestId);
    } catch {
      return false;
    }
  },

  async getDocumentInfo(treeUri: string, docId?: string): Promise<NativeDirEntry | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiruneStorage.getDocumentInfo(treeUri, docId ?? null);
    } catch (err) {
      logger.warn(TAG, 'getDocumentInfo failed', err);
      return null;
    }
  },

  async getParentChain(treeUri: string, docId?: string): Promise<{ docId: string; name: string }[]> {
    if (!this.isAvailable()) return [];
    try {
      const res = await LiruneStorage.getParentChain(treeUri, docId ?? null);
      return Array.isArray(res) ? res : [];
    } catch (err) {
      logger.warn(TAG, 'getParentChain failed', err);
      return [];
    }
  },

  // ==========================================
  // Event Subscriptions
  // ==========================================

  onScanBatch(listener: (payload: { entries: ScanBatchEntry[] }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onScanBatch', listener);
    return () => sub.remove();
  },

  onScanProgress(listener: (progress: ScanProgress) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onScanProgress', listener);
    const legacySub = eventEmitter.addListener(LIRUNE_SCAN_PROGRESS_EVENT, listener);
    return () => {
      sub.remove();
      legacySub.remove();
    };
  },

  onScanDone(listener: (payload: { total: number; durationMs: number }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onScanDone', listener);
    return () => sub.remove();
  },

  onScanCancelled(listener: () => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onScanCancelled', listener);
    return () => sub.remove();
  },

  onScanError(listener: (payload: { error: string }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onScanError', listener);
    return () => sub.remove();
  },

  onImportProgress(listener: (payload: { jobId: number; bytesCopied: number }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onImportProgress', listener);
    return () => sub.remove();
  },

  onDirBatch(listener: (payload: { requestId: string; entries: NativeDirEntry[] }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onDirBatch', listener);
    return () => sub.remove();
  },

  onDirDone(listener: (payload: { requestId: string; total: number }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onDirDone', listener);
    return () => sub.remove();
  },

  onDirError(listener: (payload: { requestId: string; error: string }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onDirError', listener);
    return () => sub.remove();
  },

  onDirectoryChanged(listener: (payload: { treeUri: string; docId: string | null }) => void): () => void {
    if (!eventEmitter) return () => undefined;
    const sub = eventEmitter.addListener('onDirectoryChanged', listener);
    return () => sub.remove();
  },

  // ==========================================
  // Legacy Methods
  // ==========================================

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

  async sniff(uri: string, fileName?: string): Promise<NativeSniffResult> {
    if (this.isAvailable() && typeof LiruneStorage.sniff === 'function') {
      try {
        return await LiruneStorage.sniff(uri, fileName ?? null);
      } catch (err) {
        logger.warn(TAG, `NativeStorage.sniff failed for ${uri}`, err);
      }
    }
    // Fallback using FormatDetector
    const ext = (fileName || uri).split('.').pop()?.toLowerCase() || '';
    const isBlocked = ['apk', 'jar', 'aab', 'xapk', 'apks', 'dex', 'exe', 'class', 'arsc', 'so', 'dll'].includes(ext);
    const isZip = ext === 'zip';
    const detected = FormatDetector.fromFilename(fileName || uri);
    return {
      format: isBlocked ? 'unknown' : detected.id,
      confidence: isBlocked ? 0 : 0.8,
      reason: isBlocked ? 'Blocked application package' : 'Identified by extension',
      isDrm: false,
      drmReason: null,
      quickFp: null,
      kind: isBlocked ? 'blocked' : isZip ? 'container' : 'book',
      needsPassword: false,
    };
  },

  async clearCurrentIntent(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneStorage.clearCurrentIntent();
    } catch {
      return false;
    }
  },
};
