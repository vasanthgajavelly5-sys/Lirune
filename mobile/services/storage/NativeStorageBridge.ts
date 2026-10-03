/**
 * Lirune Reader Mobile — Native Storage & Discovery Bridge
 * Interfaces with the native LiruneStorageModule on Android for MediaStore queries,
 * high-performance filesystem traversals, and SAF tree scanning.
 */

import { NativeModules, Platform } from 'react-native';
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
  format: BookFormat;
  folderName: string;
  mimeType?: string;
}

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
};
