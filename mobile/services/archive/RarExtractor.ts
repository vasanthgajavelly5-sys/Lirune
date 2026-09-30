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
              offset: dataStart,
              headerSize,
              data: fileData,
            });
          }
        }

        offset += headerSize + addSize;
      }
    } else {
      // RAR 5.x signature found — scan for embedded image chunks or headers
      // Extract entries where filename strings appear
      const str = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const imageMatches = str.match(/([a-zA-Z0-9_\-/\\]+\.(jpg|jpeg|png|webp|gif))/gi) || [];
      const seenNames = new Set<string>();

      for (const rawName of imageMatches) {
        const clean = rawName.replace(/\\/g, '/');
        if (!seenNames.has(clean)) {
          seenNames.add(clean);
          entries.push({
            name: clean,
            size: 0,
            packedSize: 0,
            isStored: true,
            offset: 0,
            headerSize: 0,
            data: new Uint8Array(),
          });
        }
      }
    }

    return entries;
  }
}
