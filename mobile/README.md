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

### Requirements
- **Node.js 22.18 or newer** (the test suite runs on Node's built-in runner with
  TypeScript type stripping; Node 20 cannot execute the `.ts` tests).
- Android SDK with NDK 27, JDK 17.
- Release builds need a keystore; see *Release signing* below.

### Development Build
```bash
cd mobile
npm install
npm run android
```

### Type Checking, Linting & Tests
```bash
npm run typecheck
npm run lint
npm test
```

### Release build
```bash
cd mobile
npm ci
npm run typecheck && npm run lint && npm test
npx expo prebuild --clean --platform android
cd android
gradlew.bat assembleRelease
```
Output: `android/app/build/outputs/apk/release/app-release.apk`.

Check what the artifact actually contains before publishing it:
```bash
aapt2 dump badging app-release.apk | grep -E "native-code|sdkVersion|targetSdkVersion"
```

### Supported ABIs
`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64` (see `expo-build-properties` in
`app.json`). `armeabi-v7a` is what a 32-bit tablet needs; a build without it fails
with `INSTALL_FAILED_NO_MATCHING_ABIS`.

### Permissions
| Permission | Why |
|---|---|
| `VIBRATE` | Page-turn and find-selection feedback |
| `MANAGE_EXTERNAL_STORAGE` | "Scan Phone" can only see EPUBs and PDFs in Downloads and at the storage root with All files access — MediaStore does not index them and the SAF picker will not hand out those locations |
| `READ_EXTERNAL_STORAGE` | Android 10 and below |

All files access is requested with an explanation and only ever reads file names
and paths already on the device; nothing is uploaded. "Not now" is remembered —
Settings has an explicit row to ask again.

### Reading comfort
- **Edge brightness** — swipe up or down on either 44dp screen edge to dim or
  brighten the page. A pill follows the gesture and hides after two seconds. The
  overlay is `box-none` and only its two edge zones can become the touch
  responder, so it never intercepts a page turn or a tap.
- **Keep Screen Awake** — `plugins/withLiruneScreen.js` installs a
  `LiruneScreen` Kotlin module that sets `FLAG_KEEP_SCREEN_ON` on the reader
  window. A window flag needs no permission and the system drops it when the
  window goes away, so leaving the book always releases it. On by default, with a
  toggle in *Appearance → Reading Comfort*.
- **Page margins** — default to Standard (20px); Compact (12px) and Wide (28px)
  are one tap away in the same panel.

Both comfort values live in `readerSettings` and are persisted like every other
reader setting. Neither is part of the rendered-document geometry, so dimming the
page never re-renders the WebView or moves the reading position.

### Native module and config plugins
`android/` is generated by `expo prebuild` and is git-ignored, so everything that
has to survive a regeneration lives in `plugins/`:

| Plugin | Purpose |
|---|---|
| `withLiruneStorage` | Copies the `LiruneStorage` Kotlin sources from `plugins/native/lirune-storage/` and registers the package in `MainApplication.kt` |
| `withLiruneScreen` | Copies the `LiruneScreen` Kotlin sources from `plugins/native/lirune-screen/` and registers the package in `MainApplication.kt` — window flags for the reader ("Keep Screen Awake") |
| `withCutoutMode` | `windowLayoutInDisplayCutoutMode=shortEdges` so landscape can use the cutout area while insets keep text out of it |
| `withAndroidConfigChanges` | Adds `density` and `fontScale` so a font-size or fold change re-lays out instead of recreating the reader |
| `withReleaseSigning` | Release signing config from `~/.gradle/gradle.properties` |

If `LiruneStorage` is missing from a build, `NativeStorageBridge` logs an error at
startup and the Files screen says so instead of showing an empty scan.

### Release signing
Credentials live in `~/.gradle/gradle.properties` (never in the repository):
```
LIRUNE_RELEASE_STORE_FILE=/absolute/path/to/lirune-release.jks
LIRUNE_RELEASE_STORE_PASSWORD=…
LIRUNE_RELEASE_KEY_ALIAS=…
LIRUNE_RELEASE_KEY_PASSWORD=…
```
`LIRUNE_UPLOAD_*` is accepted as well. Without them, Gradle keeps its own default
and the APK is signed with the debug key — such a build cannot upgrade an
installed release.