/**
 * Lirune Reader Mobile — Reader State Store (Zustand)
 */

import { create } from 'zustand';
import {
  Book,
  Bookmark,
  Highlight,
  Note,
  TOCItem,
  SearchResult,
} from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';
import { ProgressPersistenceQueue } from './progressPersistenceQueue';

const TAG = 'ReaderStore';
const progressQueue = new ProgressPersistenceQueue((progress) =>
  getBookRepository().updateReadingProgress(progress)
);

interface ReaderState {
  currentBook: Book | null;
  progressPercent: number;
  currentCfi: string | null;
  currentChapter: string;
  chapterCount: number;
  toc: TOCItem[];

  // Annotations
  bookmarks: Bookmark[];
  highlights: Highlight[];
  notes: Note[];

  // In-book search
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  activeMatchIndex: number;

  // UI visibility controls
  isControlsVisible: boolean;
  isTOCVisible: boolean;
  isSearchVisible: boolean;
  isSettingsVisible: boolean;
  isAnnotationsVisible: boolean;

  // Actions
  openBook: (book: Book) => Promise<void>;
  closeBook: () => Promise<void>;
  updateProgress: (progressPercent: number, cfi?: string, chapter?: string) => Promise<void>;
  toggleBookmark: () => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;
  addHighlight: (text: string, color: string, cfiRange: string, note?: string) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;
  addNote: (text: string, cfi: string, chapter?: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  setTOC: (toc: TOCItem[]) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setIsSearching: (isSearching: boolean) => void;
  setActiveMatchIndex: (index: number) => void;
  toggleControls: () => void;
  setControlsVisible: (visible: boolean) => void;
  setTOCVisible: (visible: boolean) => void;
  setSearchVisible: (visible: boolean) => void;
  setSettingsVisible: (visible: boolean) => void;
  setAnnotationsVisible: (visible: boolean) => void;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  currentBook: null,
  progressPercent: 0,
  currentCfi: null,
  currentChapter: 'Reading',
  chapterCount: 0,
  toc: [],

  bookmarks: [],
  highlights: [],
  notes: [],

  searchQuery: '',
  searchResults: [],
  isSearching: false,
  activeMatchIndex: 0,

  isControlsVisible: true,
  isTOCVisible: false,
  isSearchVisible: false,
  isSettingsVisible: false,
  isAnnotationsVisible: false,

  openBook: async (book: Book) => {
    logger.info(TAG, `Opening book: ${book.title}`);
    const repo = getBookRepository();

    const [bookmarks, highlights, notes, savedProgress] = await Promise.all([
      repo.getBookmarks(book.id),
      repo.getHighlights(book.id),
      repo.getNotes(book.id),
      repo.getReadingProgress(book.id),
    ]);

    set({
      currentBook: book,
      progressPercent: savedProgress?.progressPercent ?? book.progress ?? 0,
      currentCfi: savedProgress?.cfi ?? book.currentCfi ?? null,
      currentChapter: savedProgress?.chapter ?? book.currentChapter ?? 'Chapter 1',
      chapterCount: book.chapterCount || 1,
      toc: [],
      bookmarks,
      highlights,
      notes,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      isControlsVisible: false, // Default to clean immersion
      isTOCVisible: false,
      isSearchVisible: false,
      isSettingsVisible: false,
      isAnnotationsVisible: false,
    });
  },

  closeBook: async () => {
    const { currentBook, progressPercent, currentCfi, currentChapter } = get();
    if (currentBook) {
      const now = Date.now();
      await progressQueue.enqueue({
        bookId: currentBook.id,
        cfi: currentCfi || '',
        chapter: currentChapter,
        progressPercent,
        timeSpent: 0,
        lastRead: now,
      });
      await progressQueue.flush(currentBook.id);
    }

    set({
      currentBook: null,
      progressPercent: 0,
      currentCfi: null,
      currentChapter: '',
      toc: [],
      bookmarks: [],
      highlights: [],
      notes: [],
    });
  },

  updateProgress: async (progressPercent: number, cfi?: string, chapter?: string) => {
    const { currentBook } = get();
    if (!currentBook) return;

    const clampedPercent = Math.min(100, Math.max(0, Math.round(progressPercent)));
    set({
      progressPercent: clampedPercent,
      currentCfi: cfi !== undefined ? cfi : get().currentCfi,
      currentChapter: chapter !== undefined ? chapter : get().currentChapter,
    });

    await progressQueue.enqueue({
      bookId: currentBook.id,
      cfi: cfi || get().currentCfi || '',
      chapter: chapter || get().currentChapter,
      progressPercent: clampedPercent,
      timeSpent: 0,
      lastRead: Date.now(),
    });
  },

  toggleBookmark: async () => {
    const { currentBook, currentCfi, currentChapter, bookmarks } = get();
    if (!currentBook) return;

    const repo = getBookRepository();
    const existing = bookmarks.find((b) => b.cfi === currentCfi);

    if (existing) {
      await repo.removeBookmark(existing.id);
      set({ bookmarks: bookmarks.filter((b) => b.id !== existing.id) });
    } else {
      const newBm: Bookmark = {
        id: 'bm_' + Date.now(),
        bookId: currentBook.id,
        cfi: currentCfi || `page:${get().progressPercent}`,
        chapter: currentChapter,
        dateCreated: Date.now(),
      };
      await repo.addBookmark(newBm);
      set({ bookmarks: [newBm, ...bookmarks] });
    }
  },

  deleteBookmark: async (id: string) => {
    const repo = getBookRepository();
    await repo.removeBookmark(id);
    set((state) => ({ bookmarks: state.bookmarks.filter((b) => b.id !== id) }));
  },

  addHighlight: async (text: string, color: string, cfiRange: string, note?: string) => {
    const { currentBook, currentChapter, highlights } = get();
    if (!currentBook) return;

    const newHl: Highlight = {
      id: 'hl_' + Date.now(),
      bookId: currentBook.id,
      cfiRange,
      text,
      color,
      note,
      chapter: currentChapter,
      dateCreated: Date.now(),
    };

    const repo = getBookRepository();
    await repo.addHighlight(newHl);
    set({ highlights: [newHl, ...highlights] });
  },

  deleteHighlight: async (id: string) => {
    const repo = getBookRepository();
    await repo.removeHighlight(id);
    set((state) => ({ highlights: state.highlights.filter((h) => h.id !== id) }));
  },

  addNote: async (text: string, cfi: string, chapter?: string) => {
    const { currentBook, notes } = get();
    if (!currentBook) return;

    const newNote: Note = {
      id: 'note_' + Date.now(),
      bookId: currentBook.id,
      cfi,
      text,
      chapter: chapter || get().currentChapter,
      dateCreated: Date.now(),
      dateModified: Date.now(),
    };

    const repo = getBookRepository();
    await repo.addNote(newNote);
    set({ notes: [newNote, ...notes] });
  },

  deleteNote: async (id: string) => {
    const repo = getBookRepository();
    await repo.removeNote(id);
    set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
  },

  setTOC: (toc) => set({ toc }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setSearchResults: (searchResults) => set({ searchResults }),

  setIsSearching: (isSearching) => set({ isSearching }),

  setActiveMatchIndex: (activeMatchIndex) => set({ activeMatchIndex }),

  toggleControls: () => set((state) => ({ isControlsVisible: !state.isControlsVisible })),

  setControlsVisible: (isControlsVisible) => set({ isControlsVisible }),

  setTOCVisible: (isTOCVisible) =>
    set({
      isTOCVisible,
      isSearchVisible: false,
      isSettingsVisible: false,
      isAnnotationsVisible: false,
    }),

  setSearchVisible: (isSearchVisible) =>
    set({
      isSearchVisible,
      isTOCVisible: false,
      isSettingsVisible: false,
      isAnnotationsVisible: false,
    }),

  setSettingsVisible: (isSettingsVisible) =>
    set({
      isSettingsVisible,
      isTOCVisible: false,
      isSearchVisible: false,
      isAnnotationsVisible: false,
    }),

  setAnnotationsVisible: (isAnnotationsVisible) =>
    set({
      isAnnotationsVisible,
      isTOCVisible: false,
      isSearchVisible: false,
      isSettingsVisible: false,
    }),
}));
