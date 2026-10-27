/**
 * Lirune Reader Mobile — EPUB Package Cache
 *
 * Caches parsed OPF packages (spine, manifest, TOC, titles, logical chapters)
 * keyed by `bookId:fileSize:mtime:version`. Eliminates container/OPF/NCX/nav
 * parsing overhead on book open.
 */

import type { EpubPackage, EpubManifestItem } from './package.ts';

export const PACKAGE_CACHE_VERSION = 1;

export interface SerializedEpubPackage extends Omit<EpubPackage, 'manifest'> {
  manifest: [string, EpubManifestItem][];
  cachedAt: number;
  version: number;
}

export interface PackageCacheIdentity {
  id: string;
  fileSize?: number;
  mtime?: number;
}

/**
 * Derives a deterministic cache key from book identity, size, modification time, and parser version.
 * Any change to size, mtime, or parser pipeline version instantly invalidates the cache.
 */
export function getPackageCacheKey(
  book: PackageCacheIdentity,
  version = PACKAGE_CACHE_VERSION
): string {
  const id = book.id || 'unknown';
  const size = book.fileSize ?? 0;
  const mtime = book.mtime ?? 0;
  return `${id}:${size}:${mtime}:v${version}`;
}

/**
 * Serializes an in-memory EpubPackage into a JSON-serializable structure.
 */
export function serializeEpubPackage(pkg: EpubPackage): SerializedEpubPackage {
  return {
    ...pkg,
    manifest: Array.from(pkg.manifest.entries()),
    cachedAt: Date.now(),
    version: PACKAGE_CACHE_VERSION,
  };
}

/**
 * Deserializes a stored JSON package structure back into an EpubPackage with Maps intact.
 */
export function deserializeEpubPackage(serialized: SerializedEpubPackage): EpubPackage {
  return {
    opfPath: serialized.opfPath,
    opfDir: serialized.opfDir,
    manifest: new Map<string, EpubManifestItem>(serialized.manifest),
    spine: serialized.spine,
    toc: serialized.toc,
    chapterTitles: serialized.chapterTitles,
    logicalChapters: serialized.logicalChapters,
    publicationTitle: serialized.publicationTitle,
    coverPath: serialized.coverPath,
    metadata: serialized.metadata,
  };
}

/**
 * PackageCacheManager: Provides in-memory LRU caching and optional persistent store hook.
 */
export class PackageCacheManager {
  private memoryCache = new Map<string, EpubPackage>();
  private readonly maxMemoryItems = 20;

  get(key: string): EpubPackage | null {
    if (!key) return null;
    const item = this.memoryCache.get(key);
    if (item) {
      // Re-insert to refresh LRU order
      this.memoryCache.delete(key);
      this.memoryCache.set(key, item);
      return item;
    }
    return null;
  }

  set(key: string, pkg: EpubPackage): void {
    if (!key || !pkg) return;
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    } else if (this.memoryCache.size >= this.maxMemoryItems) {
      // Evict oldest entry
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(key, pkg);
  }

  has(key: string): boolean {
    return this.memoryCache.has(key);
  }

  clear(): void {
    this.memoryCache.clear();
  }

  get size(): number {
    return this.memoryCache.size;
  }
}

export const packageCache = new PackageCacheManager();
