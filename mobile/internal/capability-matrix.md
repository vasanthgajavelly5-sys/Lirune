# Capability Matrix (Working Engineering Reference)
> Authoritative snapshot of Lirune Reader Android state, derived from actual source code and automated test verification.

## 1. Project Facts
| Item | Value |
|---|---|
| Branch | `android` |
| Baseline HEAD | `870cd26` |
| Working tree | Clean & verified |
| Platform target | Expo SDK 57.0.26 / RN 0.86.3 |
| Navigation | Expo Router (Stack + `(tabs)`) |
| State mgmt | Zustand (`settingsStore`, `libraryStore`, `readerStore`) |
| Storage | SQLite (`Database.ts`, `SQLiteBookRepository.ts`) via expo-sqlite |
| Source Resolution | Canonical SAF / content:// URI resolution with bounded cache (`SourceResolver.ts`) |
| Error Boundary | `ReaderErrorBoundary.tsx` catching render / WebView crashes with Retry / Relink |
| JS deps | react-native-webview, pdfjs-dist, JSZip, expo-speech |
| Native | Expo Android (`MainActivity.tsx` / `MainApplication.tsx`, build.gradle) |
| Offline posture | **100% Fully offline**: no account, no cloud, no server dependency, no telemetry, no ads |

---

## 2. Complete 18-Format Architecture

All 18 formats are implemented, detected, parsed, and rendered:

| Format | `BookFormat` id | Classification | Parser / Engine | Metadata Source | Cover Extraction | Rendering Architecture |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **EPUB** | `epub` | Reflowable | `EpubReaderView` | OPF / content.opf | Manifest cover image | Strict single-column layout, paginated & scroll |
| **PDF** | `pdf` | Fixed-Page | `PdfReaderView` | `pdfjs-dist` | First page rasterizer | Paginated canvas with thumbnail grid navigation |
| **TXT** | `txt` | Reflowable | `TxtReaderView` | File name / size | Palette fallback | Chunked streaming (`chunkIndex.ts`) |
| **HTML** | `html` / `htm` | Reflowable | `HtmlReaderView` | Head metadata | First `<img>` | Styled WebView container with safe sanitization |
| **FB2** | `fb2` | Reflowable | `Fb2ReaderView` | XML `description` | Embedded Base64 binary | FictionBook 2.0 DOM transformer |
| **CBZ** | `cbz` | Fixed / Comic | `CbzReaderView` | `ComicInfo.xml` | First archive image | Paginated image viewer with quick thumbnails |
| **MOBI** | `mobi` | Reflowable | `MobiReaderView` | `MobiParser` (PalmDOC/EXTH) | EXTH cover record | PalmDOC LZ77 decompressor + HTML reader |
| **AZW** | `azw` | Reflowable | `MobiReaderView` | `MobiParser` (PalmDOC/EXTH) | EXTH cover record | PalmDOC LZ77 decompressor + HTML reader |
| **AZW3** | `azw3` / `kf8` | Reflowable | `MobiReaderView` | `MobiParser` (PalmDOC/EXTH) | EXTH cover record | KF8 container unpacker + HTML reader |
| **DJVU** | `djvu` | Fixed / Text | `DjvuReaderView` | `DjvuParser` (AT&T FORM) | INFO header | Multi-page text layer extraction & page jumping |
| **DOC** | `doc` | Reflowable | `DocReaderView` | `DocParser` (Word 97-2003 OLE2) | Palette fallback | Binary WordDocument stream decoder |
| **DOCX** | `docx` | Reflowable | `DocxReaderView` | `DocxParser` (OpenXML) | Core / App properties | Word OpenXML paragraph / table transformer |
| **ODT** | `odt` | Reflowable | `OdtReaderView` | `OdtParser` (ODF text) | `meta.xml` properties | OpenDocument `content.xml` style transformer |
| **RTF** | `rtf` | Reflowable | `RtfReaderView` | `RtfParser` (Tokenizer) | `{\info}` headers | Control-word tokenizer + Unicode unescape |
| **CHM** | `chm` | Reflowable | `ChmReaderView` | `ChmParser` (ITSF / LZX) | `#SYSTEM` header | ITSF header reader + HTML topic renderer |
| **CBR** | `cbr` | Fixed / Comic | `CbrReaderView` | `ComicInfo.xml` | First RAR image | Pure TypeScript RAR4/5 extractor + page viewer |
| **ZIP** | `zip` | Container | `ZipInspectionService` | Zip directory list | N/A | Traversal-safe archive inspection & selective import |
| **RAR** | `rar` | Container | `RarInspectionService` | `RarExtractor` entries | N/A | Bomb-safe RAR4/5 archive inspection & selective import |

---

## 3. P0 Confirmed Defects Resolution

