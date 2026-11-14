/**
 * Lirune Reader Mobile — Pure TypeScript MOBI / PalmDOC / KF8 Parser
 * Parses PDB records, PalmDOC LZ77 compression, MOBI headers, and EXTH metadata.
 */

export interface MobiMetadata {
  title: string;
  author: string;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  language?: string;
  coverImage?: Uint8Array;
}

export interface ParsedMobi {
  metadata: MobiMetadata;
  html: string;
}

export class MobiParser {
  /**
   * Parses a MOBI / AZW / PalmDOC binary buffer.
   */
  static parse(buffer: Uint8Array): ParsedMobi {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // 1. PDB Header
    if (buffer.length < 78) {
      throw new Error('Invalid MOBI file: buffer too small for PDB header.');
    }

    const numRecords = view.getUint16(76, false);
    if (buffer.length < 78 + numRecords * 8) {
      throw new Error('Invalid MOBI file: truncated record index table.');
    }

    const recordOffsets: number[] = [];
    for (let i = 0; i < numRecords; i++) {
      recordOffsets.push(view.getUint32(78 + i * 8, false));
    }

    if (numRecords === 0) {
      throw new Error('MOBI archive contains 0 records.');
    }

    // 2. Record 0: PalmDOC and MOBI headers
    const rec0Offset = recordOffsets[0];
    const rec0End = recordOffsets.length > 1 ? recordOffsets[1] : buffer.length;
    const rec0 = buffer.subarray(rec0Offset, rec0End);
    const rec0View = new DataView(rec0.buffer, rec0.byteOffset, rec0.byteLength);

    const compression = rec0View.getUint16(0, false);
    const textRecordCount = rec0View.getUint16(8, false);
    const extraFlags = rec0.length >= 0xF4 ? rec0View.getUint16(0xF2, false) : 0;

    // Read MOBI header
    let title = 'Untitled MOBI';
    let author = 'Unknown Author';
    let description: string | undefined;
    let publisher: string | undefined;
    let encoding = 'utf-8';
    let firstImageIndex = -1;

    if (rec0.length >= 40) {
      const mobiMagic = String.fromCharCode(...rec0.subarray(16, 20));
      if (mobiMagic === 'MOBI') {
        const headerLength = rec0View.getUint32(20, false);
        const textEncoding = rec0View.getUint32(28, false);
        if (textEncoding === 1252) encoding = 'windows-1252';

        if (rec0.length >= 92) {
          const fullNameOffset = rec0View.getUint32(84, false); // byte 84 in rec0 (offset 68 of MOBI header)
          const fullNameLength = rec0View.getUint32(88, false); // byte 88 in rec0 (offset 72 of MOBI header)
          if (fullNameOffset + fullNameLength <= rec0.length) {
            title = new TextDecoder('utf-8', { fatal: false }).decode(
              rec0.subarray(fullNameOffset, fullNameOffset + fullNameLength)
            ).trim() || title;
          }
        }

        if (rec0.length >= 16 + 112) {
          firstImageIndex = rec0View.getUint32(16 + 108, false); // byte 124 in rec0 (offset 0x6C / 108 of MOBI header)
        }

        // Parse EXTH Header if present
        const exthOffset = 16 + headerLength;
        if (rec0.length >= exthOffset + 12) {
          const exthMagic = String.fromCharCode(...rec0.subarray(exthOffset, exthOffset + 4));
          if (exthMagic === 'EXTH') {
            const exthRecordCount = rec0View.getUint32(exthOffset + 8, false);
            let cur = exthOffset + 12;

            for (let i = 0; i < exthRecordCount && cur + 8 <= rec0.length; i++) {
              const recType = rec0View.getUint32(cur, false);
              const recLen = rec0View.getUint32(cur + 4, false);
              if (recLen < 8 || cur + recLen > rec0.length) break;

              const data = rec0.subarray(cur + 8, cur + recLen);
              const decoder = new TextDecoder('utf-8', { fatal: false });

              switch (recType) {
                case 100: // Author
                  author = decoder.decode(data).trim() || author;
                  break;
                case 101: // Publisher
                  publisher = decoder.decode(data).trim();
                  break;
                case 103: // Description
                  description = decoder.decode(data).trim();
                  break;
                case 503: // Updated title
                  title = decoder.decode(data).trim() || title;
                  break;
              }
              cur += recLen;
            }
          }
        }
      }
    }

    // 3. Decompress Text Records (Records 1 to textRecordCount)
    let huffReader: HuffReader | null = null;
    if (compression === 17480) {
      const huffRecordOffset = rec0.length >= 16 + 120 ? rec0View.getUint32(16 + 112, false) : 0;
      const huffRecordCount = rec0.length >= 16 + 124 ? rec0View.getUint32(16 + 116, false) : 0;
      if (huffRecordCount > 0 && huffRecordOffset < numRecords && huffRecordOffset + huffRecordCount <= numRecords) {
        const huffRecords: Uint8Array[] = [];
        for (let i = 0; i < huffRecordCount; i++) {
          const start = recordOffsets[huffRecordOffset + i];
          const end = huffRecordOffset + i + 1 < recordOffsets.length ? recordOffsets[huffRecordOffset + i + 1] : buffer.length;
          if (start < end && end <= buffer.length) {
            huffRecords.push(buffer.subarray(start, end));
          }
        }
        if (huffRecords.length > 0) {
          try {
            huffReader = new HuffReader(huffRecords);
          } catch {
            huffReader = null;
          }
        }
      }
    }

    const textChunks: string[] = [];
    const textDecoder = new TextDecoder(encoding, { fatal: false });

    for (let r = 1; r <= textRecordCount && r < recordOffsets.length; r++) {
      const start = recordOffsets[r];
      const end = r + 1 < recordOffsets.length ? recordOffsets[r + 1] : buffer.length;
      let recData = buffer.subarray(start, end);

      if (extraFlags && recData.length > 0) {
        const trailingSize = this.getSizeOfTrailingDataEntries(recData, recData.length, extraFlags);
        if (trailingSize > 0 && trailingSize < recData.length) {
          recData = recData.subarray(0, recData.length - trailingSize);
        }
      }

      if (compression === 1) {
        // No compression
        textChunks.push(textDecoder.decode(recData));
      } else if (compression === 2) {
        // PalmDOC LZ77
        const decompressed = this.decompressPalmDoc(recData);
        textChunks.push(textDecoder.decode(decompressed));
      } else if (compression === 17480 && huffReader) {
        // HUFF/CDIC decompression
        try {
          const decompressed = huffReader.unpack(recData);
          textChunks.push(textDecoder.decode(decompressed));
        } catch {
          textChunks.push(textDecoder.decode(recData));
        }
      } else {
        // Fallback for unknown: decode raw text
        textChunks.push(textDecoder.decode(recData));
      }
    }

    let fullHtml = textChunks.join('');
    if (!fullHtml.trim()) {
      fullHtml = '<p>Unable to extract readable text from this MOBI document.</p>';
    }

    // Extract cover image if firstImageIndex is valid
    let coverImage: Uint8Array | undefined;
    if (firstImageIndex > 0 && firstImageIndex < recordOffsets.length) {
      const imgStart = recordOffsets[firstImageIndex];
      const imgEnd = firstImageIndex + 1 < recordOffsets.length ? recordOffsets[firstImageIndex + 1] : buffer.length;
      const imgData = buffer.subarray(imgStart, imgEnd);
      // Verify image signature (JPEG or PNG)
      if (
        (imgData[0] === 0xFF && imgData[1] === 0xD8) ||
        (imgData[0] === 0x89 && imgData[1] === 0x50 && imgData[2] === 0x4E && imgData[3] === 0x47)
      ) {
        coverImage = imgData;
      }
    }

    return {
      metadata: {
        title,
        author,
        description,
        publisher,
        coverImage,
      },
      html: fullHtml,
    };
  }

