# Lirune Reader Android (v4.0.4)

A calm, private, touch-first mobile e-reader for Android built with React Native and Expo. Faithful to the product capabilities and privacy standards of Lirune Reader Desktop 4.0.4.

---

## Supported Formats

| Format | Extension | Engine & Strategy |
|---|---|---|
| **EPUB** | `.epub` | Reflowable OPF/NCX parser, styled chapter viewer with touch pagination and in-book search |
| **PDF** | `.pdf` | Offline PDF canvas engine with page navigation, zoom, and restore |
| **Plain Text** | `.txt` | Virtualized chunked paginator preventing DOM/memory stalls on large files |
| **HTML** | `.html`, `.htm` | Sanitized local HTML viewer with typography, heading-based TOC, and scroll tracking |
| **FictionBook 2** | `.fb2` | XML body parser with inlined base64 images and chapter sectioning |
| **Comic Archive** | `.cbz` | On-demand image page streamer from ZIP archive (lazy load prevents OOM) |

### Unsupported Formats Policy
In parity with Lirune Desktop 4.0.4:
- **MOBI / KF8 / AZW3**: Explicitly rejected with a descriptive prompt advising conversion to EPUB.
- **CBR**: Explicitly rejected with guidance to use standard CBZ (ZIP) format.

---

## Architecture & Code Structure

```
mobile/
├── app/                        # Expo Router file-based screens
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Bottom navigation (Library, Shelves, Search, Settings)
│   │   ├── library.tsx         # Main library grid & list view with filter/sort chips
│   │   ├── collections.tsx     # Custom shelves and collections management
│   │   ├── search.tsx          # Fast search across library titles, authors, formats
│   │   └── settings.tsx        # App appearance, reading defaults, storage, privacy
│   ├── _layout.tsx             # Root layout with ThemeProvider and state initialization
│   └── reader.tsx              # Full-screen focused reader with Android back handling
├── components/
│   ├── BookCard.tsx            # Reusable grid and list book cards with covers & progress
│   └── reader/
│       ├── EpubReaderView.tsx  # EPUB reflowable engine
│       ├── PdfReaderView.tsx   # PDF engine
│       ├── TxtReaderView.tsx   # Virtualized chunked TXT engine
│       ├── HtmlReaderView.tsx  # Sanitized HTML engine
│       ├── Fb2ReaderView.tsx   # FictionBook XML engine
│       ├── CbzReaderView.tsx   # Lazy ZIP comic engine
│       ├── ReaderControls.tsx  # Top and bottom navigation bars with touch overlay
│       ├── ChapterSheet.tsx    # Table of contents drawer
│       ├── SearchSheet.tsx     # In-book search overlay
│       ├── SettingsSheet.tsx   # Reader display settings (fonts, margins, themes)
│       └── AnnotationsSheet.tsx# Bookmarks, highlights, and notes sheet
├── models/
│   └── Book.ts                 # Type-safe domain models & format constants
├── repositories/
│   ├── BookRepository.ts       # Asynchronous repository interface
│   └── SQLiteBookRepository.ts # Durable SQLite storage implementation
├── services/
│   ├── database/
│   │   └── Database.ts         # expo-sqlite WAL database with automatic schema migrations
│   ├── storage/
│   │   └── FileStorage.ts      # Persistent app-private directory file manager
│   ├── metadata/
│   │   └── MetadataExtractor.ts# Format-specific metadata and cover extraction
│   └── import/
│       └── ImportService.ts    # Android Document Picker and import pipeline
├── state/
│   ├── libraryStore.ts         # Zustand library slice (books, filters, collections)
│   ├── readerStore.ts          # Zustand reader slice (current book, progress, annotations)
│   └── settingsStore.ts        # Zustand settings slice (theme, typography, preferences)
├── theme/
│   ├── Colors.ts               # Brand accent (#EEECF8) & 8 reader palettes
│   └── ThemeContext.tsx        # Light/Dark/System theme context
└── utils/
    ├── errors.ts               # Standardized application error hierarchy
    └── logger.ts               # Lightweight, privacy-safe logger
```

---

## Database & Persistence

Durable persistence is powered by **Expo SQLite** (`expo-sqlite`):
- **WAL Mode**: `PRAGMA journal_mode = WAL` enabled for performance and atomic writes.
- **Tables**: `books`, `collections`, `book_collections`, `bookmarks`, `highlights`, `notes`, `reading_progress`, `preferences`.
- **Indexes**: Indexed on `format`, `lastReadDate`, `isFavorite`, and foreign keys.
- **Web Fallback**: Web-safe local storage adapter ensures UI development on PC.

---

## Privacy & Offline Pledge

Lirune Reader Mobile strictly adheres to the desktop privacy model:
- 100% offline operation.
- No mandatory accounts, sign-ins, or cloud sync.
- No book content leaves the device.
- Zero analytics or third-party telemetry.

---

## Building and Running

### Development Build
```bash
cd mobile
npm install
npm run android
```

### Type Checking & Linting
```bash
npm run typecheck
npm run lint
```