/**
 * Lirune Reader Mobile — Library State Store (Zustand)
 */

import { create } from 'zustand';
import {
  Book,
  Collection,
  ViewMode,
  SortCriterion,
  SortDirection,
  FilterType,
} from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { ImportService } from '@/services/import/ImportService';
import { fileStorage } from '@/services/storage/FileStorage';
import { logger } from '@/utils/logger';

const TAG = 'LibraryStore';

interface LibraryState {
  books: Book[];
  collections: Collection[];
  isLoading: boolean;
  error: string | null;

  // UI preferences
  viewMode: ViewMode;
  sortCriterion: SortCriterion;
  sortDirection: SortDirection;
  filter: FilterType;
  selectedCollectionId: string | 'all';
  searchQuery: string;

  // Actions
  loadLibrary: () => Promise<void>;
  importBook: () => Promise<Book | null>;
  deleteBook: (bookId: string) => Promise<void>;
  toggleFavorite: (bookId: string) => Promise<void>;
  createCollection: (name: string, color?: string) => Promise<Collection>;
  deleteCollection: (collectionId: string) => Promise<void>;
  addBookToCollection: (bookId: string, collectionId: string) => Promise<void>;
  removeBookFromCollection: (bookId: string, collectionId: string) => Promise<void>;
  setViewMode: (viewMode: ViewMode) => void;
  setSortCriterion: (sortCriterion: SortCriterion) => void;
  setSortDirection: (sortDirection: SortDirection) => void;
  setFilter: (filter: FilterType) => void;
  setSelectedCollectionId: (collectionId: string | 'all') => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  collections: [],
  isLoading: false,
  error: null,

  viewMode: 'grid',
  sortCriterion: 'recent',
  sortDirection: 'desc',
  filter: 'all',
  selectedCollectionId: 'all',
  searchQuery: '',

  loadLibrary: async () => {
    set({ isLoading: true, error: null });
    const repo = getBookRepository();
    try {
      const [books, collections, savedPrefs] = await Promise.all([
        repo.getBooks(),
        repo.getCollections(),
        (repo as any).getPreference?.('libraryPreferences', null),
      ]);

      const updates: Partial<LibraryState> = {
        books,
        collections,
        isLoading: false,
      };

      if (savedPrefs) {
        if (savedPrefs.viewMode) updates.viewMode = savedPrefs.viewMode;
        if (savedPrefs.sortCriterion) updates.sortCriterion = savedPrefs.sortCriterion;
        if (savedPrefs.sortDirection) updates.sortDirection = savedPrefs.sortDirection;
      }
      // Guarantee pull-to-refresh, reloads, or DB updates never reset the active filter
      updates.filter = get().filter;

      set(updates);
    } catch (err) {
      logger.error(TAG, 'Failed to load library', err);
      set({ isLoading: false, error: 'Could not load library books.' });
    }
  },

  importBook: async () => {
    set({ error: null });
    const result = await ImportService.pickAndImportBook();

    if (result.cancelled) {
      return null;
    }

    if (!result.success || !result.book) {
      const errorMsg = result.error?.userMessage || 'Failed to import book.';
      set({ error: errorMsg });
      return null;
    }

    // Refresh books
    await get().loadLibrary();
    return result.book;
  },

  deleteBook: async (bookId: string) => {
    const repo = getBookRepository();
    const book = get().books.find((b) => b.id === bookId);
    try {
      await repo.removeBook(bookId);
      if (book) {
        if (book.filePath) {
          await fileStorage.deleteBookFiles(book.filePath, book.coverUrl);
        } else if (book.coverUrl) {
          await fileStorage.deleteBookFiles('', book.coverUrl);
        }
      }
      set((state) => ({
        books: state.books.filter((b) => b.id !== bookId),
        collections: state.collections.map((c) => ({
          ...c,
          bookIds: c.bookIds.filter((id) => id !== bookId),
        })),
      }));
    } catch (err) {
      logger.error(TAG, `Failed to delete book ${bookId}`, err);
      set({ error: 'Could not delete book.' });
    }
  },

