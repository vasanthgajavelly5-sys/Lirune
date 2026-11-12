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

        if (rec0.length >= 88) {
          firstImageIndex = rec0View.getUint32(84, false);
        }

        if (rec0.length >= 88) {
          const fullNameOffset = rec0View.getUint32(84 - 16, false); // offset 84 relative to MOBI header
          const fullNameLength = rec0View.getUint32(88 - 16, false);
          if (fullNameOffset + fullNameLength <= rec0.length) {
            title = new TextDecoder('utf-8', { fatal: false }).decode(
              rec0.subarray(fullNameOffset, fullNameOffset + fullNameLength)
            ).trim() || title;
          }
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
    const textChunks: string[] = [];
    const textDecoder = new TextDecoder(encoding, { fatal: false });

    for (let r = 1; r <= textRecordCount && r < recordOffsets.length; r++) {
      const start = recordOffsets[r];
      const end = r + 1 < recordOffsets.length ? recordOffsets[r + 1] : buffer.length;
      const recData = buffer.subarray(start, end);

      if (compression === 1) {
        // No compression
        textChunks.push(textDecoder.decode(recData));
      } else if (compression === 2) {
        // PalmDOC LZ77
        const decompressed = this.decompressPalmDoc(recData);
        textChunks.push(textDecoder.decode(decompressed));
      } else {
        // Fallback for HUFF/CDIC or unknown: decode raw text
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
          const next = data[i++];
          const distance = ((b & 0x3F) << 3) | (next >> 5);
          const length = (next & 0x07) + 3;
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
