/**
 * Lirune Reader Mobile — Pure TypeScript RAR Archive & CBR Extractor
 * Reads RAR4 and RAR5 archive directory entries, unpacks stored files,
 * and provides inspection and extraction for CBR comic reader and RAR containers.
 */

export interface RarEntry {
  name: string;
  size: number;
  packedSize: number;
  isStored: boolean;
  /** True when the entry uses compression (methods 0x31-0x35). Data is NOT raw image bytes. */
  isCompressed: boolean;
  /** Raw RAR4 compression method byte (0x30 = store, 0x31-0x35 = compressed). */
  compressionMethod: number;
  offset: number;
  headerSize: number;
  data: Uint8Array;
}

export class RarExtractor {
  /**
   * Inspects a RAR buffer and returns all file entries.
   */
  static inspect(bytes: Uint8Array): RarEntry[] {
    if (bytes.length < 7) {
      throw new Error('Invalid RAR archive: file too small.');
    }

    // Check RAR4 or RAR5 signature
    const isRar = bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1A && bytes[5] === 0x07;
    if (!isRar) {
      throw new Error('Invalid RAR signature: not a valid RAR archive.');
    }

    const entries: RarEntry[] = [];
    const isRar5 = bytes[6] === 0x01;

    if (!isRar5) {
      // RAR 4.x Parser
      let offset = 7;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      while (offset + 7 < bytes.length) {
        // Each block has: CRC (2), Type (1), Flags (2), Size (2)
        const headerType = bytes[offset + 2];
        const headerFlags = view.getUint16(offset + 3, true);
        const headerSize = view.getUint16(offset + 5, true);

        if (headerSize < 7) break;

        let addSize = 0;
        if (headerFlags & 0x8000) {
          // Has DATA (addSize)
          if (offset + 11 <= bytes.length) {
            addSize = view.getUint32(offset + 7, true);
          }
        }

        if (headerType === 0x74) {
          // File header
          if (offset + 32 <= bytes.length) {
            const packedSize = view.getUint32(offset + 7, true);
            const unpackedSize = view.getUint32(offset + 11, true);
            const method = bytes[offset + 25];
            const nameSize = view.getUint16(offset + 26, true);

            const nameStart = offset + 32;
            const nameEnd = Math.min(bytes.length, nameStart + nameSize);
            const nameBytes = bytes.subarray(nameStart, nameEnd);
            const name = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes).replace(/\\/g, '/');

            const dataStart = offset + headerSize;
            const dataEnd = Math.min(bytes.length, dataStart + packedSize);
            const fileData = bytes.subarray(dataStart, dataEnd);

            entries.push({
              name,
              size: unpackedSize,
              packedSize,
              isStored: method === 0x30,
              isCompressed: method !== 0x30,
              compressionMethod: method,
              offset: dataStart,
              headerSize,
              data: fileData,
            });
          }
        }

        const advance = headerSize + addSize;
        if (advance <= 0) break;
        offset += advance;
      }
    } else {
      // RAR 5.x Parser (supports stored/uncompressed entries)
      let offset = 8; // skip 8-byte RAR5 magic (Rar!\x1a\x07\x01\x00)
      function readVint(): number {
        let val = 0;
        let shift = 0;
        while (offset < bytes.length) {
          const b = bytes[offset++];
          val += (b & 0x7f) * Math.pow(2, shift);
          shift += 7;
          if ((b & 0x80) === 0) break;
        }
        return val;
      }

      while (offset + 4 < bytes.length) {
        // Each block in RAR5 starts with 4-byte CRC32
        offset += 4;
        const headerSize = readVint();
        const headerDataStart = offset;
        const headerType = readVint();
        const flags = readVint();

        let extraSize = 0;
        if (flags & 0x0001) extraSize = readVint();
        let dataSize = 0;
        if (flags & 0x0002) dataSize = readVint();

        if (headerType === 2) {
          // File header
          const fileFlags = readVint();
          const unpackedSize = readVint();
          const fileAttrs = readVint();
          if (fileFlags & 0x0002) {
            // mtime
            offset += 4;
          }
          if (fileFlags & 0x0004) {
            // crc32
            offset += 4;
          }
          const compInfo = readVint();
          const method = (compInfo >> 7) & 0x07; // 0 = store
          const hostOS = readVint();
          const nameLen = readVint();
          const nameBytes = bytes.subarray(offset, Math.min(bytes.length, offset + nameLen));
          const name = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes).replace(/\\/g, '/');
          offset += nameLen;

          // Advance to end of header
          offset = headerDataStart + headerSize;
          const dataStart = offset;
          const dataEnd = Math.min(bytes.length, dataStart + dataSize);
          const fileData = bytes.subarray(dataStart, dataEnd);
          offset += dataSize;

          entries.push({
            name,
            size: unpackedSize,
            packedSize: dataSize,
            isStored: method === 0,
            isCompressed: method !== 0,
            compressionMethod: method,
            offset: dataStart,
            headerSize,
            data: fileData,
          });
        } else {
          // Advance past header + any data block
          offset = headerDataStart + headerSize + dataSize;
        }
      }

      if (entries.length === 0) {
        throw new Error('Unsupported archive format: RAR5 compressed or empty archive is not supported. Only uncompressed (stored) archives are supported.');
      }
    }

    return entries;
  }

  /**
   * Returns true only when the entry data is uncompressed (stored) and safe to use directly as
   * image bytes. Compressed RAR4 entries (methods 0x31-0x35) require a decompressor which is
   * not available in this pure-TypeScript build.
   */
  static canExtract(entry: RarEntry): boolean {
    return entry.isStored === true;
  }
}
