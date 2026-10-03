/**
 * Lirune Reader Mobile — lazy metadata for discovered files
 *
 * The Files screen used to list whatever name a file had on disk, which for books
 * already imported meant the app's own UUID copy (`0f8a…-book.epub`) and for
 * everything else meant a download artefact like `book (1).epub`. A title and an
 * author are worth two ZIP entries, but reading them for every row on every scan
 * is not: the OPF is fetched lazily, at most a few at a time, and cached.
 *
 * Only `file://` sources are inspected (that is what the full-storage scan
 * returns). `content://` sources cannot be range-read from JS, so they fall back
 * to a cleaned file name rather than copying the book into memory.
 */

import type { BookFormat } from '@/models/Book';
import { nativeStorage } from '@/services/storage/NativeStorageBridge';
import { decodeXmlText, parseOpfMetadata } from '@/services/epub/package';
import { cleanTitleFromFilename } from '@/services/metadata/MetadataExtractor';
import { logger } from '@/utils/logger';

const TAG = 'DiscoveryMetadata';

/** Never read more than this for a container or an OPF. */
const MAX_CONTAINER_BYTES = 64 * 1024;
const MAX_OPF_BYTES = 1024 * 1024;

/** How many rows may be inspected at once. Disk is the bottleneck, not JS. */
const MAX_CONCURRENT = 3;

export interface DiscoveryTarget {
  id: string;
  /** `file://` path when the native scan produced one. */
  uri: string;
  /** Plain filesystem path, required for the ZIP reads. */
  path?: string;
  name: string;
  size: number;
  format: BookFormat | null;
}

export interface DiscoveryInfo {
  title: string;
  author?: string;
  /** True when the title came from the book rather than from its file name. */
  fromMetadata: boolean;
}

/** `uri|size` identifies the bytes; the same file can be renamed between scans. */
const cache = new Map<string, DiscoveryInfo>();
const inFlight = new Map<string, Promise<DiscoveryInfo>>();

function cacheKey(target: DiscoveryTarget): string {
  return `${target.uri}|${target.size}`;
}

function localPathOf(target: DiscoveryTarget): string | null {
  if (target.path) return target.path;
  if (target.uri.startsWith('file://')) return decodeURIComponent(target.uri.slice('file://'.length));
  return null;
}

/** `<rootfile full-path="…">` out of META-INF/container.xml. */
function parseRootfilePath(containerXml: string): string | null {
  const match = /<rootfile\b[^>]*full-path\s*=\s*["']([^"']+)["']/i.exec(containerXml);
  return match ? decodeXmlText(match[1]).trim() : null;
}

async function inspectEpub(path: string): Promise<DiscoveryInfo | null> {
  const container = await nativeStorage.readZipEntryText(path, 'META-INF/container.xml', MAX_CONTAINER_BYTES);
  if (!container) return null;
  const opfPath = parseRootfilePath(container);
  if (!opfPath) return null;
  const opf = await nativeStorage.readZipEntryText(path, opfPath, MAX_OPF_BYTES);
  if (!opf) return null;

  const metadata = parseOpfMetadata(opf, opfPath);
  const title = metadata.title.trim();
  if (!title) return null;
  const author = metadata.authors.length > 0 ? metadata.authors.join(', ') : undefined;
  return { title, author, fromMetadata: true };
}

/**
 * Best-effort title and author for a discovered file.
 *
 * Never throws and never copies the publication: an unreadable archive resolves to
 * its cleaned file name.
 */
export async function peek(target: DiscoveryTarget): Promise<DiscoveryInfo> {
  const key = cacheKey(target);
  const cached = cache.get(key);
  if (cached) return cached;

  const running = inFlight.get(key);
  if (running) return running;

  const work = (async (): Promise<DiscoveryInfo> => {
    const fallback: DiscoveryInfo = {
      title: cleanTitleFromFilename(target.name),
      fromMetadata: false,
    };

    const path = localPathOf(target);
    if (!path || target.format !== 'epub') {
      cache.set(key, fallback);
      return fallback;
    }

    try {
      const info = await inspectEpub(path);
      const result = info || fallback;
      cache.set(key, result);
      return result;
    } catch (err) {
      logger.warn(TAG, `Metadata peek failed for ${target.name}`, err);
      cache.set(key, fallback);
      return fallback;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, work);
  return work;
}

/** Runs `peek` over `targets`, at most MAX_CONCURRENT at a time, reporting each result. */
export async function peekMany(
  targets: DiscoveryTarget[],
  onResult: (target: DiscoveryTarget, info: DiscoveryInfo) => void
): Promise<void> {
  const queue = [...targets];
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, async () => {
    for (;;) {
      const target = queue.shift();
      if (!target) return;
      onResult(target, await peek(target));
    }
  });
  await Promise.all(workers);
}

/** Test seam: drops everything the screen has cached so far. */
export function clearCache(): void {
  cache.clear();
  inFlight.clear();
}
