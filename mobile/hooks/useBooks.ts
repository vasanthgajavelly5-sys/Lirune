import { useCallback, useEffect, useState } from 'react';
import { Book, Collection } from '@/models/Book';
import { getBookRepository } from '@/repositories';

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const repo = getBookRepository();

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await repo.getBooks();
      setBooks(data);
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const addBook = useCallback(
    async (book: Book) => {
      await repo.addBook(book);
      await loadBooks();
    },
    [repo, loadBooks]
  );

  const removeBook = useCallback(
    async (id: string) => {
      await repo.removeBook(id);
      await loadBooks();
    },
    [repo, loadBooks]
  );

  const updateBook = useCallback(
    async (book: Book) => {
      await repo.updateBook(book);
      await loadBooks();
    },
    [repo, loadBooks]
  );

  const searchBooks = useCallback(
    async (query: string) => {
      if (!query.trim()) return await repo.getBooks();
      return await repo.searchBooks(query);
    },
    [repo]
  );

  const getFavoriteBooks = useCallback(async () => {
    return await repo.getFavoriteBooks();
  }, [repo]);

  return {
    books,
    loading,
    addBook,
    removeBook,
    updateBook,
    searchBooks,
    getFavoriteBooks,
    refresh: loadBooks,
  };
}

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const repo = getBookRepository();

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await repo.getCollections();
      setCollections(data);
    } catch (error) {
      console.error('Failed to load collections:', error);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const addCollection = useCallback(
    async (collection: Collection) => {
      await repo.addCollection(collection);
      await loadCollections();
    },
    [repo, loadCollections]
  );

  const removeCollection = useCallback(
    async (id: string) => {
      await repo.removeCollection(id);
      await loadCollections();
    },
    [repo, loadCollections]
  );

  const updateCollection = useCallback(
    async (collection: Collection) => {
      await repo.updateCollection(collection);
      await loadCollections();
    },
    [repo, loadCollections]
  );

  return {
    collections,
    loading,
    addCollection,
    removeCollection,
    updateCollection,
    refresh: loadCollections,
  };
}

export function useBook(id: string) {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const repo = getBookRepository();

  useEffect(() => {
    let mounted = true;
    repo.getBook(id).then((book) => {
      if (mounted) {
        setBook(book);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [id, repo]);

  return { book, loading };
}