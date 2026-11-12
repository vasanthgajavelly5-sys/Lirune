/**
 * Lirune Reader Mobile — TXT chunk index
 *
 * The reader never holds a whole TXT file in memory. It streams the file in
 * fixed-size windows, recording only the byte offset at which each chunk starts,
 * and then reads back just the window covering the visible chunk.
 *
 * The cut points are computed in CHARACTERS but stored as BYTES, because a
 * window is a byte range. Re-encoding the exact prefix gives the byte length, so
 * a cut can never land inside a multi-byte character (CJK, emoji) even when the
 * text has no spaces or newlines to break on.
 */

/** Target size of one chunk, in characters. */
export const TARGET_CHUNK_CHARS = 4000;
/** How much of the file is pulled into memory at a time. */
export const WINDOW_BYTES = 128 * 1024;
/** How far past the target we look for a nicer paragraph break. */
export const NEWLINE_LOOKAHEAD = 300;
export const SPACE_LOOKAHEAD = 150;

/**
 * Index of the first entry in `sorted` that is strictly greater than `value`.
 * Returns `sorted.length` when every entry is <= value.
 */
export function upperBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Given a decoded window starting at `bytePos`, appends the byte offset of every
 * additional chunk boundary found inside that window to `offsets`.
 *
 * The caller is responsible for advancing `bytePos` by exactly the number of
 * bytes the window decoded to (see `byteLengthOf`), which is what guarantees
 * each window starts on a character boundary.
 */
export function appendChunkCuts(
  window: string,
  bytePos: number,
  offsets: number[],
  encoder: { encode(input: string): { length: number } } = new TextEncoder()
): void {
  let charPos = 0;
  for (;;) {
    let cut = charPos + TARGET_CHUNK_CHARS;
    if (cut >= window.length) break;

    const newline = window.indexOf('\n', cut);
    if (newline !== -1 && newline - cut < NEWLINE_LOOKAHEAD) {
      cut = newline + 1;
    } else {
      const space = window.indexOf(' ', cut);
      if (space !== -1 && space - cut < SPACE_LOOKAHEAD) {
        cut = space + 1;
      }
    }

    offsets.push(bytePos + encoder.encode(window.slice(0, cut)).length);
    charPos = cut;
  }
}

/** Byte length of a decoded string. */
export function byteLengthOf(
  text: string,
  encoder: { encode(input: string): { length: number } } = new TextEncoder()
): number {
  return encoder.encode(text).length;
}

/**
 * Removes trailing U+FFFD replacement characters from a decoded window.
 *
 * A window is a BYTE range, so it can end part-way through a multi-byte
 * character. The decoder then emits U+FFFD for the incomplete tail. Keeping it
 * would corrupt the text, and re-encoding it yields fewer bytes than were read,
 * which would make the recorded offsets drift away from the real file.
 *
 * Dropping it is safe: the byte length of the cleaned window is the true offset
 * of the last complete character, so the next window simply re-reads the
 * remainder.
 */
export function stripTrailingPartialChar(text: string): string {
  if (!text.endsWith('\uFFFD')) return text;
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 0xfffd) end--;
  return end === text.length ? text : text.slice(0, end);
}

/**
 * Maps a byte offset in the file to the index of the chunk containing it.
 */
export function chunkIndexForByteOffset(offsets: number[], byteOffset: number): number {
  return Math.max(0, upperBound(offsets, byteOffset) - 1);
}
