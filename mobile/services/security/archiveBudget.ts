export interface ArchiveEntryBudget {
  name: string;
  compressedSize?: number;
  uncompressedSize?: number;
}

export const MAX_ARCHIVE_ENTRIES = 2000;
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_ARCHIVE_COMPRESSION_RATIO = 100;

export function validateArchiveBudget(entries: ArchiveEntryBudget[]): void {
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error('The archive contains too many entries to open safely.');
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    const uncompressed = entry.uncompressedSize ?? 0;
    const compressed = entry.compressedSize ?? 0;
    if (uncompressed > MAX_ARCHIVE_ENTRY_BYTES) {
      throw new Error(`Archive entry is too large to open safely: ${entry.name}`);
    }
    if (compressed > 0 && uncompressed / compressed > MAX_ARCHIVE_COMPRESSION_RATIO) {
      throw new Error(`Archive compression ratio is unsafe: ${entry.name}`);
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error('The archive expands beyond the safe size limit.');
    }
  }
}
