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
    supported: false,
    reason: 'Archive container. Unpacks supported book formats upon import.',
  },
  rar: {
    id: 'rar',
    label: 'RAR Container Archive',
    extensions: ['rar'],
    mime: 'application/x-rar-compressed',
    supported: false,
    reason: 'Archive container. Unpacks supported book formats upon import.',
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
  margin: number; // 2 - 32, default 20 (standard)
  flow: 'paginated' | 'scrolled';
  alignment: 'left' | 'center' | 'right' | 'justify';
  pageGap: number; // 0 - 32, default 16 (px) - gap between pages in paginated mode
  /** Reading columns: 'auto' follows the measured width, 1 or 2 force the layout. */
  columns: 'auto' | 1 | 2;
  /**
   * Reader brightness as a percentage, 100 = undimmed.
   *
   * Set by the edge swipe gesture and persisted, so a dim setting chosen for a
   * dark room is still in force the next time the app opens.
   */
  brightness?: number;
  /** Hold a screen wake lock for as long as a book stays open. */
  keepScreenAwake?: boolean;
}

/** Narrowest brightness the edge gesture can dial down to. */
export const MIN_READER_BRIGHTNESS = 10;

/** Normalises any stored brightness into the supported range. */
export function clampReaderBrightness(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(MIN_READER_BRIGHTNESS, Math.round(value)));
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  fontSize: 18,
  fontFamily: 'Serif',
  lineHeight: 1.6,
  paragraphSpacing: 1.0,
  margin: 20, // Standard margins by default (was 12 = compact)
  flow: 'paginated',
  alignment: 'left',
  pageGap: 16,
  columns: 'auto',
  brightness: 100,
  keepScreenAwake: true,
};

const VALID_THEMES = new Set([
  'neutral', 'sepia', 'night', 'paper', 'contrast1', 'contrast2', 'contrast3', 'contrast4'
]);
const VALID_FLOWS = new Set(['paginated', 'scrolled']);
const VALID_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const VALID_COLUMNS = new Set(['auto', 1, 2]);

export function validateReaderSettings(raw: any): ReaderSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_READER_SETTINGS };

  const theme = VALID_THEMES.has(raw.theme) ? raw.theme : DEFAULT_READER_SETTINGS.theme;
  const fontSize = typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize) && raw.fontSize >= 10 && raw.fontSize <= 48
    ? Math.round(raw.fontSize)
    : DEFAULT_READER_SETTINGS.fontSize;
  const fontFamily = typeof raw.fontFamily === 'string' && raw.fontFamily.trim().length > 0
    ? raw.fontFamily.trim()
    : DEFAULT_READER_SETTINGS.fontFamily;
  const lineHeight = typeof raw.lineHeight === 'number' && Number.isFinite(raw.lineHeight) && raw.lineHeight >= 1.0 && raw.lineHeight <= 2.8
    ? Number(raw.lineHeight.toFixed(2))
    : DEFAULT_READER_SETTINGS.lineHeight;
  const paragraphSpacing = typeof raw.paragraphSpacing === 'number' && Number.isFinite(raw.paragraphSpacing) && raw.paragraphSpacing >= 0.2 && raw.paragraphSpacing <= 3.0
    ? Number(raw.paragraphSpacing.toFixed(2))
    : DEFAULT_READER_SETTINGS.paragraphSpacing;
  const margin = typeof raw.margin === 'number' && Number.isFinite(raw.margin) && raw.margin >= 2 && raw.margin <= 48
    ? Math.round(raw.margin)
    : DEFAULT_READER_SETTINGS.margin;
  const flow = VALID_FLOWS.has(raw.flow) ? raw.flow : DEFAULT_READER_SETTINGS.flow;
  const alignment = VALID_ALIGNMENTS.has(raw.alignment) ? raw.alignment : DEFAULT_READER_SETTINGS.alignment;
  const pageGap = typeof raw.pageGap === 'number' && Number.isFinite(raw.pageGap) && raw.pageGap >= 0 && raw.pageGap <= 48
    ? Math.round(raw.pageGap)
    : DEFAULT_READER_SETTINGS.pageGap;
  const columns = VALID_COLUMNS.has(raw.columns) ? raw.columns : DEFAULT_READER_SETTINGS.columns;
  const brightness = clampReaderBrightness(raw.brightness);
  const keepScreenAwake = typeof raw.keepScreenAwake === 'boolean' ? raw.keepScreenAwake : (DEFAULT_READER_SETTINGS.keepScreenAwake ?? true);

  return {
    theme,
    fontSize,
    fontFamily,
    lineHeight,
    paragraphSpacing,
    margin,
    flow,
    alignment,
    pageGap,
    columns,
    brightness,
    keepScreenAwake,
  };
}

export interface AccessibilitySettings {
  highContrast: boolean;
  largeTouchTargets: boolean;
  reduceMotion: boolean;
  readerFontScaling: number;
  screenReaderOptimized: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  highContrast: false,
  largeTouchTargets: false,
  reduceMotion: false,
  readerFontScaling: 1.0,
  screenReaderOptimized: false,
};

export function validateAccessibilitySettings(raw: any): AccessibilitySettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ACCESSIBILITY };

  const scaling = typeof raw.readerFontScaling === 'number' && Number.isFinite(raw.readerFontScaling) && raw.readerFontScaling >= 0.5 && raw.readerFontScaling <= 2.5
    ? raw.readerFontScaling
    : DEFAULT_ACCESSIBILITY.readerFontScaling;

  return {
    highContrast: typeof raw.highContrast === 'boolean' ? raw.highContrast : DEFAULT_ACCESSIBILITY.highContrast,
    largeTouchTargets: typeof raw.largeTouchTargets === 'boolean' ? raw.largeTouchTargets : DEFAULT_ACCESSIBILITY.largeTouchTargets,
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : DEFAULT_ACCESSIBILITY.reduceMotion,
    readerFontScaling: scaling,
    screenReaderOptimized: typeof raw.screenReaderOptimized === 'boolean' ? raw.screenReaderOptimized : DEFAULT_ACCESSIBILITY.screenReaderOptimized,
  };
}

export type AppThemeOption = 'dark' | 'light' | 'system';

export function validateAppTheme(raw: any): AppThemeOption {
  if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  return 'light';
}