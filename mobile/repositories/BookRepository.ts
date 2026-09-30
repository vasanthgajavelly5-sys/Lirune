import { Book, Collection, Bookmark, Highlight, Note, ReadingProgress } from '@/models/Book';

export interface BookRepository {
  // Books
  getBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | null>;
  addBook(book: Book): Promise<void>;
  removeBook(id: string): Promise<void>;
  updateBook(book: Book): Promise<void>;
  searchBooks(query: string): Promise<Book[]>;
  getBooksByCollection(collectionId: string): Promise<Book[]>;
  getFavoriteBooks(): Promise<Book[]>;
  getRecentBooks(limit?: number): Promise<Book[]>;

  // Collections
  getCollections(): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | null>;
  addCollection(collection: Collection): Promise<void>;
  removeCollection(id: string): Promise<void>;
  updateCollection(collection: Collection): Promise<void>;
  addBookToCollection(bookId: string, collectionId: string): Promise<void>;
  removeBookFromCollection(bookId: string, collectionId: string): Promise<void>;

  // Bookmarks
  getBookmarks(bookId: string): Promise<Bookmark[]>;
  addBookmark(bookmark: Bookmark): Promise<void>;
  removeBookmark(id: string): Promise<void>;

  // Highlights
  getHighlights(bookId: string): Promise<Highlight[]>;
  addHighlight(highlight: Highlight): Promise<void>;
  removeHighlight(id: string): Promise<void>;

  // Notes
  getNotes(bookId: string): Promise<Note[]>;
  addNote(note: Note): Promise<void>;
  updateNote(note: Note): Promise<void>;
  removeNote(id: string): Promise<void>;

  // Reading Progress
  getReadingProgress(bookId: string): Promise<ReadingProgress | null>;
  updateReadingProgress(progress: ReadingProgress): Promise<void>;

  // Data management
  exportData(): Promise<string>;
  importData(json: string): Promise<void>;
  clearAllData(): Promise<void>;

  // Preferences
  getPreference<T = any>(key: string, defaultValue: T): Promise<T>;
  setPreference(key: string, value: any): Promise<void>;
}