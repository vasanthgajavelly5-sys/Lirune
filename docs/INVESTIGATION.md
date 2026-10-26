# Lirune Reader Mobile — Technical Investigation & Reproduction Report

**Branch:** `android`  
**Date:** 2026-10-26  
**Document:** `docs/INVESTIGATION.md`  

---

## 1. System Mapping

### Navigation Structure
- **Root Layout (`mobile/app/_layout.tsx`):**
  - Uses Expo Router `Stack` with two primary screen groups: `(tabs)` and `reader` (full-screen modal with fade animation).
  - Handles external file intents (`content://` and `file://`) via `Linking` and dispatches to `ImportService.importFile()` followed by opening `/reader`.
- **Tabs Layout (`mobile/app/(tabs)/_layout.tsx`):**
  - Contains routes: `index` (Library), `library` (redirect), `collections` (Collections), `search` (Files / Discovery), `annotations` (Annotations), `settings` (Settings), and `about` (About).
  - Standard Expo bottom tab bar is suppressed (`tabBarStyle: { display: 'none' }`).
  - Wrapped by `LiruneNavigationProvider` from `mobile/components/navigation/LiruneSideNav.tsx`.
- **Side Navigation & Responsive Architecture (`mobile/components/navigation/LiruneSideNav.tsx`):**
  - **Phone (< 680 dp):** Renders slide-out drawer `LiruneSlideDrawer` with animated backdrop, accessible via `LiruneNavButton` menu icon, combined with custom `LiruneBottomTabBar` at the bottom of the screen.
  - **Tablet / Large Screen (>= 680 dp):** Renders persistent vertical side rail `LiruneSideRail` with icon + label layout. Bottom bar is hidden on wide screens.
  - Hysteresis thresholds: `WIDE_SCREEN_OFF_DP = 640`, `WIDE_SCREEN_ON_DP = 680` to prevent flip oscillation during rotation.

### Reader Pipeline per Format
- **Reader Dispatcher (`mobile/app/reader.tsx`):**
  - Resolves source path via `SourceResolver.resolve(book)`.
  - Dispatches to format-specific views:
    - **`epub`:** `EpubReaderView.tsx` — reads package, parses spine, TOC (EPUB 3 nav / EPUB 2 NCX), extracts chapters into sanitized XHTML, renders into WebView with two flow modes: paginated (CSS multi-column with horizontal paging) or scrolled (continuous vertical layout).
    - **`pdf`:** `PdfReaderView.tsx` — embedded PDF.js rendered inside WebView with canvas/SVG output.
    - **`txt`:** `TxtReaderView.tsx` — reads chunks using `fileStorage.readRangeAsString()`, rendered via native virtualization.
    - **`html`:** `HtmlReaderView.tsx` — WebView with Lirune theme styling.
    - **`fb2`:** `Fb2ReaderView.tsx` — XML parsing of FictionBook2 elements, styled into WebView.
    - **`cbz`:** `CbzReaderView.tsx` — ZIP archive inspection, comic image extraction into temporary cache, native image paging.
    - **`cbr`:** `CbrReaderView.tsx` — unrar extraction into cache, native image display.
    - **`mobi` / `azw` / `azw3`:** `MobiReaderView.tsx` — PalmDOC/HuffDic decompressed byte stream, converted to HTML and rendered into WebView.
    - **`docx`:** `DocxReaderView.tsx` — extracts `word/document.xml`, parses OOXML elements into HTML for WebView.
    - **`odt`:** `OdtReaderView.tsx` — extracts `content.xml`, parses ODF text into HTML for WebView.
    - **`rtf`:** `RtfReaderView.tsx` — parses RTF control words and groups into HTML.
    - **`doc`:** `DocReaderView.tsx` — Compound File Binary (OLE2) parser for Word 97-2003 binary streams.
    - **`chm`:** `ChmReaderView.tsx` — parses ITSF storage format and internal HTML files.
    - **`djvu`:** `DjvuReaderView.tsx` — parses AT&T/FORM DJVU chunks.

### Current Import & Storage Scan Flow
1. **File Picking (`ImportService.ts`):**
   - User picks a file via `DocumentPicker.getDocumentAsync`.
   - `FormatDetector.fromFilename(fileName)` or `FormatDetector.fromMagicBytes(bytes)` is called.
   - `FileStorage.copyToAppStorage()` calls native `copyContentUriToStorage()` or falls back to `FileSystem.copyAsync`.
   - Copies file to app-private storage: `${documentDirectory}books/<uuid>.<ext>` using `.part` staging.
   - Computes SHA-256 after copy, queries `BookRepository` for duplicates, extracts metadata, and saves book to SQLite.
2. **Directory & SAF Scanning (`search.tsx` + `LiruneStorageModule.kt`):**
   - User initiates scan.
   - `LiruneStorageModule.scanSafTree(treeUri)` performs a BFS traversal of documents using `DocumentsContract.buildChildDocumentsUriUsingTree()`.
   - Filters candidate files by extension list `SUPPORTED_EXTENSIONS`.
   - Returns all files in a single synchronous bridge array resolution `promise.resolve(results)`.
   - No content-based sniffing occurs during discovery; files lacking supported extensions are completely missed.

---

## 2. Reproduction of 2,000-Chapter EPUB Failure

### Test Fixtures Generated
Using `scripts/make-big-epub.py`, valid test fixtures were generated:
- `test-assets/big-epubs/epub_500_chapters.epub` (500 chapters, 228 KB)
- `test-assets/big-epubs/epub_500_chapters_notoc.epub` (500 chapters, flat spine, 218 KB)
- `test-assets/big-epubs/epub_2000_chapters.epub` (2,000 chapters, nested TOC, 914 KB, 2,005 zip entries)
- `test-assets/big-epubs/epub_2000_chapters_notoc.epub` (2,000 chapters, no TOC, 876 KB)
- `test-assets/big-epubs/epub_5000_chapters.epub` (5,000 chapters, nested TOC, 2.28 MB, 5,005 zip entries)
- `test-assets/big-epubs/epub_5000_chapters_notoc.epub` (5,000 chapters, no TOC, 2.19 MB)