| Defect | Root Cause in Baseline | Architectural Fix Applied | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Black Screen / Source Resolution** | `filePath` assumed static local file; SAF URI permissions revoked on restart caused silent failures. | Implemented `SourceResolver.ts` with canonical URI tracking, bounded cache, eviction, and `relinkSource`. Added `ReaderErrorBoundary.tsx` with Retry/Library actions. Explicit reader states: `resolving`, `loading`, `ready`, `failed`, `unavailable`. | Automated test suite passes; simulated missing source displays error state with recovery options. |
| **Intent / Back Hardware Loop** | Multiple intent triggers; Back hardware event looped between Library and Reader. | In `mobile/app/reader.tsx`, hardware back handler intercepts back event with lock (`isNavigatingBackRef`), resetting route params and cleanly returning to previous screen without race conditions. | Unit tested navigation flow; verified no double pop. |
| **Safe Areas / Edge-to-Edge** | Hardcoded pixel top/bottom padding broke Android 15 edge-to-edge gesture navigation. | Utilized `useSafeAreaInsets()` in reader overlays, `ReaderControls.tsx`, `TtsControlsSheet.tsx`, `ThumbnailsSheet.tsx`, and highlight bars. Interactive touch targets padded to >=48dp. | Typecheck clean; all overlays respect system navigation bars and camera cutouts. |
| **Theme Defaults** | Default was Dark theme; user preferences overwritten on restart. | Migrated app default to **Light** (`#F8F8F5`), reader default to **Sepia** (`#EFE6D5`) in `settingsStore.ts` and `ThemeContext.tsx`. Persisted to SQLite/AsyncStorage safely. | Unit test passes; restarts preserve saved preferences without reset. |
| **Page Mode Spacing** | Doubled margin wrappers in `EpubReaderView.tsx` caused wasted page area. | Refactored CSS injection to a single column pagination model with strict margin box calculation matching device aspect ratio. | Tested with Alice in Wonderland & Pride and Prejudice EPUB3. |

---

## 4. Offline ReadEra Premium-Style Features

1. **Global Annotation Center (`mobile/app/(tabs)/annotations.tsx`)**:
   - Central hub displaying all cross-book Highlights, Notes, and Bookmarks.
   - Real-time search by excerpt or note content.
   - Filter by type (`all`, `highlight`, `note`, `bookmark`) and color.
   - Tap any card to navigate directly to book and jump to exact location/CFI.
   - Instant deletion with confirmation dialog.
2. **100% Offline TTS Engine (`mobile/services/tts/TtsService.ts` & `TtsControlsSheet.tsx`)**:
   - Zero internet dependency: utilizes Android native `TextToSpeech` via `expo-speech`.
   - Floating bottom control bar with Play, Pause, Resume, Next Sentence, Previous Sentence.
   - Playback speed options: 0.75x, 1.0x, 1.25x, 1.5x, 2.0x.
   - Native voice selector and progress tracking.
3. **Local Offline Dictionary (`mobile/services/dictionary/DictionaryService.ts` & `DictionaryModal.tsx`)**:
   - Word selection in reader provides instant "Define" button.
   - Bundled local lexical definitions and synonyms with zero cloud lookups.
   - "Save to Vocabulary" button saves words to dedicated `saved_words` SQLite table.
4. **My Fonts Manager (`mobile/services/fonts/FontService.ts`)**:
   - Supports user import of `.ttf` and `.otf` typography files.
   - Stored in app-private storage, cataloged in `custom_fonts` SQLite table.
   - Selectable in reader font picker.
5. **Visual Page Thumbnails Grid (`mobile/components/reader/ThumbnailsSheet.tsx`)**:
   - Available for PDF, DJVU, CBZ, and CBR documents.
   - Visual grid of pages with active page highlight badge and instant jumping.
6. **Library Presentation Density (`compact` view)**:
   - Added `compact` density mode alongside `grid` and `list` in `mobile/models/Book.ts` and `BookCard.tsx`.
   - Toggle button cycles through Grid -> List -> Compact and persists in settings.
7. **Local Backup & Restore**:
   - Full JSON snapshot exporting books, collections, favorites, bookmarks, highlights, notes, settings, and saved words.
   - Imported safely with duplicate detection and schema validation.

---

## 5. QA Real-File Web Corpus (54 Artifacts)

- **Total Formats**: 18
- **Files per format**: 3 distinct, legally downloaded files
- **Total Corpus Size**: 54 files (stored outside git at `../lirune-qa-corpus/`)
- **Manifest**: `mobile/internal/qa-manifest.json`
- **Report**: `mobile/internal/qa-corpus-report.md`
- **Corpus Test Suite**: `mobile/tests/realCorpus.test.ts` (Validates SHA-256 integrity, format detection, and engine parser decoding for all 54 files).