  toggleFavorite: async (bookId: string) => {
    const repo = getBookRepository();
    const book = get().books.find((b) => b.id === bookId);
    if (!book) return;

    const updated: Book = { ...book, isFavorite: !book.isFavorite };
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));

    try {
      await repo.updateBook(updated);
    } catch (err) {
      logger.error(TAG, `Failed to update favorite status for ${bookId}`, err);
    }
  },

  createCollection: async (name: string, color = '#7C5CFF') => {
    const repo = getBookRepository();
    const newColl: Collection = {
      id: 'coll_' + Date.now(),
      name: name.trim(),
      color,
      bookIds: [],
      dateCreated: Date.now(),
      dateModified: Date.now(),
    };

    try {
      await repo.addCollection(newColl);
      set((state) => ({
        collections: [...state.collections, newColl],
      }));
      return newColl;
    } catch (err) {
      logger.error(TAG, 'Failed to create collection', err);
      throw err;
    }
  },

  deleteCollection: async (collectionId: string) => {
    const repo = getBookRepository();
    try {
      await repo.removeCollection(collectionId);
      set((state) => ({
        collections: state.collections.filter((c) => c.id !== collectionId),
        selectedCollectionId:
          state.selectedCollectionId === collectionId ? 'all' : state.selectedCollectionId,
      }));
    } catch (err) {
      logger.error(TAG, `Failed to delete collection ${collectionId}`, err);
    }
  },

  addBookToCollection: async (bookId: string, collectionId: string) => {
    const repo = getBookRepository();
    try {
      await repo.addBookToCollection(bookId, collectionId);
      set((state) => ({
        books: state.books.map((b) =>
          b.id === bookId
            ? { ...b, collectionIds: [...new Set([...b.collectionIds, collectionId])] }
            : b
        ),
        collections: state.collections.map((c) =>
          c.id === collectionId
            ? { ...c, bookIds: [...new Set([...c.bookIds, bookId])] }
            : c
        ),
      }));
    } catch (err) {
      logger.error(TAG, 'Failed to add book to collection', err);
    }
  },

  removeBookFromCollection: async (bookId: string, collectionId: string) => {
    const repo = getBookRepository();
    try {
      await repo.removeBookFromCollection(bookId, collectionId);
      set((state) => ({
        books: state.books.map((b) =>
          b.id === bookId
            ? { ...b, collectionIds: b.collectionIds.filter((c) => c !== collectionId) }
            : b
        ),
        collections: state.collections.map((c) =>
          c.id === collectionId
            ? { ...c, bookIds: c.bookIds.filter((id) => id !== bookId) }
            : c
        ),
      }));
    } catch (err) {
      logger.error(TAG, 'Failed to remove book from collection', err);
    }
  },

  setViewMode: (viewMode) => {
    set({ viewMode });
    const repo = getBookRepository() as any;
    repo.setPreference?.('libraryPreferences', {
      viewMode,
      sortCriterion: get().sortCriterion,
      sortDirection: get().sortDirection,
      filter: get().filter,
    });
  },

  setSortCriterion: (sortCriterion) => {
    set({ sortCriterion });
    const repo = getBookRepository() as any;
    repo.setPreference?.('libraryPreferences', {
      viewMode: get().viewMode,
      sortCriterion,
      sortDirection: get().sortDirection,
      filter: get().filter,
    });
  },

  setSortDirection: (sortDirection) => {
    set({ sortDirection });
    const repo = getBookRepository() as any;
    repo.setPreference?.('libraryPreferences', {
      viewMode: get().viewMode,
      sortCriterion: get().sortCriterion,
      sortDirection,
      filter: get().filter,
    });
  },

  setFilter: (filter) => {
    set({ filter });
    const repo = getBookRepository() as any;
    repo.setPreference?.('libraryPreferences', {
      viewMode: get().viewMode,
      sortCriterion: get().sortCriterion,
      sortDirection: get().sortDirection,
      filter,
    });
  },

  setSelectedCollectionId: (selectedCollectionId) => {
    set({ selectedCollectionId });
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
  },

  clearError: () => set({ error: null }),
}));
