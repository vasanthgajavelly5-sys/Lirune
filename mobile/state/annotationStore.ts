/**
 * Lirune Reader Mobile — Global Annotation State Store (Zustand)
 * Single authoritative store for bookmarks, highlights, and notes across all books.
 * Features:
 * - Single authoritative loading cycle
 * - Guard against concurrent / re-entrant loads
 * - Request sequence counter to discard stale async results
 * - Stable empty and populated states without flickering
 */

import { create } from 'zustand';
import { Book } from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { useLibraryStore } from '@/state/libraryStore';
import { logger } from '@/utils/logger';

const TAG = 'AnnotationStore';

export interface UnifiedAnnotation {
  id: string;
  type: 'highlight' | 'note' | 'bookmark';
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCoverColor: string;
  chapter?: string;
  text?: string;
  noteText?: string;
  color?: string;
  cfi: string;
  dateCreated: number;
}

interface AnnotationState {
  annotations: UnifiedAnnotation[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;

  // Actions
  loadAnnotations: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  removeAnnotation: (id: string, type: 'highlight' | 'note' | 'bookmark') => Promise<void>;
}

let inFlightLoadPromise: Promise<void> | null = null;
let loadRequestId = 0;

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  isLoading: false,
  hasLoaded: false,
  error: null,

  loadAnnotations: async (options?: { force?: boolean; silent?: boolean }) => {
    const state = get();

    // If a load is already in-flight, return the existing promise to prevent re-entrant calls
    if (inFlightLoadPromise) {
      return inFlightLoadPromise;
    }

    // If already loaded and not forcing, keep existing state without re-fetching
    if (state.hasLoaded && !options?.force) {
      return;
    }

    const currentReq = ++loadRequestId;

    // Only display full-screen loading spinner if data hasn't loaded yet
    if (!state.hasLoaded && !options?.silent) {
      set({ isLoading: true, error: null });
    }

    inFlightLoadPromise = (async () => {
      try {
        const libraryStore = useLibraryStore.getState();
        if (!libraryStore.hasLoaded) {
          await libraryStore.loadLibrary({ silent: true });
        }

        const currentBooks = useLibraryStore.getState().books;
        const bookMap = new Map<string, Book>();
        for (const b of currentBooks) {
          bookMap.set(b.id, b);
        }

        const repo = getBookRepository();
        const [allBookmarks, allHighlights, allNotes] = await Promise.all([
          repo.getAllBookmarks(),
          repo.getAllHighlights(),
          repo.getAllNotes(),
        ]);

        // Guard against stale async resolution
        if (currentReq !== loadRequestId) {
          logger.info(TAG, 'Discarding stale annotations load result');
          return;
        }

        const unified: UnifiedAnnotation[] = [];

        for (const bm of allBookmarks) {
          const book = bookMap.get(bm.bookId);
          unified.push({
            id: bm.id,
            type: 'bookmark',
            bookId: bm.bookId,
            bookTitle: book?.title || 'Unknown Book',
            bookAuthor: book?.author || 'Unknown Author',
            bookCoverColor: book?.coverColor || '#2C2D35',
            chapter: bm.chapter,
            text: bm.previewText,
            cfi: bm.cfi,
            dateCreated: bm.dateCreated,
          });
        }

        for (const hl of allHighlights) {
          const book = bookMap.get(hl.bookId);
          unified.push({
            id: hl.id,
            type: 'highlight',
            bookId: hl.bookId,
            bookTitle: book?.title || 'Unknown Book',
            bookAuthor: book?.author || 'Unknown Author',
            bookCoverColor: book?.coverColor || '#2C2D35',
            chapter: hl.chapter,
            text: hl.text,
            noteText: hl.note,
            color: hl.color,
            cfi: hl.cfiRange,
            dateCreated: hl.dateCreated,
          });
        }

        for (const nt of allNotes) {
          const book = bookMap.get(nt.bookId);
          unified.push({
            id: nt.id,
            type: 'note',
            bookId: nt.bookId,
            bookTitle: book?.title || 'Unknown Book',
            bookAuthor: book?.author || 'Unknown Author',
            bookCoverColor: book?.coverColor || '#2C2D35',
            chapter: nt.chapter,
            noteText: nt.text,
            cfi: nt.cfi,
            dateCreated: nt.dateCreated,
          });
        }

        // Sort descending by dateCreated by default
        unified.sort((a, b) => b.dateCreated - a.dateCreated);

        set({
          annotations: unified,
          isLoading: false,
          hasLoaded: true,
          error: null,
        });
      } catch (err: any) {
        if (currentReq === loadRequestId) {
          logger.error(TAG, 'Error loading global annotations', err);
          set({ isLoading: false, error: err?.message || 'Could not load annotations.' });
        }
      } finally {
        inFlightLoadPromise = null;
      }
    })();

    return inFlightLoadPromise;
  },

  removeAnnotation: async (id: string, type: 'highlight' | 'note' | 'bookmark') => {
    const repo = getBookRepository();
    try {
      if (type === 'bookmark') {
        await repo.removeBookmark(id);
      } else if (type === 'highlight') {
        await repo.removeHighlight(id);
      } else if (type === 'note') {
        await repo.removeNote(id);
      }
      set((state) => ({
        annotations: state.annotations.filter((a) => a.id !== id),
      }));
    } catch (err) {
      logger.error(TAG, `Failed deleting annotation ${id}`, err);
    }
  },
}));