  /**
   * Calculates size of trailing multibyte metadata entries appended to MOBI records.
   */
  private static getSizeOfTrailingDataEntries(
    ptr: Uint8Array,
    size: number,
    flags: number
  ): number {
    function getSizeOfTrailingDataEntry(p: Uint8Array, s: number): number {
      let bitpos = 0;
      let result = 0;
      if (s <= 0) return result;
      while (true) {
        const v = p[s - 1];
        result |= (v & 0x7f) << bitpos;
        bitpos += 7;
        s -= 1;
        if ((v & 0x80) !== 0 || bitpos >= 28 || s === 0) return result;
      }
    }

    let num = 0;
    let testflags = flags >> 1;
    while (testflags) {
      if (testflags & 1) {
        num += getSizeOfTrailingDataEntry(ptr, size - num);
      }
      testflags >>= 1;
    }
    if (flags & 1) {
      num += (ptr[size - num - 1] & 0x3) + 1;
    }
    return num;
  }

  /**
   * Decompresses PalmDOC LZ77 compressed byte stream.
   */
  private static decompressPalmDoc(data: Uint8Array): Uint8Array {
    const out: number[] = [];
    let i = 0;
    const len = data.length;

    while (i < len) {
      const b = data[i++];
      if (b === 0) {
        out.push(0);
      } else if (b >= 1 && b <= 8) {
        // Literal next b bytes
        for (let j = 0; j < b && i < len; j++) {
          out.push(data[i++]);
        }
      } else if (b <= 0x7F) {
        // Literal byte
        out.push(b);
      } else if (b <= 0xBF) {
        // Distance / length pair
        if (i < len) {
          const b2 = data[i++];
          const distance = (((b & 0x3F) << 8) | b2) >> 3;
          const length = (b2 & 0x07) + 3;
          const start = out.length - distance;
          for (let j = 0; j < length; j++) {
            if (start + j >= 0 && start + j < out.length) {
              out.push(out[start + j]);
            }
          }
        }
      } else {
        // Space + character (b ^ 0x80)
        out.push(32); // ' '
        out.push(b ^ 0x80);
      }
    }

    return new Uint8Array(out);
  }
}

