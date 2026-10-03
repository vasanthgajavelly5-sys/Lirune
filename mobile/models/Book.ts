/**
 * Lirune Reader Mobile — Domain Models & Types
 * Functional reference: Lirune Desktop 4.0.4
 */

export type BookFormat =
  | 'epub'
  | 'pdf'
  | 'txt'
  | 'html'
  | 'fb2'
  | 'cbz'
  | 'mobi'
  | 'azw'
  | 'azw3'
  | 'djvu'
  | 'doc'
  | 'docx'
  | 'rtf'
  | 'odt'
  | 'chm'
  | 'cbr'
  | 'zip'
  | 'rar';

export interface FormatInfo {
  id: BookFormat | 'unknown';
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
    extensions: ['html', 'htm', 'xhtml'],
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
    label: 'Comic Book Archive (CBZ)',
    extensions: ['cbz'],
    mime: 'application/vnd.comicbook+zip',
    supported: true,
  },
  cbr: {
    id: 'cbr',
    label: 'Comic Book Archive (CBR)',
    extensions: ['cbr'],
    mime: 'application/vnd.comicbook-rar',
    supported: true,
  },
  mobi: {
    id: 'mobi',
    label: 'MOBI / PalmDOC',
    extensions: ['mobi', 'prc'],
    mime: 'application/x-mobipocket-ebook',
    supported: true,
  },
  azw: {
    id: 'azw',
    label: 'Amazon Kindle (AZW)',
    extensions: ['azw'],
    mime: 'application/vnd.amazon.ebook',
    supported: true,
  },
  azw3: {
    id: 'azw3',
    label: 'Kindle Format 8 (AZW3/KF8)',
    extensions: ['azw3', 'kf8'],
    mime: 'application/x-mobi8-ebook',
    supported: true,
  },
  djvu: {
    id: 'djvu',
    label: 'DjVu Document',
    extensions: ['djvu', 'djv'],
    mime: 'image/vnd.djvu',
    supported: true,
  },
  doc: {
    id: 'doc',
    label: 'Microsoft Word (97-2003)',
    extensions: ['doc'],
    mime: 'application/msword',
    supported: true,
  },
  docx: {
    id: 'docx',
    label: 'Microsoft Word (DOCX)',
    extensions: ['docx'],
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    supported: true,
  },
  rtf: {
    id: 'rtf',
    label: 'Rich Text Format (RTF)',
    extensions: ['rtf'],
    mime: 'application/rtf',
    supported: true,
  },
  odt: {
    id: 'odt',
    label: 'OpenDocument Text (ODT)',
    extensions: ['odt'],
    mime: 'application/vnd.oasis.opendocument.text',
    supported: true,
  },
  chm: {
    id: 'chm',
    label: 'Compiled HTML Help (CHM)',
    extensions: ['chm'],
    mime: 'application/vnd.ms-htmlhelp',
    supported: true,
  },
  zip: {
    id: 'zip',
    label: 'ZIP Container Archive',
    extensions: ['zip'],
    mime: 'application/zip',
    supported: true,
  },
  rar: {
    id: 'rar',
    label: 'RAR Container Archive',
    extensions: ['rar'],
    mime: 'application/x-rar-compressed',
    supported: true,
  },
};

export function getFormatFromExtension(filenameOrExt: string): FormatInfo {
  const parts = filenameOrExt.split(/[./\\]/);
  const ext = (parts[parts.length - 1] || '').toLowerCase();
  for (const format of Object.values(SUPPORTED_FORMATS)) {
    if (format.extensions.includes(ext)) return format;
  }
  return {
    id: 'unknown',
    label: 'Unknown Format',
    extensions: [ext],
    mime: 'application/octet-stream',
    supported: false,
    reason: `File format ".${ext}" is not recognized. Lirune Reader supports EPUB, PDF, TXT, HTML, FB2, CBZ, MOBI, AZW, AZW3, DJVU, DOC, DOCX, RTF, ODT, CHM, CBR, ZIP, and RAR.`,
  };
}

export interface Book {
  id: string; // UUID
  title: string;
  author: string;
  description?: string;
  format: BookFormat;
  uri: string; // SAF content:// URI or file:// — canonical source
  filePath?: string; // App-local persistent file path (legacy/backward compat)
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

export type ViewMode = 'grid' | 'list' | 'compact';
export type SortCriterion = 'recent' | 'title' | 'author' | 'progress' | 'added';
export type SortDirection = 'asc' | 'desc';
export type FilterType = 'all' | 'reading' | 'favorites';

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
  paragraphSpacing: number; // 0.4 - 2.5, default 1.0 (em)
  margin: number; // 2 - 24, default 12
  flow: 'paginated' | 'scrolled';
  alignment: 'left' | 'center' | 'right' | 'justify';
  pageGap: number; // 0 - 32, default 16 (px) - gap between pages in paginated mode
  /** Reading columns: 'auto' follows the measured width, 1 or 2 force the layout. */
  columns: 'auto' | 1 | 2;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  fontSize: 18,
  fontFamily: 'Serif',
  lineHeight: 1.6,
  paragraphSpacing: 1.0,
  margin: 12,
  flow: 'paginated',
  alignment: 'left',
  pageGap: 16,
  columns: 'auto',
};