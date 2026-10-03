/**
 * Lirune Reader Mobile — duplicate detection
 *
 * The previous rule compared the imported *file name* against the book's *title*.
 * That is wrong in both directions: a renamed copy of a book gets imported again
 * (the metadata title almost never equals the file name), and two different books
 * that happen to share a file name are silently skipped.
 *
 * The rule implemented here needs two independent signals before it will call
 * something a duplicate:
 *
 *   - the same format, and
 *   - the same size, and
 *   - either the same normalised source file name, or the same normalised
 *     title + first author.
 *
 * Size is the cheap discriminator that makes both cases correct, and it is
 * recorded on import so it is available later without re-reading the file.
 */

import type { Book } from '../../models/Book.ts';

export interface DuplicateCandidate {
  format: string;
  /** File name of the candidate, when it is known. */
  fileName?: string;
  /** Byte size of the candidate, when it is known. */
  size?: number;
  /** Title of the candidate, when it is known. */
  title?: string;
  author?: string;
}

/** Lowercased, accent-folded, punctuation-free form used for every comparison. */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeFileName(fileName: string): string {
  return normalizeForMatch(fileName.replace(/\.[^/.]+$/, ''));
}

/** Metadata stored on import so a later scan can recognise the same file. */
export interface SourceFingerprint {
  sourceFileName?: string;
  sourceFileSize?: number;
}

export function readFingerprint(book: Pick<Book, 'metadata' | 'fileSize'>): SourceFingerprint {
  const metadata = (book.metadata || {}) as Record<string, unknown>;
  const sourceFileName = typeof metadata.sourceFileName === 'string' ? metadata.sourceFileName : undefined;
  const sourceFileSize = typeof metadata.sourceFileSize === 'number' ? metadata.sourceFileSize : undefined;
  return {
    sourceFileName,
    sourceFileSize: sourceFileSize ?? (book.fileSize > 0 ? book.fileSize : undefined),
  };
}

/** True when `candidate` is the same file as something already in the library. */
export function isDuplicateOf(candidate: DuplicateCandidate, book: Book): boolean {
  if (candidate.format !== book.format) return false;

  const fingerprint = readFingerprint(book);
  const candidateSize = candidate.size && candidate.size > 0 ? candidate.size : undefined;
  const existingSize = fingerprint.sourceFileSize;

  // Size has to agree whenever both sides know it. Two books of the same format
  // and the same name but different sizes are two books.
  if (candidateSize !== undefined && existingSize !== undefined && candidateSize !== existingSize) {
    return false;
  }
  // Without a size on either side there is nothing to corroborate a match, and a
  // name-only comparison is exactly the bug this replaces.
  if (candidateSize === undefined || existingSize === undefined) return false;

  const candidateFile = candidate.fileName ? normalizeFileName(candidate.fileName) : '';
  const existingFile = fingerprint.sourceFileName ? normalizeFileName(fingerprint.sourceFileName) : '';
  if (candidateFile && existingFile && candidateFile === existingFile) return true;

  const candidateTitle = normalizeForMatch(candidate.title || candidate.fileName || '');
  const candidateAuthor = normalizeForMatch(candidate.author || '');
  const existingTitle = normalizeForMatch(book.title || '');
  const existingAuthor = normalizeForMatch(book.author || '');
  if (!candidateTitle || !existingTitle || candidateTitle !== existingTitle) return false;
  // Titles collide ("Collected Poems"); an author that disagrees rules it out.
  return candidateAuthor === '' || existingAuthor === '' || candidateAuthor === existingAuthor;
}

/** Convenience wrapper for scanning a whole library. */
export function findDuplicate(candidate: DuplicateCandidate, books: Book[]): Book | undefined {
  return books.find((book) => isDuplicateOf(candidate, book));
}
