# Lirune Reader Android (v5.0.0)

> **Lirune — 50+ formats supported. One reader. Every document. Your device. Your privacy.**

A calm, private, touch-first mobile e-reader for Android built with React Native and Expo Router. Faithful to the product capabilities, 50+ format support, and strict privacy guarantees of Lirune Reader.

---

## Supported Formats

Lirune Reader Android supports **50 canonical primary format families** in complete parity with Windows Desktop:

| Category | Canonical Format Families | Supported Extensions & Aliases | Engine & Strategy |
|:---|:---|:---|:---|
| **E-Books** | EPUB, Kindle / MOBI, Kobo EPUB, FictionBook, FictionBook Archive, DjVu, Compiled HTML Help | `.epub`, `.mobi`, `.kepub.epub`, `.kepub`, `.fb2`, `.fbz`, `.djvu`, `.chm` | Reflowable OPF/NCX parser, styled chapter viewer with touch pagination and in-book search, DjVu viewer, and CHM parser |
| **Documents** | PDF, Plain Text, Markdown, Word Document, Legacy Word, OpenDocument Text, Rich Text, XPS Document | `.pdf`, `.txt`, `.md`, `.docx`, `.doc`, `.odt`, `.rtf`, `.xps` | Offline PDF canvas engine, virtualized chunked plaintext, CommonMark markdown, ODF/OOXML unpackers, and XPS layout engine |
| **Spreadsheets** | CSV, TSV, Excel Workbook, Legacy Excel, OpenDocument Spreadsheet, Macro-enabled Excel, Excel Template, Excel Binary Workbook | `.csv`, `.tsv`, `.xlsx`, `.xls`, `.ods`, `.xlsm`, `.xltx`, `.xlsb` | Modern & legacy spreadsheet renderers, high-performance table virtualization, formula/value display, and sheet tab navigation |
| **Presentations** | PowerPoint Presentation, Legacy PowerPoint, OpenDocument Presentation, PowerPoint Slide Show | `.pptx`, `.ppt`, `.odp`, `.ppsx` | Slide-by-slide presentation viewer, shape and text frame extraction, thumbnail previews, and touch swipe navigation |
| **Comic Books** | Comic ZIP, Comic RAR, Comic TAR, Comic 7-Zip | `.cbz`, `.cbr`, `.cbt`, `.cb7` | High-resolution image archive extractors with zip-bomb protection, lazy frame decoding, and spread/fit modes |
| **Images** | JPEG, PNG, WebP, GIF, Bitmap, SVG, TIFF, AVIF, HEIC, HEIF | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.svg`, `.tiff`, `.tif`, `.avif`, `.heic`, `.heif` | Native raster rendering, SVG sanitization, multi-frame support, UTIF TIFF engine, and HEIC/HEIF decoding |
| **Web Documents** | HTML Document, MHTML Web Archive | `.html`, `.htm`, `.mht`, `.mhtml` | Sanitized local HTML viewer with typography, heading-based TOC, and multi-part MIME archive unpacking |
| **Structured Data & Logs** | XML Document, JSON Document, YAML Document, Log File | `.xml`, `.json`, `.yaml`, `.yml`, `.log` | Syntax-aware structured data formatters, folding trees, search, and timestamped log navigators |
| **Communications & Personal Data** | Email Message, vCard Contact, iCalendar Event | `.eml`, `.vcf`, `.ics` | RFC-compliant MIME message parser, vCard address book cards, and iCalendar event schedule viewers |

### Archive Container Capabilities
- **ZIP, RAR, 7Z**: Handled as archive inspection containers (`ArchiveBrowser`), allowing selective browsing and importing of books contained within archives.

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
│       ├── CbrReaderView.tsx   # RAR comic engine
│       ├── DocxReaderView.tsx  # Word OOXML engine
│       ├── DocReaderView.tsx   # Legacy Word engine
│       ├── SpreadsheetReaderView.tsx # Virtualized spreadsheet engine
│       ├── PresentationReaderView.tsx # Slide presentation engine
│       ├── StructuredTextReaderView.tsx # XML, JSON, YAML, Log, Code engine
│       ├── EmailReaderView.tsx # EML / MSG email engine
│       ├── ContactCalendarReaderView.tsx # VCF / ICS contact and calendar engine
│       ├── ReaderControls.tsx  # Top and bottom navigation bars with touch overlay
│       ├── ChapterSheet.tsx    # Table of contents drawer
│       ├── SearchSheet.tsx     # In-book search overlay
│       ├── SettingsSheet.tsx   # Reader display settings (fonts, margins, themes)
│       └── AnnotationsSheet.tsx# Bookmarks, highlights, and notes sheet
├── models/
│   └── Book.ts                 # Type-safe domain models & 71 format constants
├── repositories/
│   ├── BookRepository.ts       # Asynchronous repository interface
│   └── SQLiteBookRepository.ts # Durable SQLite storage implementation
├── services/
│   ├── database/
│   │   └── Database.ts         # expo-sqlite WAL database with automatic schema migrations
│   ├── discovery/
│   │   └── FormatDetector.ts   # Magic byte sniffing and mime detection
│   └── storage/
│       ├── StorageService.ts   # Private app storage sandbox
│       └── SafStorageService.ts# Android Storage Access Framework integration
```

---

## Validation & Testing

```bash
npm test         # Run 412 unit and integration tests across all formats
npm run typecheck # Strict TypeScript compilation check (0 errors)
npm run lint     # ESLint code hygiene check (0 errors)
```

---

## License

Copyright © 2026 Vasanth Gajavelly.
Licensed under the GNU General Public License v3.0 only (GPL-3.0-only).
