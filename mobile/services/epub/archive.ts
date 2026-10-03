/**
 * Lirune Reader Mobile — per-book EPUB archive session
 *
 * A `EpubArchive` owns everything derived from one open publication: the JSZip
 * instance, a normalized entry index, and the base64 data-URI cache used for
 * images, fonts and CSS resources.
 *
 * Two rules make this safe across books:
 * 1. One instance per reader session. Nothing is stored in a module-level
 *    singleton, so opening book B can never observe book A's ZIP, index or
 *    cached bytes. `dispose()` drops all of it.
 * 2. Every cache is bounded. An image-heavy EPUB must not grow the heap
 *    without limit, so the data-URI cache evicts least-recently-used entries once
 *    the byte budget is exceeded.
 *
 * The lookup index replaces the `Object.values(zip.files).find(...)` fallback
 * that used to run on every chapter load, every image and every stylesheet. For
 * a 400-entry archive that scan ran ~400 comparisons per lookup; the Map makes
 * it one hash probe.
 */

import JSZip from 'jszip';
import { normalizeEntryPath } from './zipPaths.ts';

/** MIME types the reader can embed as a data URI. */
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  css: 'text/css',
  otc: 'font/otc',
};

export function mimeTypeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[ext] || 'application/octet-stream';
}

/** Anything larger than this is refused rather than pasted into a chapter string. */
export const MAX_EMBEDDABLE_ASSET_BYTES = 24 * 1024 * 1024;

export interface EpubArchiveOptions {
  /** Total base64 bytes retained by the data-URI cache. */
  maxCacheBytes?: number;
  /** Number of raw zip entries inspected, used by the archive budget guard. */
  maxEntries?: number;
}

interface CacheEntry {
  uri: string;
  bytes: number;
  /** Monotonic tick of last use, for LRU eviction. */
  used: number;
}

export class EpubArchive {
  entryCount = 0;

  private zip: JSZip | null;
  /** Exact normalized path → entry. Preserves case-sensitive EPUB semantics. */
  private readonly exactIndex = new Map<string, JSZip.JSZipObject>();
  /** Lower-cased path → entry, first writer wins so distinct files never collide. */
  private readonly foldedIndex = new Map<string, JSZip.JSZipObject>();
  /**
   * Lower-cased file name → entries.
   *
   * Real books ship chapters whose relative paths simply do not resolve: a
   * chapter in `OEBPS/text/` referencing `images/cover.jpg` when the images live
   * in `OEBPS/images/`. A unique file-name match recovers those books without
   * reintroducing an O(n) scan over every entry.
   */
  private readonly basenameIndex = new Map<string, JSZip.JSZipObject[]>();
  private readonly textCache = new Map<string, string>();
  private readonly uriCache = new Map<string, CacheEntry>();

  private cacheBytes = 0;
  private clock = 0;
  private maxCacheBytes = 24 * 1024 * 1024;

  private constructor(zip: JSZip) {
    this.zip = zip;
  }

  static async open(
    source: ArrayBuffer | Uint8Array,
    options: EpubArchiveOptions = {}
  ): Promise<EpubArchive> {
    const zip = await JSZip.loadAsync(source);
    const archive = new EpubArchive(zip);
    archive.maxCacheBytes = options.maxCacheBytes ?? 24 * 1024 * 1024;
    archive.buildIndex(options.maxEntries);
    return archive;
  }

  private buildIndex(maxEntries?: number): void {
    const entries = Object.values(this.zip!.files);
    if (maxEntries && entries.length > maxEntries) {
      throw new Error(`EPUB archive contains ${entries.length} entries (limit ${maxEntries}).`);
    }
    for (const entry of entries) {
      if (entry.dir) continue;
      const key = normalizeEntryPath(entry.name);
      if (!key) continue;
      this.exactIndex.set(key, entry);
      const folded = key.toLowerCase();
      if (!this.foldedIndex.has(folded)) this.foldedIndex.set(folded, entry);
      const base = folded.slice(folded.lastIndexOf('/') + 1);
      if (base) {
        const bucket = this.basenameIndex.get(base);
        if (bucket) bucket.push(entry);
        else this.basenameIndex.set(base, [entry]);
      }
    }
    this.entryCount = this.exactIndex.size;
  }