### Exact Error and Stack Trace
When loading `epub_2000_chapters.epub` into the reader pipeline (`EpubReaderView.tsx` line 741), execution immediately halts before parsing the OPF:

```
Error: The archive contains too many entries to open safely.
    at validateArchiveBudget (mobile/services/security/archiveBudget.ts:14:11)
    at loadEpub (mobile/components/reader/EpubReaderView.tsx:741:32)
```

**Root Cause Analysis:**
1. **Archive Entry Budget Hard Cap:**  
   `mobile/services/security/archiveBudget.ts` line 7 sets:
   ```typescript
   export const MAX_ARCHIVE_ENTRIES = 2000;
   ```
   A 2,000-chapter EPUB contains:
   `mimetype` + `META-INF/container.xml` + `OEBPS/content.opf` + `OEBPS/toc.ncx` + `OEBPS/nav.xhtml` + 2,000 chapter XHTML files = **2,005 entries**.  
   Because `2005 > 2000`, `validateArchiveBudget()` throws a fatal error and rejects the book.

2. **Downstream Bottlenecks (verified in Phase 0):**
   - **Full In-Memory Loading (`FileStorage.readAsArrayBuffer`):** Reads the entire file into a JS ArrayBuffer before passing to JSZip.
   - **Continuous DOM Overload (`buildContinuousShell`):** Generates 2,000 `<section>` tags and `<div class="chapter-body">` in a single 751 KB HTML string, which causes WebView DOM layout freezing and high memory consumption.
   - **TOC Virtualization Absence (`ChapterSheet.tsx`):** Renders all 2,200 TOC entries in a non-virtualized `FlatList` with variable height and nested styling, causing severe frame drops on the JS thread.

---

## 3. Reproduction of Format Detection Defects

Evaluating `FormatDetector` against edge-case files yielded the following results:

| Test Case | Current Detector Result | Target Behavior | Root Cause |
|---|---|---|---|
| **EPUB with `application/octet-stream` & named `download.bin`** | `epub` (detected via zip magic snippet) | `epub` | Header snippet in zip happens to find `mimetypeapplication/epub+zip` if uncompressed, but fails if extra zip header fields exist or container.xml is offset. |
| **Extensionless EPUB file (`my_novel`)** | `fromFilename()` -> `unknown` (failed) | `epub` | Filename-only detection fails completely on extensionless files. |
| **Kindle AZW3 named `download.bin`** | `mobi` (detected as generic mobi) | `azw3` | Detector inspects `BOOKMOBI` tag at byte 60, but does not parse EXTH header flags (KF8 boundary) to differentiate AZW3 from legacy MOBI. |
| **FictionBook 2 (`.fb2`) named `download.bin`** | `fb2` (detected via `<FictionBook`) | `fb2` | Passes if text head contains tag; fails for `.fb2.zip` containers (identified as generic `.zip`). |
| **Comic Book RAR (`.cbr`) named `download.bin`** | `rar` (`supported: false`, rejected) | `cbr` | Detector only returns `cbr` if extension is explicitly `.cbr`. Otherwise it returns `rar`, which is marked unsupported for direct reading. |
| **Comic Book 7z (`.cb7`)** | `unknown` (`supported: false`, rejected) | `cb7` | 7z signature `7z\xBC\xAF\x27\x1C` is not implemented in `FormatDetector` or `Book.ts`. |
| **Native SAF Scan (`LiruneStorageModule.kt`)** | Completely ignores `.bin`, `.cb7`, and extensionless files | Identifies by magic bytes | Native scanner uses `SUPPORTED_EXTENSIONS.contains(ext)` exclusively; non-standard or missing extensions are dropped before JS ever sees them. |

---

## 4. Key Architectural Decisions for Subsequent Workstreams

1. **Workstream B:**
   - Relax `MAX_ARCHIVE_ENTRIES` to 25,000 entries and validate uncompressed byte ratios properly.
   - Window continuous scroll rendering to current chapter ± 2 chapters, releasing DOM for out-of-window chapters.
   - Modernize `ChapterSheet.tsx` with fixed item heights, search/filtering, and virtualized list semantics.
   - Implement lazy background location generation cached in SQLite table `book_locations`.

2. **Workstream A:**
   - Migrate `LiruneStorageModule` to Kotlin coroutines (`Dispatchers.IO`) with streaming batches of 200 items (`onScanBatch`, `onScanProgress`, `onScanDone`).
   - Implement robust native content-based sniffing across all 17+ formats (including CB7, FB2 in zip, AZW3 EXTH KF8 flag, DRM detection).
   - Single-pass streaming ingest with SHA-256 computation in `DigestOutputStream`.
   - Update SQLite database schema to versioned migration incorporating `sources`, `entries`, `books`, `book_files`, `jobs`, and `book_locations`.
   - Remove dead manifest permissions (`READ_EXTERNAL_STORAGE`, `READ_MEDIA_*`, `MANAGE_DOCUMENTS`).

3. **Workstream C:**
   - Add "Folders" sidebar entry to `LiruneSideNav` and `LiruneBottomTabBar`.
   - Implement two-layer browser in `mobile/app/folders/index.tsx`: Layer 1 (persisted SAF locations & storage volumes), Layer 2 (in-app breadcrumb folder explorer using child document ID queries).
