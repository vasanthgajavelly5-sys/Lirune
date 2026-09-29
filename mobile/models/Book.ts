/**
 * Lirune Reader Mobile — Domain Models & Types
 * Functional reference: Lirune Desktop 4.0.4
 */

export type BookFormat = 'epub' | 'pdf' | 'txt' | 'html' | 'fb2' | 'cbz';
export type UnsupportedBookFormat = 'mobi' | 'kf8' | 'azw3' | 'cbr';

export interface FormatInfo {
  id: BookFormat | UnsupportedBookFormat | 'unknown';
  label: string;
  extensions: string[];
  mime: string;
  supported: boolean;
  reason?: string;
}

export const SUPPORTED_FORMATS: Record<BookFormat, FormatInfo> = {
  epub: {
    id: 'epub',
    label: 'EPUB',
    extensions: ['epub'],
    mime: 'application/epub+zip',
    supported: true,
  },
  pdf: {
    id: 'pdf',
    label: 'PDF',
    extensions: ['pdf'],
    mime: 'application/pdf',
    supported: true,
  },
  txt: {
    id: 'txt',
    label: 'Plain Text',
    extensions: ['txt'],
    mime: 'text/plain',
    supported: true,
  },
  html: {
    id: 'html',
    label: 'HTML Document',
    extensions: ['html', 'htm'],
    mime: 'text/html',
    supported: true,
  },
  fb2: {
    id: 'fb2',
    label: 'FictionBook 2',
    extensions: ['fb2'],
    mime: 'application/x-fictionbook+xml',
    supported: true,
  },
  cbz: {
    id: 'cbz',
    label: 'Comic Book Archive',
    extensions: ['cbz'],
    mime: 'application/vnd.comicbook+zip',
    supported: true,
  },
};

export const UNSUPPORTED_FORMATS: Record<UnsupportedBookFormat, FormatInfo> = {
  mobi: {
    id: 'mobi',
    label: 'Kindle / MOBI',
    extensions: ['mobi', 'azw'],
    mime: 'application/x-mobipocket-ebook',
    supported: false,
    reason: 'MOBI and Kindle formats require native conversion that is not supported on this device. Please convert to EPUB.',
  },
  kf8: {
    id: 'kf8',
    label: 'Kindle Format 8',
    extensions: ['kf8'],
    mime: 'application/x-mobipocket-ebook',
    supported: false,
    reason: 'KF8 format requires proprietary decryption/conversion. Please convert to EPUB.',
  },
  azw3: {
    id: 'azw3',
    label: 'Kindle AZW3',
    extensions: ['azw3', 'kfx'],
    mime: 'application/x-mobi8-ebook',
    supported: false,
    reason: 'AZW3/KFX files require proprietary format conversion. Please convert to EPUB.',
  },
  cbr: {
    id: 'cbr',
    label: 'Comic Book RAR',
    extensions: ['cbr'],
    mime: 'application/vnd.comicbook-rar',
    supported: false,
    reason: 'CBR archives use the proprietary RAR format. Please convert your comic archive to standard CBZ (ZIP).',
  },
};

export function getFormatFromExtension(extension: string): FormatInfo {
  const ext = extension.replace(/^\./, '').toLowerCase();
  for (const format of Object.values(SUPPORTED_FORMATS)) {
    if (format.extensions.includes(ext)) return format;
  }
  for (const format of Object.values(UNSUPPORTED_FORMATS)) {
    if (format.extensions.includes(ext)) return format;
  }
  return {
    id: 'unknown',
    label: 'Unknown Format',
    extensions: [ext],
    mime: 'application/octet-stream',
    supported: false,
    reason: `File format ".${ext}" is not recognized. Lirune Reader supports EPUB, PDF, TXT, HTML, FB2, and CBZ.`,
  };
}

export interface Book {
  id: string; // UUID
  title: string;
  author: string;
  description?: string;
  format: BookFormat;
  filePath: string; // App-local persistent file path
  fileSize: number; // Bytes
  coverUrl?: string; // App-local cover image path
  coverColor: string; // Fallback palette color
  progress: number; // 0 - 100 percentage
  currentCfi?: string; // CFI or position token (e.g., page:n, scroll:y)
  currentChapter?: string;
  chapterCount?: number;
  isFavorite: boolean;
  collectionIds: string[];
  dateAdded: number; // Timestamp ms
  lastReadDate?: number; // Timestamp ms
  availability: 'available' | 'missing';
  metadata?: Record<string, unknown>;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  bookIds: string[];
  dateCreated: number;
  dateModified: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  cfi: string; // Position identifier
  chapter: string;
  previewText?: string;
  dateCreated: number;
}

export interface Highlight {
  id: string;
  bookId: string;
  cfiRange: string;
  text: string;
  color: string; // e.g. #FFEB3B, #4ECDC4, #FF8A80
  note?: string;
  chapter?: string;
  dateCreated: number;
}

export interface Note {
  id: string;
  bookId: string;
  cfi: string;
  text: string;
  chapter?: string;
  dateCreated: number;
  dateModified: number;
}

export interface ReadingProgress {
  bookId: string;
  cfi: string;
  chapter: string;
  progressPercent: number;
  timeSpent: number; // Total ms spent
  lastRead: number;
}

export interface TOCItem {
  id: string;
  label: string;
  href?: string;
  cfi?: string;
  depth?: number;
  subitems?: TOCItem[];
}

export interface SearchResult {
  cfi: string;
  excerpt: string;
  label?: string;
  pageNumber?: number;
}

export type ViewMode = 'grid' | 'list';
export type SortCriterion = 'recent' | 'title' | 'author' | 'progress' | 'added';
export type SortDirection = 'asc' | 'desc';
export type FilterType = 'all' | 'unread' | 'reading' | 'finished' | 'favorites';

export interface LibraryPreferences {
  viewMode: ViewMode;
  sortCriterion: SortCriterion;
  sortDirection: SortDirection;
  filter: FilterType;
  selectedCollectionId: string | 'all';
}

export type ReaderThemeName =
  | 'neutral'
  | 'sepia'
  | 'night'
  | 'paper'
  | 'contrast1'
  | 'contrast2'
  | 'contrast3'
  | 'contrast4';

export interface ReaderSettings {
  theme: ReaderThemeName;
  fontSize: number; // default 18, range 12 - 36
  fontFamily: string; // 'System', 'Serif', 'Sans-Serif', 'Monospace', 'Georgia'
  lineHeight: number; // 1.2 - 2.4, default 1.6
  margin: number; // 2 - 24, default 12
  flow: 'paginated' | 'scrolled';
  alignment: 'left' | 'center' | 'right' | 'justify';
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'night',
  fontSize: 18,
  fontFamily: 'Serif',
  lineHeight: 1.6,
  margin: 12,
  flow: 'scrolled',
  alignment: 'left',
};