class HuffReader {
  private dict1: { codeLength: number; terminal: boolean; maxCode: number }[] = [];
  private minCode: number[] = [0];
  private maxCode: number[] = [0];
  private dictionary: { bytes: Uint8Array; isReference: boolean }[] = [];

  constructor(records: Uint8Array[]) {
    if (!records.length) throw new Error('MOBI HUFF/CDIC records are missing.');
    this.loadHuff(records[0]);
    for (let i = 1; i < records.length; i++) this.loadCdic(records[i]);
    if (!this.dictionary.length) throw new Error('MOBI CDIC dictionary is empty.');
  }

  private loadHuff(bytes: Uint8Array) {
    if (bytes.length < 16) throw new Error('Invalid MOBI HUFF header.');
    const magic = String.fromCharCode(...bytes.subarray(0, 8));
    if (magic !== 'HUFF\x00\x00\x00\x18') throw new Error('Invalid MOBI HUFF header.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const off1 = view.getUint32(8, false);
    const off2 = view.getUint32(12, false);
    if (off1 + 256 * 4 > bytes.length || off2 + 64 * 4 > bytes.length) {
      throw new Error('Invalid MOBI HUFF table bounds.');
    }

    this.dict1 = [];
    for (let i = 0; i < 256; i++) {
      const value = view.getUint32(off1 + i * 4, false);
      const codeLength = value & 0x1f;
      if (!codeLength || codeLength > 32) throw new Error('Invalid MOBI HUFF code length.');
      const maxCode = (((value >>> 8) + 1) * (2 ** (32 - codeLength)) - 1) >>> 0;
      this.dict1.push({ codeLength, terminal: (value & 0x80) !== 0, maxCode });
    }

    this.minCode = [0];
    this.maxCode = [0];
    for (let length = 1; length <= 32; length++) {
      const min = view.getUint32(off2 + (length - 1) * 8, false);
      const max = view.getUint32(off2 + (length - 1) * 8 + 4, false);
      this.minCode.push((min * (2 ** (32 - length))) >>> 0);
      this.maxCode.push((((max + 1) * (2 ** (32 - length))) - 1) >>> 0);
    }
  }

  private loadCdic(bytes: Uint8Array) {
    if (bytes.length < 16) throw new Error('Invalid MOBI CDIC header.');
    const magic = String.fromCharCode(...bytes.subarray(0, 8));
    if (magic !== 'CDIC\x00\x00\x00\x10') throw new Error('Invalid MOBI CDIC header.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const phrases = view.getUint32(8, false);
    const bits = view.getUint32(12, false);
    if (bits > 20) throw new Error('Invalid MOBI CDIC dictionary size.');
    const count = Math.min(2 ** bits, phrases - this.dictionary.length);
    if (count < 0 || 16 + count * 2 > bytes.length) throw new Error('Invalid MOBI CDIC table bounds.');
    for (let i = 0; i < count; i++) {
      const offset = view.getUint16(16 + i * 2, false);
      const entry = 16 + offset;
      if (entry + 2 > bytes.length) throw new Error('Invalid MOBI CDIC entry.');
      const length = view.getUint16(entry, false);
      const end = entry + 2 + (length & 0x7fff);
      if (end > bytes.length) throw new Error('Invalid MOBI CDIC phrase bounds.');
      this.dictionary.push({
        bytes: bytes.subarray(entry + 2, end),
        isReference: (length & 0x8000) !== 0,
      });
    }
  }

  unpack(input: Uint8Array, depth = 0, state = { totalBytes: 0 }): Uint8Array {
    if (depth > 64) {
      throw new Error('MOBI HUFF/CDIC: recursion depth limit exceeded (possible circular reference).');
    }
    const data = new Uint8Array(input.length + 8);
    data.set(input);
    let bitPosition = 0;
    const output: Uint8Array[] = [];
    while (bitPosition < input.length * 8) {
      let code = 0;
      for (let i = 0; i < 32; i++) {
        const pos = bitPosition + i;
        code = (code * 2) + ((data[Math.floor(pos / 8)] >>> (7 - (pos % 8))) & 1);
      }
      code = code >>> 0;
      const first = this.dict1[code >>> 24];
      let codeLength = first.codeLength;
      let maxCode = first.maxCode;
      if (!first.terminal) {
        while (codeLength < 32 && code < this.minCode[codeLength]) codeLength++;
        maxCode = this.maxCode[codeLength];
      }
      if (!codeLength || bitPosition + codeLength > input.length * 8) break;
      const index = Math.floor(((maxCode - code) >>> 0) / (2 ** (32 - codeLength)));
      const entry = this.dictionary[index];
      if (!entry) throw new Error('MOBI HUFF code references a missing CDIC phrase.');
      bitPosition += codeLength;
      const chunk = entry.isReference ? this.unpack(entry.bytes, depth + 1, state) : entry.bytes;
      state.totalBytes += chunk.length;
      if (state.totalBytes > 64 * 1024 * 1024) {
        throw new Error('MOBI HUFF/CDIC: decompressed size limit exceeded (exceeds 64 MB).');
      }
      output.push(chunk);
    }
    const total = output.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of output) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
