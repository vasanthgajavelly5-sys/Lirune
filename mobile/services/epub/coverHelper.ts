/**
 * Shared EPUB cover-resolution and duplicate-cover detection helpers.
 *
 * Extracted from EpubReaderView so cover-page heuristics and fallback data-URI
 * wrapping stay cleanly unit-testable without mounting a WebView.
 */

import { toPlainText } from './markup.ts';
import type { EpubArchive } from './archive.ts';

export interface CoverChapterMeta {
  title?: string;
  body: string;
}

export interface CoverSpineMeta {
  id: string;
  itemPath: string;
  title?: string;
}

/** True when a chapter already depicts a standalone cover page. */
export function hasStandaloneCoverContent(chapter: CoverChapterMeta, chapterIndex: number): boolean {
  if (chapterIndex !== 0) return false;
  return (
    chapter.body.includes('data-cover') ||
    chapter.body.includes('epub-cover') ||
    (/<(?:img|image)\b/i.test(chapter.body) && toPlainText(chapter.body).length < 500)
  );
}

/** True when the first spine entry metadata identifies a cover section. */
export function firstChapterMatchesCover(firstChapter: CoverSpineMeta | undefined): boolean {
  if (!firstChapter) return false;
  return (
    /\bcover\b/i.test(firstChapter.id) ||
    /\bcover\b/i.test(firstChapter.itemPath) ||
    /\bcover\b/i.test(firstChapter.title || '')
  );
}

export function wrapCoverImageHtml(dataUri: string): string {
  return `<div class="epub-cover-container"><img src="${dataUri}" alt="Cover" data-cover="true" style="max-width:100%;max-height:100%;object-fit:contain;margin:auto;display:block;" /></div>`;
}

/**
 * Resolves cover HTML once per book open, skipping if chapter 0 already contains
 * a cover page so we never double-render covers and exhaust GPU tile memory.
 */
export async function resolveInitialCoverHtml(opts: {
  initialIdx: number;
  initialChapter: CoverChapterMeta;
  loadedChapters: CoverSpineMeta[];
  archiveCoverPath?: string | null;
  bookCoverUrl?: string | null;
  archive: Pick<EpubArchive, 'dataUri'>;
  readCoverBase64: (path: string) => Promise<string | null | undefined>;
  onError?: (err: unknown) => void;
}): Promise<string | undefined> {
  if (
    hasStandaloneCoverContent(opts.initialChapter, opts.initialIdx) ||
    firstChapterMatchesCover(opts.loadedChapters[0])
  ) {
    return undefined;
  }

  if (opts.archiveCoverPath) {
    const coverUri = await opts.archive.dataUri(opts.archiveCoverPath);
    if (coverUri) return wrapCoverImageHtml(coverUri);
  }

  if (opts.bookCoverUrl) {
    try {
      const b64 = await opts.readCoverBase64(opts.bookCoverUrl);
      if (b64) {
        const ext = opts.bookCoverUrl.split('.').pop()?.toLowerCase() || 'jpeg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return wrapCoverImageHtml(`data:${mime};base64,${b64}`);
      }
    } catch (err) {
      opts.onError?.(err);
    }
  }

  return undefined;
}
