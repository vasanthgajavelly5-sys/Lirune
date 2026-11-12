/**
 * Lirune Mobile — Thumbnail Utilities
 * Pure path calculation and cover URI resolution for library lists and book cards.
 */

export const THUMBNAIL_WIDTH = 400;

/**
 * Pure function: Computes the canonical thumbnail file path corresponding to an original cover path.
 * Retains directory structure and appends `_thumb.jpg`.
 */
export function getThumbnailPath(originalCoverPath?: string): string {
  if (!originalCoverPath || typeof originalCoverPath !== 'string') return '';
  const trimmed = originalCoverPath.trim();
  if (!trimmed) return '';

  // If it's already a thumbnail, return as-is
  if (trimmed.includes('_thumb.')) return trimmed;

  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx === -1) {
    return `${trimmed}_thumb.jpg`;
  }

  const base = trimmed.substring(0, dotIdx);
  return `${base}_thumb.jpg`;
}

/**
 * Resolves the optimal cover URI for library lists and grid cards.
 * Prefers the thumbnail if available, falling back to the original cover URL.
 */
export function getListCoverUri(book: { coverUrl?: string; thumbnailUrl?: string }): string | undefined {
  const candidate = book.thumbnailUrl || (book.coverUrl ? getThumbnailPath(book.coverUrl) : undefined) || book.coverUrl;
  if (!candidate) return undefined;
  if (
    candidate.startsWith('file://') ||
    candidate.startsWith('http://') ||
    candidate.startsWith('https://') ||
    candidate.startsWith('data:')
  ) {
    return candidate;
  }
  return `file://${candidate}`;
}