  /** Every non-directory entry name in the archive, normalized. */
  entryNames(): string[] {
    return [...this.exactIndex.keys()];
  }

/**
 * Resolves an archive path to its ZIP entry:
 *   1. exact normalized path,
 *   2. one case-folded pass, for publishers whose manifests disagree with their
 *      own file names,
 *   3. a unique file-name match, for books whose relative paths are broken.
 *
 * Step 3 only fires when the file name is unambiguous, so two genuinely distinct
 * resources can never be substituted for one another.
 */
  file(path: string): JSZip.JSZipObject | null {
    if (!path) return null;
    const key = normalizeEntryPath(path);
    const exact = this.exactIndex.get(key);
    if (exact) return exact;
    const folded = key.toLowerCase();
    const caseInsensitive = this.foldedIndex.get(folded);
    if (caseInsensitive) return caseInsensitive;

    const base = folded.slice(folded.lastIndexOf('/') + 1);
    const bucket = base ? this.basenameIndex.get(base) : undefined;
    if (bucket && bucket.length === 1) return bucket[0];
    return null;
  }

  has(path: string): boolean {
    return this.file(path) !== null;
  }

  /** Uncompressed size in bytes when JSZip knows it, else undefined. */
  sizeOf(path: string): number | undefined {
    const entry = this.file(path);
    const data = (entry as unknown as { _data?: { uncompressedSize?: number } } | null)?._data;
    return data?.uncompressedSize;
  }

  /** Names + sizes for the archive budget guard. */
  budgetEntries(): { name: string; compressedSize?: number; uncompressedSize?: number }[] {
    return Object.values(this.zip!.files).map((entry) => {
      const data = (entry as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data;
      return {
        name: entry.name,
        compressedSize: data?.compressedSize,
        uncompressedSize: data?.uncompressedSize,
      };
    });
  }

  async readText(path: string): Promise<string | null> {
    const key = normalizeEntryPath(path);
    if (!key) return null;
    const cached = this.textCache.get(key);
    if (cached !== undefined) return cached;
    const entry = this.file(key);
    if (!entry) return null;
    try {
      const text = await entry.async('text');
      // Only cache small-ish documents; a 40 MB XHTML chapter is not re-read
      // often enough to be worth holding twice.
      if (text.length <= 2 * 1024 * 1024) this.textCache.set(key, text);
      return text;
    } catch {
      return null;
    }
  }

  /**
   * Returns the resource as a `data:` URI, reading + base64-encoding at most once
   * per archive session.
   */
  async dataUri(path: string): Promise<string | null> {
    const key = normalizeEntryPath(path);
    if (!key) return null;

    const cached = this.uriCache.get(key);
    if (cached) {
      cached.used = ++this.clock;
      return cached.uri;
    }

    const entry = this.file(key);
    if (!entry) return null;
    const declared = this.sizeOf(key);
    if (declared !== undefined && declared > MAX_EMBEDDABLE_ASSET_BYTES) return null;

    try {
      const base64 = await entry.async('base64');
      if (base64.length * 3 > MAX_EMBEDDABLE_ASSET_BYTES * 4) return null;
      const uri = `data:${mimeTypeForPath(key)};base64,${base64}`;
      this.storeUri(key, uri, base64.length);
      return uri;
    } catch {
      return null;
    }
  }

  private storeUri(key: string, uri: string, bytes: number): void {
    if (bytes > this.maxCacheBytes) return; // too big to be worth retaining
    this.uriCache.set(key, { uri, bytes, used: ++this.clock });
    this.cacheBytes += bytes;
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    if (this.cacheBytes <= this.maxCacheBytes) return;
    const victims = [...this.uriCache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of victims) {
      this.uriCache.delete(key);
      this.cacheBytes -= entry.bytes;
      if (this.cacheBytes <= this.maxCacheBytes * 0.8) break;
    }
  }

  /** Diagnostics for the QA harness. */
  stats(): {
    entries: number;
    cachedUris: number;
    cacheBytes: number;
    cachedTexts: number;
  } {
    return {
      entries: this.entryCount,
      cachedUris: this.uriCache.size,
      cacheBytes: this.cacheBytes,
      cachedTexts: this.textCache.size,
    };
  }

  /**
   * Drops every derived cache and releases the ZIP. Safe to call twice. The
   * reader calls it before opening a different book so a stale resolved path or
   * cached image can never cross a book boundary.
   */
  dispose(): void {
    this.exactIndex.clear();
    this.foldedIndex.clear();
    this.basenameIndex.clear();
    this.textCache.clear();
    this.uriCache.clear();
    this.entryCount = 0;
    this.cacheBytes = 0;
    this.clock = 0;
    this.zip = null;
  }

  get isDisposed(): boolean {
    return this.zip === null;
  }

  /** Internal accessor for the budget guard and tests. */
  rawZip(): JSZip {
    if (!this.zip) throw new Error('EPUB archive has been disposed.');
    return this.zip;
  }
}