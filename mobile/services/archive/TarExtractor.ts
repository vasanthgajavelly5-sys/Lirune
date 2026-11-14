/**
 * Lirune Reader Mobile — Pure TypeScript TAR Archive Extractor
 * Parses POSIX/ustar 512-byte block TAR archives to extract comic page images for CBT reader.
 * Zero dependencies — works identically in Electron renderer and React Native JS context.
 *
 * Security:
 * - Entry count limit to prevent decompression-bomb-style exhaustion.
 * - Entry size limit for individual entries.
 * - Path traversal protection: entries with leading '/' or '..' segments are skipped.
 * - Total expanded-size limit to prevent memory exhaustion.
 */

const TAR_BLOCK_SIZE = 512;
const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024; // 100 MB per entry
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB total expanded

export interface TarEntry {
  name: string;
  size: number;
  /** Raw bytes of this entry's payload */
  data: Uint8Array;
}

function readOctal(bytes: Uint8Array, offset: number, length: number): number {
  let s = '';
  for (let i = offset; i < offset + length; i++) {
    const c = bytes[i];
    if (c === 0 || c === 0x20) break; // NUL or space terminates
    s += String.fromCharCode(c);
  }
  return parseInt(s.trim() || '0', 8) || 0;
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = Math.min(offset + length, bytes.length);
  while (end < limit && bytes[end] !== 0) end++;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset, end));
}

function isSafePath(name: string): boolean {
  if (!name || name.trim() === '') return false;
  if (name.startsWith('/') || name.startsWith('\\')) return false;
  const parts = name.replace(/\\/g, '/').split('/');
  if (parts.some(p => p === '..')) return false;
  return true;
}

export class TarExtractor {
  /**
   * Verifies whether a buffer has a valid TAR/ustar header.
   */
  static isTar(buffer: ArrayBuffer | Uint8Array): boolean {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 512) return false;
    const magic = String.fromCharCode(...bytes.subarray(257, 262));
    if (magic === 'ustar') return true;
    const checksum = readOctal(bytes, 148, 8);
    if (checksum > 0) {
      let sum = 0;
      for (let i = 0; i < 512; i++) {
        sum += (i >= 148 && i < 156) ? 0x20 : bytes[i];
      }
      return sum === checksum;
    }
    return false;
  }

  /**
   * Parses a TAR buffer and returns all file entries.
   * @throws Error if the buffer is not a valid TAR archive or limits are exceeded.
   */
  static extract(buffer: ArrayBuffer | Uint8Array): TarEntry[] {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (!TarExtractor.isTar(bytes)) return [];
    const entries: TarEntry[] = [];
    let offset = 0;
    let totalBytes = 0;
    let entryCount = 0;

    while (offset + TAR_BLOCK_SIZE <= bytes.length) {
      const header = bytes.subarray(offset, offset + TAR_BLOCK_SIZE);

      // End-of-archive: two consecutive all-zero blocks
      if (header.every(b => b === 0)) break;

      const name = readString(header, 0, 100);
      const prefix = readString(header, 345, 155);
      const fullName = prefix ? `${prefix}/${name}` : name;

      const typeFlag = String.fromCharCode(header[156]);
      const size = readOctal(header, 124, 12);

      offset += TAR_BLOCK_SIZE;

      // Skip directories and special entries
      if (typeFlag === '5' || typeFlag === 'x' || typeFlag === 'g' || !fullName.trim()) {
        // Advance past data blocks (size may be non-zero for PAX headers)
        offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        continue;
      }

      // Safety checks
      if (entryCount >= MAX_ENTRIES) {
        throw new Error(`TAR archive exceeds maximum entry count (${MAX_ENTRIES})`);
      }
      if (size > MAX_ENTRY_BYTES) {
        // Skip oversized entries
        offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        continue;
      }
      if (totalBytes + size > MAX_TOTAL_BYTES) {
        throw new Error('TAR archive total expanded size exceeds the safety limit');
      }

      if (isSafePath(fullName)) {
        const dataEnd = Math.min(offset + size, bytes.length);
        const data = bytes.slice(offset, dataEnd);
        entries.push({ name: fullName, size, data });
        totalBytes += size;
        entryCount++;
      }

      offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    }

    return entries;
  }

  /**
   * Returns only image entries from a TAR, sorted by filename for page ordering.
   */
  static imageEntries(buffer: ArrayBuffer | Uint8Array): TarEntry[] {
    const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']);
    const all = TarExtractor.extract(buffer);
    return all
      .filter(e => {
        const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
        return IMAGE_EXTS.has(ext);
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }
}
